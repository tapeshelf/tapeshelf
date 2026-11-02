import {
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
} from 'node:http';
import { pathToFileURL } from 'node:url';

/**
 * A stand-in for Paddle's API (.env.test: PADDLE_API_URL=http://127.0.0.1:3399): the two catalog
 * prices, customer portal sessions, subscription cancels and their reversal, with every call recorded. Backend e2e
 * suites start it in-process; Playwright runs this file (`npx tsx test/utils/paddle-stub.ts`).
 */
export const PADDLE_STUB_PORT = 3399;
const API_KEY = 'pdl_sdbx_apikey_test';

const PRICES: Record<string, { amount: string; interval: string }> = {
  pri_month: { amount: '999', interval: 'month' },
  pri_year: { amount: '5999', interval: 'year' },
};

export interface PaddleStubCall {
  method: string;
  path: string;
  body: unknown;
}

export interface PaddleStub {
  calls: PaddleStubCall[];
  /** Status that GET /subscriptions/:id reports (default active). */
  statuses: Map<string, string>;
  /** Subscriptions with a cancel scheduled for the end of the period. */
  scheduled: Set<string>;
  close(): Promise<void>;
}

export async function startPaddleStub(
  port = PADDLE_STUB_PORT,
): Promise<PaddleStub> {
  const calls: PaddleStubCall[] = [];
  const statuses = new Map<string, string>();
  const scheduled = new Set<string>();
  const server: Server = createServer((req, res) => {
    void handle(req, res, calls, statuses, scheduled);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    calls,
    statuses,
    scheduled,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  calls: PaddleStubCall[],
  statuses: Map<string, string>,
  scheduled: Set<string>,
): Promise<void> {
  /** A subscription as the API returns it: its status and a scheduled cancel, if any. */
  const subscription = (id: string) => ({
    id,
    status: statuses.get(id) ?? 'active',
    scheduled_change: scheduled.has(id)
      ? { action: 'cancel', effective_at: '2099-01-01T00:00:00Z' }
      : null,
  });
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  const body: unknown = text ? JSON.parse(text) : null;
  const path = (req.url ?? '').split('?')[0]!;
  const method = req.method ?? 'GET';
  const send = (status: number, payload: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  };
  if (path === '/health') return send(200, { ok: true });
  // Public, like Paddle's. Everything in the tests comes from this computer.
  if (path === '/ips')
    return send(200, {
      data: { ipv4_cidrs: ['127.0.0.1/32'], ipv6_cidrs: ['::1/128'] },
    });
  calls.push({ method, path, body });
  if (req.headers.authorization !== `Bearer ${API_KEY}`)
    return send(403, { error: { code: 'forbidden', detail: 'bad key' } });

  let m: RegExpMatchArray | null;
  if (method === 'GET' && (m = path.match(/^\/prices\/([^/]+)$/))) {
    const price = PRICES[m[1]!];
    if (!price) return send(404, { error: { code: 'entity_not_found' } });
    return send(200, {
      data: {
        id: m[1],
        unit_price: { amount: price.amount, currency_code: 'EUR' },
        billing_cycle: { interval: price.interval, frequency: 1 },
      },
    });
  }
  if (
    method === 'POST' &&
    (m = path.match(/^\/customers\/([^/]+)\/portal-sessions$/))
  ) {
    const ids = ((body as { subscription_ids?: string[] })?.subscription_ids ??
      []) as string[];
    return send(201, {
      data: {
        id: 'cpls_stub',
        customer_id: m[1],
        urls: {
          general: {
            overview: `https://customer-portal.paddle.test/${m[1]}/overview`,
          },
          subscriptions: ids.map((id) => ({
            id,
            cancel_subscription: `https://customer-portal.paddle.test/${id}/cancel`,
            update_subscription_payment_method: `https://customer-portal.paddle.test/${id}/payment`,
          })),
        },
      },
    });
  }
  if (method === 'GET' && (m = path.match(/^\/subscriptions\/([^/]+)$/)))
    return send(200, { data: subscription(m[1]!) });
  if (
    method === 'POST' &&
    (m = path.match(/^\/subscriptions\/([^/]+)\/cancel$/))
  ) {
    const when = (body as { effective_from?: string })?.effective_from;
    if (when === 'next_billing_period') scheduled.add(m[1]!);
    else statuses.set(m[1]!, 'canceled');
    return send(200, { data: subscription(m[1]!) });
  }
  if (method === 'PATCH' && (m = path.match(/^\/subscriptions\/([^/]+)$/))) {
    if ((body as { scheduled_change?: unknown })?.scheduled_change === null)
      scheduled.delete(m[1]!);
    return send(200, { data: subscription(m[1]!) });
  }
  return send(404, { error: { code: 'not_found' } });
}

// `npx tsx test/utils/paddle-stub.ts`: run on its own until stopped (the Playwright stack).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void startPaddleStub().then(() =>
    console.log(`Paddle stub on :${PADDLE_STUB_PORT}`),
  );
