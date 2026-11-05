import { dateLocale, t } from '../../common/i18n/i18n.js';
import type { NotificationType } from '../../generated/prisma/enums.js';
import { type RenderedMail, layout } from '../../infra/mail/templates.js';
import { formatBytes } from '../processing/contact-sheet.js';

const RULES = new Set([
  'SPAM',
  'ILLEGAL',
  'COPYRIGHT',
  'ABUSE',
  'UNMARKED_ADULT',
  'OTHER',
]);

const SUPPORT_TOPICS = new Set(['QUESTION', 'BUG', 'ACCOUNT', 'IDEA']);

const FAIL_REASONS = new Set([
  'corrupted',
  'noVideoStream',
  'zeroDuration',
  'tooLong',
  'tooLarge',
  'fpsTooHigh',
  'tooManyStreams',
  'transcodeFailed',
  'internal',
  'blocked',
]);

/**
 * Email for a notification: subject/title/body per type in the recipient's locale,
 * a button to the object, and the "manage notifications" note. Returns null for types without a template.
 */
export interface MailLinks {
  publicUrl: string;
  /** Recipient's username (their own page). */
  username: string;
  /** Operator's contact (CONTACT_EMAIL), for those who disagree with a removal. */
  contactEmail?: string | null;
  /** The page that stops this kind of email for this person; none = no such line. */
  unsubscribeUrl?: string | null;
}

export function renderNotificationMail(
  locale: string,
  type: NotificationType,
  payload: Record<string, unknown>,
  links: MailLinks,
): RenderedMail | null {
  const publicUrl = links.publicUrl.replace(/\/$/, '');
  const base = `mail.notifications.${type}`;
  const str = (key: string) =>
    typeof payload[key] === 'string' ? (payload[key] as string) : '';
  // Short code when the payload has it; older notifications go through the /v/<id> redirect.
  const videoUrl = str('videoCode')
    ? `${publicUrl}/${str('videoCode')}`
    : str('videoId')
      ? `${publicUrl}/v/${str('videoId')}`
      : null;
  let vars: Record<string, unknown>;
  let url: string | null;
  let bodyKey = 'body';
  /** Paragraphs after the body. */
  let extra: string[] = [];
  switch (type) {
    case 'NEW_FOLLOWER':
      vars = { name: str('fromName') };
      url = `${publicUrl}/@${str('fromUsername')}`;
      break;
    case 'FRIEND_ACCEPTED':
      vars = { name: str('withName') };
      url = `${publicUrl}/@${str('withUsername')}`;
      break;
    case 'FOLLOWED_NEW_VIDEO':
      vars = { name: str('authorName'), title: str('title') };
      url = videoUrl;
      if (payload['private'] === true) bodyKey = 'bodyPrivate';
      break;
    case 'NEW_MESSAGE':
      vars = { name: str('fromName'), preview: str('preview') };
      url = `${publicUrl}/messages/${str('fromUsername')}`;
      if (!str('preview')) bodyKey = 'bodyVideo';
      break;
    case 'VIDEO_PROCESSED':
    case 'VIDEO_EDITED':
      vars = { title: str('title') };
      url = videoUrl;
      break;
    case 'VIDEO_EDIT_FAILED':
      vars = { title: str('title') };
      url = str('videoId') ? `${publicUrl}/edit/${str('videoId')}` : null;
      break;
    case 'VIDEO_FAILED': {
      const code = FAIL_REASONS.has(str('reason')) ? str('reason') : 'internal';
      vars = {
        title: str('title'),
        reason: t(locale, `notifications.failReason.${code}`),
      };
      url = `${publicUrl}/@${links.username}`;
      break;
    }
    case 'VIDEO_REMOVED':
      vars = {
        title: str('title'),
        author:
          payload['anonymous'] === true
            ? t(locale, 'mail.notifications.anonymous')
            : str('authorName'),
      };
      url = `${publicUrl}/notifications`;
      break;
    case 'REPORT_RESOLVED':
      vars = { title: str('title') };
      url = `${publicUrl}/notifications`;
      bodyKey =
        str('outcome') === 'noViolation'
          ? `body${str('targetType') === 'USER' ? 'User' : 'Video'}None`
          : `body${str('targetType') === 'USER' ? 'User' : 'Video'}`;
      break;
    case 'ADMIN_NOTICE':
      vars = { message: str('message') };
      url = `${publicUrl}/notifications`;
      break;
    case 'SUPPORT_REPLY':
      vars = {
        number: payload['number'] ?? '',
        subject: str('subject'),
        preview: str('preview'),
      };
      url = `${publicUrl}/support/${str('ticketId')}`;
      if (payload['resolved'] === true)
        bodyKey = str('preview') ? 'bodyResolvedWith' : 'bodyResolved';
      break;
    case 'SUPPORT_TICKET': {
      const topic = SUPPORT_TOPICS.has(str('topic'))
        ? str('topic')
        : 'QUESTION';
      vars = {
        number: payload['number'] ?? '',
        subject: str('subject'),
        preview: str('preview'),
        name: str('fromUsername'),
        topic: t(locale, `mail.supportTopics.${topic}`),
      };
      url = `${publicUrl}/admin/support/${str('ticketId')}`;
      if (payload['created'] !== true) bodyKey = 'bodyReply';
      break;
    }
    case 'LINK_OPENED':
    case 'LINK_SAVED':
      vars = {
        name: str('fromUsername'),
        title: str('title'),
        count: typeof payload['count'] === 'number' ? payload['count'] : 1,
      };
      url = `${publicUrl}/links`;
      if (type === 'LINK_OPENED' && !str('fromUsername')) bodyKey = 'bodyGuest';
      break;
    case 'VIDEO_TAKEN_DOWN': {
      const rule = RULES.has(str('rule')) ? str('rule') : 'OTHER';
      vars = {
        title: str('title'),
        rule: t(locale, `mail.takedownRules.${rule}`),
      };
      url = `${publicUrl}/notifications`;
      extra = [
        ...(str('message')
          ? [t(locale, `${base}.message`, { message: str('message') })]
          : []),
        ...(links.contactEmail
          ? [t(locale, `${base}.appeal`, { email: links.contactEmail })]
          : []),
      ];
      break;
    }
    case 'PLAN_EXPIRING':
      vars = { date: formatUtc(locale, str('until')) };
      url = `${publicUrl}/settings/plan`;
      if (payload['pageHidden'] === true) extra = [t(locale, `${base}.page`)];
      if (payload['anonymousLinks'] === true)
        extra = [...(extra ?? []), t(locale, `${base}.anonymousLinks`)];
      break;
    case 'PLAN_PAYMENT_FAILED':
      vars = { date: formatUtc(locale, str('until')) };
      url = `${publicUrl}/settings/plan`;
      break;
    // The month's traffic: four fifths spent, and all of it.
    case 'TRAFFIC_RUNNING_OUT':
      vars = {
        used: formatBytes(Number(payload['usedBytes'] ?? 0)),
        limit: formatBytes(Number(payload['limitBytes'] ?? 0)),
        date: formatUtc(locale, str('resetAt')),
      };
      url = `${publicUrl}/settings/plan`;
      break;
    case 'TRAFFIC_USED_UP':
      vars = {
        limit: formatBytes(Number(payload['limitBytes'] ?? 0)),
        date: formatUtc(locale, str('resetAt')),
      };
      url = `${publicUrl}/settings/plan`;
      break;
    case 'PLAN_EXPIRED':
      vars = {
        file: formatBytes(Number(payload['maxFileBytes'] ?? 0)),
        shelf: formatBytes(Number(payload['storageQuotaBytes'] ?? 0)),
      };
      url = `${publicUrl}/settings/plan`;
      if (payload['overQuota'] === true) bodyKey = 'bodyOverQuota';
      if (payload['pageReopened'] === true) extra = [t(locale, `${base}.page`)];
      if (payload['anonymousLinks'] === true)
        extra = [...(extra ?? []), t(locale, `${base}.anonymousLinks`)];
      break;
    case 'REQUEST_RECEIVED':
    case 'REQUEST_SHARED':
    case 'REQUEST_DECLINED':
    case 'REQUEST_CANCELLED':
    case 'OFFER_RECEIVED':
    case 'EXCHANGE_COMPLETED':
    case 'REQUEST_INVALIDATED': {
      const count =
        typeof payload['count'] === 'number' ? (payload['count'] as number) : 1;
      vars = {
        // A guest has no name: "Guest" in the reader's language.
        name:
          payload['guest'] === true
            ? t(locale, 'mail.notifications.guest')
            : payload['anonymous'] === true
              ? t(locale, 'mail.notifications.anonymous')
              : str('fromName') || str('withName'),
        title: str('title'),
        count,
        comment: str('comment'),
        round: payload['round'] ?? 0,
        received: payload['received'] ?? 0,
        given: payload['given'] ?? 0,
      };
      url = str('requestId')
        ? `${publicUrl}/exchange/${str('requestId')}`
        : `${publicUrl}/exchange`;
      // What came lands in "From others" on the own shelf: the letter leads there.
      if (type === 'REQUEST_SHARED' || type === 'EXCHANGE_COMPLETED')
        url = `${publicUrl}/@${links.username}?folder=others`;
      if (type === 'REQUEST_INVALIDATED' && str('reason') === 'accountClosed')
        bodyKey = 'bodyClosed';
      if (type === 'REQUEST_INVALIDATED' && str('reason') === 'expired')
        bodyKey = 'bodyExpired';
      // An offer says what it is; older events without its titles keep the plain wording.
      if (type === 'OFFER_RECEIVED' && str('gives') && str('wants')) {
        const more = (n: unknown) =>
          typeof n === 'number' && n > 0
            ? t(locale, 'mail.notifications.andMore', { count: n })
            : '';
        bodyKey = 'bodyDeal';
        vars = {
          ...vars,
          gives: str('gives'),
          wants: str('wants'),
          givesMore: more(payload['givesMore']),
          wantsMore: more(payload['wantsMore']),
        };
      }
      // The reason people ask is in their message: it travels with the notification.
      if (
        (type === 'REQUEST_RECEIVED' || type === 'OFFER_RECEIVED') &&
        str('message')
      )
        extra = [t(locale, `${base}.message`, { message: str('message') })];
      // A request that offers something in return from the start says so.
      if (
        type === 'REQUEST_RECEIVED' &&
        typeof payload['offered'] === 'number' &&
        payload['offered'] > 0
      )
        extra = [
          t(locale, `${base}.offered`, { count: payload['offered'] }),
          ...extra,
        ];
      if (
        type === 'REQUEST_DECLINED' &&
        typeof payload['cooldownDays'] === 'number' &&
        payload['cooldownDays'] > 0
      )
        extra = [
          t(locale, `${base}.again`, { count: payload['cooldownDays'] }),
        ];
      break;
    }
    default:
      return null;
  }
  const title = t(locale, `${base}.title`, vars);
  const body = t(locale, `${base}.${bodyKey}`, vars);
  const button = t(locale, `${base}.button`);
  const manageLine = t(locale, 'mail.notifications.manage', {
    url: `${publicUrl}/settings/notifications`,
  });
  const manage = links.unsubscribeUrl
    ? `${t(locale, 'mail.notifications.unsubscribe', { url: links.unsubscribeUrl })} ${manageLine}`
    : manageLine;
  return {
    subject: t(locale, `${base}.subject`, vars),
    html: layout(
      locale,
      title,
      [body, ...extra],
      url ? { label: button, url } : undefined,
      manage,
    ),
    text: `${title}\n\n${[body, ...extra].join('\n\n')}\n\n${url ? `${button}: ${url}\n\n` : ''}${manage}`,
  };
}

/** A moment in the recipient's language, in UTC (the email does not know their time zone). */
export function formatUtc(locale: string, iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(dateLocale(locale), {
    dateStyle: 'long',
    timeStyle: 'short',
    hourCycle: 'h23',
    timeZone: 'UTC',
  }).format(date);
}
