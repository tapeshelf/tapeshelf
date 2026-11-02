import { createHmac } from 'node:crypto';

import { type Browser, type Page, expect, test } from '@playwright/test';

import { audit } from './a11y';
import { newUser, registerAndVerify } from './account';

/** backend/.env.test: the webhook secret of the fake Paddle account. */
const WEBHOOK_SECRET = 'pdl_ntfset_test_secret';

/**
 * Paddle.js stand-in: the real one loads from Paddle's CDN. It records the checkout it was asked
 * to open and reports it completed, as the overlay would after a test card. Like the real one, it
 * opens the checkout of a payment link (`?_ptxn=`) by itself, with the page's checkout settings.
 */
const FAKE_PADDLE_JS = `
window.PaddleBillingV1 = {
  Initialized: false,
  Environment: { set(env) { window.__paddleEnv = env; } },
  Initialize(options) {
    this.Initialized = true;
    window.__paddleOptions = options;
    const transactionId = new URLSearchParams(location.search).get('_ptxn');
    if (transactionId) window.__checkout = { transactionId, settings: options.checkout.settings };
  },
  Update(options) { window.__paddleOptions = options; },
  Checkout: {
    open(options) {
      window.__checkout = JSON.parse(JSON.stringify(options));
      setTimeout(() => window.__paddleOptions.eventCallback({ name: 'checkout.completed', data: {} }), 50);
    },
    close() { window.__checkoutClosed = true; },
  },
};`;

async function freshPage(browser: Browser): Promise<Page> {
  return (await browser.newContext({ locale: 'en-US' })).newPage();
}

/** Design-review screenshots, only with VS_SHOTS_DIR. */
async function shot(p: Page, name: string): Promise<void> {
  const dir = process.env['VS_SHOTS_DIR'];
  if (dir) await p.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

/** What Paddle posts once the subscription exists, signed with the destination's secret. */
async function paddleWebhook(page: Page, userId: string, subscriptionId: string): Promise<void> {
  const now = Date.now();
  const raw = JSON.stringify({
    event_id: `evt_${subscriptionId}`,
    event_type: 'subscription.created',
    occurred_at: new Date(now).toISOString(),
    data: {
      id: subscriptionId,
      status: 'active',
      customer_id: 'ctm_e2e',
      current_billing_period: {
        starts_at: new Date(now).toISOString(),
        ends_at: new Date(now + 365 * 24 * 3600 * 1000).toISOString(),
      },
      billing_cycle: { interval: 'year', frequency: 1 },
      scheduled_change: null,
      items: [{ price: { id: 'pri_year' } }],
      custom_data: { userId },
    },
  });
  const ts = Math.floor(now / 1000);
  const h1 = createHmac('sha256', WEBHOOK_SECRET).update(`${ts}:${raw}`).digest('hex');
  const res = await page.request.post('/api/billing/webhook', {
    headers: { 'Content-Type': 'application/json', 'Paddle-Signature': `ts=${ts};h1=${h1}` },
    data: raw,
  });
  expect(res.status()).toBe(200);
}

/**
 * the Pro page leads with the yearly price, switches to monthly, opens
 * Paddle's checkout for the signed-in account, and turns Pro when Paddle's webhook arrives; the
 * plan tab then manages the subscription in Paddle's portal and the shelf shows the Pro badge.
 */
test('Pro: yearly first, checkout for this account, Pro after the webhook, portal', async ({
  browser,
}) => {
  const user = newUser('pro');
  const page = await freshPage(browser);
  await page.route('https://cdn.paddle.com/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: FAKE_PADDLE_JS }),
  );
  await page.route('https://customer-portal.paddle.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>Paddle portal</title>' }),
  );
  await registerAndVerify(page, user);
  const me = (await (await page.request.get('/api/auth/me')).json()) as { id: string };

  await page.goto('/settings/plan');
  await page.getByTestId('plan-upgrade').click();
  await expect(page).toHaveURL(/\(panel:pro\)$/);
  await expect(page).toHaveTitle('Pro · tapeshelf');

  await expect(page.getByTestId('pro-price')).toHaveText('€5/month');
  await expect(page.getByTestId('pro-billed')).toHaveText('billed €59.99 a year');
  await expect(page.getByTestId('pro-savings')).toHaveText('save 50 % (€59.89) against monthly');
  await expect(page.getByTestId('pro-year')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('pro-compare')).toContainText('up to 5.0 GB');
  await shot(page, 'pro-01-yearly');
  await audit(page, 'pro page');

  await page.getByTestId('pro-month').click();
  await expect(page.getByTestId('pro-price')).toHaveText('€9.99/month');
  await expect(page.getByTestId('pro-billed')).toHaveText('billed every month');
  await expect(page.getByTestId('pro-savings')).toHaveCount(0);
  await page.getByTestId('pro-year').click();

  await page.getByTestId('pro-buy').click();
  await expect(page.getByTestId('pro-activating')).toBeVisible();
  const checkout = await page.evaluate(
    () => (window as unknown as { __checkout: unknown }).__checkout,
  );
  expect(checkout).toMatchObject({
    items: [{ priceId: 'pri_year', quantity: 1 }],
    customer: { email: user.email },
    customData: { userId: me.id },
    settings: { displayMode: 'overlay', locale: 'en', allowLogout: false },
  });

  await paddleWebhook(page, me.id, `sub_${user.username}`);
  // Pro is on: Paddle's window closes, the own shelf opens and says what Pro brings.
  const welcome = page.getByTestId('pro-welcome');
  await expect(welcome).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(`/@${user.username}`);
  expect(
    await page.evaluate(
      () => (window as unknown as { __checkoutClosed?: boolean }).__checkoutClosed,
    ),
  ).toBe(true);
  await expect(welcome).toContainText('Pro is on');
  await expect(welcome).toContainText('Videos up to 5.0 GB');
  await expect(welcome).toContainText('The video editor');
  await expect(welcome).toContainText('90 days to change your mind');
  await shot(page, 'pro-02-welcome');
  await audit(page, 'pro welcome');
  await welcome.getByTestId('pro-welcome-close').click();
  await expect(welcome).toHaveCount(0);
  await expect(page.getByTestId('profile-pro')).toHaveText('Pro');
  // No more offers of Pro in the account menu.
  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByTestId('nav-pro')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.goto('/pro');
  await expect(page.getByTestId('pro-subscription')).toContainText('Subscription: yearly');

  await page.goto('/settings/plan');
  await expect(page.getByTestId('plan-tier')).toHaveText('Pro');
  await expect(page.getByTestId('plan-subscription')).toContainText('next payment on');
  await expect(page.getByTestId('plan-file')).toHaveText('up to 5.0 GB');
  await page.getByTestId('plan-manage').click();
  await expect(page).toHaveURL('https://customer-portal.paddle.test/ctm_e2e/overview');

  await page.goto(`/@${user.username}`);
  await expect(page.getByTestId('profile-pro')).toHaveText('Pro');
});

/**
 * Paddle's links (the account's default payment link follow-up) land on /pro with
 * `?_ptxn=`: Paddle.js opens that transaction's checkout with the page's look. When Paddle refuses
 * to open a checkout, its overlay only says "something went wrong"; the page shows Paddle's reason.
 */
test('Pro: a Paddle payment link opens its checkout; a refusal shows the reason', async ({
  browser,
}) => {
  const user = newUser('ptxn');
  const page = await freshPage(browser);
  await page.route('https://cdn.paddle.com/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: FAKE_PADDLE_JS }),
  );
  await registerAndVerify(page, user);
  // A slow dictionary on a fresh load: the comparison is built in code and must still read texts.
  await page.route('**/i18n/en.json', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });

  await page.goto('/pro?_ptxn=txn_e2e');
  await expect(page.getByTestId('pro-compare')).toContainText('up to 5.0 GB');
  await expect(page.getByTestId('pro-compare')).not.toContainText('pro.');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __checkout?: unknown }).__checkout))
    .toMatchObject({
      transactionId: 'txn_e2e',
      settings: { displayMode: 'overlay', locale: 'en', allowLogout: false },
    });

  // What the real Paddle.js reports when the account has no default payment link.
  await page.evaluate(() =>
    (
      window as unknown as {
        __paddleOptions: { eventCallback: (event: Record<string, string>) => void };
      }
    ).__paddleOptions.eventCallback({
      name: 'checkout.error',
      type: 'api_error',
      code: 'validation',
      detail: 'transaction_default_checkout_url_not_set',
    }),
  );
  await expect(page.getByTestId('pro-checkout-error')).toContainText(
    'Paddle could not open the checkout: “transaction_default_checkout_url_not_set”',
  );

  // A new attempt starts clean.
  await page.getByTestId('pro-buy').click();
  await expect(page.getByTestId('pro-checkout-error')).toHaveCount(0);
});
