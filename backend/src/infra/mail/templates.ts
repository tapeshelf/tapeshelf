import { siteName, t } from '../../common/i18n/i18n.js';

/** Wordmark (the instance name) over a short orange shelf; plain cells so every mail client draws it the same. */
const brand = (esc: (s: string) => string) =>
  `<p style="margin:0 0 6px;font-size:20px;font-weight:800;letter-spacing:-0.02em;color:#171717">${esc(siteName())}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px"><tr><td style="width:44px;height:4px;background:#fc753e;font-size:0;line-height:0">&nbsp;</td></tr></table>`;

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

export function layout(
  locale: string,
  title: string,
  paragraphs: string[],
  button?: { label: string; url: string },
  footerNote?: string,
  /** Instead of "an account was created with this address": a mail to someone without one. */
  footer?: string,
): RenderedMail['html'] {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#171717">${esc(p)}</p>`,
    )
    .join('');
  const btn = button
    ? `<p style="margin:24px 0"><a href="${button.url}" style="display:inline-block;background:#fc753e;color:#171717;border:2px solid #171717;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:6px">${esc(button.label)}</a></p>
       <p style="margin:0 0 16px;font-size:12px;color:#5f625d;word-break:break-all">${esc(button.url)}</p>`
    : '';
  const note = footerNote
    ? `<p style="margin:0 0 16px;font-size:13px;color:#5f625d">${esc(footerNote)}</p>`
    : '';
  return `<!doctype html><html lang="${locale}"><body style="margin:0;background:#f4f3ee;font-family:Segoe UI,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:2px solid #171717;border-radius:10px"><tr><td style="padding:32px">
${brand(esc)}
<h1 style="margin:0 0 16px;font-size:22px;color:#171717">${esc(title)}</h1>
${body}${btn}${note}
<p style="margin:24px 0 0;font-size:12px;color:#8f928c">${esc(footer ?? t(locale, 'mail.footer'))}</p>
</td></tr></table></td></tr></table></body></html>`;
}

export function renderVerifyEmail(
  locale: string,
  vars: { name: string; link: string },
): RenderedMail {
  const title = t(locale, 'mail.verify.title', { name: vars.name });
  const body = t(locale, 'mail.verify.body');
  const button = t(locale, 'mail.verify.button');
  const expires = t(locale, 'mail.verify.expires');
  return {
    subject: t(locale, 'mail.verify.subject'),
    html: layout(
      locale,
      title,
      [body],
      { label: button, url: vars.link },
      expires,
    ),
    text: `${title}\n\n${body}\n\n${button}: ${vars.link}\n\n${expires}`,
  };
}

export function renderPasswordReset(
  locale: string,
  vars: { name: string; link: string },
): RenderedMail {
  const title = t(locale, 'mail.reset.title');
  const body = t(locale, 'mail.reset.body', { name: vars.name });
  const button = t(locale, 'mail.reset.button');
  const expires = t(locale, 'mail.reset.expires');
  return {
    subject: t(locale, 'mail.reset.subject'),
    html: layout(
      locale,
      title,
      [body],
      { label: button, url: vars.link },
      expires,
    ),
    text: `${title}\n\n${body}\n\n${button}: ${vars.link}\n\n${expires}`,
  };
}

/** What a guest hears about their deal: the address confirmed, the other side's moves. */
export type GuestDealMailKind =
  'saved' | 'offer' | 'accepted' | 'shared' | 'declined' | 'closed' | 'expired';

/**
 * A mail to a guest about their deal: no account, so no "an account was created" footer;
 * the button leads back to the deal with the guest's key.
 */
export function renderGuestDealMail(
  locale: string,
  vars: { kind: GuestDealMailKind; name: string; link: string },
): RenderedMail {
  const key = `mail.guestDeal.${vars.kind}`;
  const title = t(locale, `${key}.title`);
  const body = t(locale, `${key}.body`, { name: vars.name });
  const button = t(locale, 'mail.guestDeal.button');
  const footer = t(locale, 'mail.guestDeal.footer');
  return {
    subject: t(locale, `${key}.subject`, { name: vars.name }),
    html: layout(
      locale,
      title,
      [body],
      { label: button, url: vars.link },
      undefined,
      footer,
    ),
    text: `${title}\n\n${body}\n\n${button}: ${vars.link}\n\n${footer}`,
  };
}

/**
 * A change to the two-step sign-in: turned on or off, reset by an admin, a recovery
 * code spent. Always sent, notification settings aside: it may be someone else's doing.
 */
export function renderTwoFactorNotice(
  locale: string,
  vars: {
    name: string;
    kind: 'on' | 'off' | 'reset' | 'recoveryUsed';
    left?: number;
    link: string;
  },
): RenderedMail {
  const key = `mail.twoFactor.${vars.kind}`;
  const title = t(locale, `${key}.title`);
  const body = t(locale, `${key}.body`, {
    name: vars.name,
    left: vars.left ?? 0,
  });
  const button = t(locale, 'mail.twoFactor.button');
  const note = t(locale, 'mail.twoFactor.notYou');
  return {
    subject: t(locale, `${key}.subject`),
    html: layout(
      locale,
      title,
      [body],
      { label: button, url: vars.link },
      note,
    ),
    text: `${title}\n\n${body}\n\n${button}: ${vars.link}\n\n${note}`,
  };
}

/**
 * A temporary link for one address: who sends what, until when, and that the page
 * asks for a code sent to this address.
 */
export function renderLinkInvite(
  locale: string,
  vars: {
    name: string;
    username: string;
    count: number;
    title: string;
    date: string;
    link: string;
  },
): RenderedMail {
  const title = t(locale, 'mail.links.invite.title', { name: vars.name });
  const body = t(locale, 'mail.links.invite.body', vars);
  const how = t(locale, 'mail.links.invite.how', { date: vars.date });
  const button = t(locale, 'mail.links.invite.button');
  const footer = t(locale, 'mail.links.footer', { username: vars.username });
  return {
    subject: t(locale, 'mail.links.invite.subject', vars),
    html: layout(
      locale,
      title,
      [body, how],
      { label: button, url: vars.link },
      undefined,
      footer,
    ),
    text: `${title}\n\n${body}\n\n${how}\n\n${button}: ${vars.link}\n\n${footer}`,
  };
}

/** The code that opens a temporary link for one address. */
export function renderLinkCode(
  locale: string,
  vars: { username: string; code: string },
): RenderedMail {
  const title = t(locale, 'mail.links.code.title', { code: vars.code });
  const body = t(locale, 'mail.links.code.body', { username: vars.username });
  const expires = t(locale, 'mail.links.code.expires');
  const footer = t(locale, 'mail.links.footer', { username: vars.username });
  return {
    subject: t(locale, 'mail.links.code.subject', { code: vars.code }),
    html: layout(locale, title, [body], undefined, expires, footer),
    text: `${title}\n\n${body}\n\n${expires}\n\n${footer}`,
  };
}
