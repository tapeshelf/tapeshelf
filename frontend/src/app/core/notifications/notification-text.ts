import { type NotificationDto } from '../../api';
import { formatBytes } from '../../shared/pipes/bytes.pipe';
import { profileLink, videoLink } from '../navigation/user-links';
import { panelLink } from '../navigation/panels';

export interface NotificationView {
  /** Transloco key under `notifications.text`. */
  key: string;
  params: Record<string, unknown>;
  /** Names of params whose values are dictionary keys (translated before use). */
  keyParams?: string[];
  /** Router link for the whole item, if the object still exists for the viewer. */
  link: unknown[] | null;
  /** Query of that link (a folder of the own shelf). */
  query?: Record<string, string>;
  icon: 'ready' | 'failed' | 'removed' | 'generic' | 'social' | 'message' | 'admin';
}

/** Variants of "a request was closed by the system" by reason. */
const INVALIDATED_SUFFIX: Record<string, string> = {
  reset: '_reset',
  accountClosed: '_closed',
  // A deal with a guest ran out.
  expired: '_expired',
};

/**
 * Which wording of a request notification: why it closed; what an offer gives for what (older
 * notifications have no titles); when the requester may ask again; whether the sender wrote something.
 */
function requestSuffix(type: string, p: Record<string, unknown>): string {
  if (type === 'REQUEST_INVALIDATED') return INVALIDATED_SUFFIX[str(p, 'reason')] ?? '';
  if (type === 'REQUEST_DECLINED') return num(p, 'cooldownDays') > 0 ? '_again' : '';
  const deal =
    type === 'OFFER_RECEIVED' && str(p, 'gives') && str(p, 'wants')
      ? '_deal'
      : type === 'REQUEST_RECEIVED' && num(p, 'offered') > 0
        ? '_offer' // an offer from the start
        : '';
  if ((type === 'REQUEST_RECEIVED' || type === 'OFFER_RECEIVED') && str(p, 'message'))
    return `${deal}_message`;
  return deal;
}

const str = (payload: Record<string, unknown>, key: string): string =>
  typeof payload[key] === 'string' ? (payload[key] as string) : '';

const num = (payload: Record<string, unknown>, key: string, fallback = 0): number =>
  typeof payload[key] === 'number' ? (payload[key] as number) : fallback;

/** What was received lands in the "From others" folder of the own shelf (home leads there, U11). */
const RECEIVED = { link: ['/'], query: { folder: 'others' } };

/** What a notification says and where it leads (the backend only stores type + payload). */
export function describeNotification(n: NotificationDto): NotificationView {
  const p = n.payload ?? {};
  switch (n.type) {
    case 'VIDEO_PROCESSED':
      return {
        key: 'notifications.text.VIDEO_PROCESSED',
        params: { title: str(p, 'title') },
        link: videoTarget(p),
        icon: 'ready',
      };
    case 'VIDEO_FAILED':
      return {
        key: 'notifications.text.VIDEO_FAILED',
        params: { title: str(p, 'title') },
        // "Open it on your page to see why": the own shelf (home leads there), where the tile says it.
        link: ['/'],
        icon: 'failed',
      };
    case 'VIDEO_REMOVED':
      return {
        key: 'notifications.text.VIDEO_REMOVED',
        // An author known by an anonymous link without a name: "Anonymous".
        params: {
          title: str(p, 'title'),
          author: p['anonymous'] === true ? 'common.anonymous' : str(p, 'authorName'),
        },
        ...(p['anonymous'] === true ? { keyParams: ['author'] } : {}),
        link: null,
        icon: 'removed',
      };
    case 'NEW_FOLLOWER':
      return {
        key: 'notifications.text.NEW_FOLLOWER',
        params: { name: str(p, 'fromName') },
        link: str(p, 'fromUsername') ? profileLink(str(p, 'fromUsername')) : null,
        icon: 'social',
      };
    case 'FRIEND_ACCEPTED':
      return {
        key: 'notifications.text.FRIEND_ACCEPTED',
        params: { name: str(p, 'withName') },
        link: str(p, 'withUsername') ? profileLink(str(p, 'withUsername')) : null,
        icon: 'social',
      };
    case 'FOLLOWED_NEW_VIDEO':
      return {
        key: `notifications.text.FOLLOWED_NEW_VIDEO${p['private'] === true ? '_private' : ''}`,
        params: { name: str(p, 'authorName'), title: str(p, 'title') },
        link: videoTarget(p),
        icon: 'ready',
      };
    case 'NEW_MESSAGE': {
      const count = typeof p['count'] === 'number' ? p['count'] : 1;
      return {
        key:
          count > 1
            ? 'notifications.text.NEW_MESSAGE_many'
            : str(p, 'preview')
              ? 'notifications.text.NEW_MESSAGE'
              : 'notifications.text.NEW_MESSAGE_video',
        params: { name: str(p, 'fromName'), preview: str(p, 'preview'), count },
        link: str(p, 'fromUsername')
          ? panelLink('messages', str(p, 'fromUsername')!)
          : panelLink('messages'),
        icon: 'message',
      };
    }
    case 'REQUEST_RECEIVED':
    case 'OFFER_RECEIVED':
    case 'REQUEST_SHARED':
    case 'EXCHANGE_COMPLETED':
    case 'REQUEST_DECLINED':
    case 'REQUEST_CANCELLED':
    case 'REQUEST_INVALIDATED':
      return {
        key: `notifications.text.${n.type}${requestSuffix(n.type, p)}`,
        params: {
          // A guest has no name: "Guest" in the reader's language; nor has someone known by
          // an anonymous link without a name of its own: "Anonymous".
          name:
            p['guest'] === true
              ? 'common.guest'
              : p['anonymous'] === true
                ? 'common.anonymous'
                : str(p, 'fromName') || str(p, 'withName'),
          title: str(p, 'title'),
          count: num(p, 'count', 1),
          round: num(p, 'round'),
          received: num(p, 'received'),
          given: num(p, 'given'),
          comment: str(p, 'comment'),
          message: str(p, 'message'),
          gives: str(p, 'gives'),
          givesMore: num(p, 'givesMore'),
          wants: str(p, 'wants'),
          wantsMore: num(p, 'wantsMore'),
          days: num(p, 'cooldownDays'),
          offered: num(p, 'offered'),
        },
        ...(p['guest'] === true || p['anonymous'] === true ? { keyParams: ['name'] } : {}),
        // Shared or exchanged: to what came; the rest to the request's thread.
        ...((n.type === 'REQUEST_SHARED' || n.type === 'EXCHANGE_COMPLETED') &&
        num(p, 'received', 1) > 0
          ? RECEIVED
          : {
              link: str(p, 'requestId')
                ? panelLink('exchange', str(p, 'requestId')!)
                : panelLink('exchange'),
            }),
        icon:
          n.type === 'EXCHANGE_COMPLETED' || n.type === 'REQUEST_SHARED'
            ? 'ready'
            : n.type === 'REQUEST_DECLINED'
              ? 'failed'
              : 'generic',
      };
    case 'REPORT_RESOLVED':
      return {
        key: `notifications.text.REPORT_RESOLVED${str(p, 'outcome') === 'noViolation' ? '_none' : ''}`,
        params: { title: str(p, 'title') },
        link: null,
        icon: 'admin',
      };
    // Support: an answer or "solved" for the author, a new ticket or message for an admin.
    case 'SUPPORT_REPLY':
      return {
        key:
          p['resolved'] === true
            ? 'notifications.text.SUPPORT_REPLY_resolved'
            : 'notifications.text.SUPPORT_REPLY',
        params: { number: num(p, 'number'), subject: str(p, 'subject') },
        link: str(p, 'ticketId') ? panelLink('support', str(p, 'ticketId')) : panelLink('support'),
        icon: 'message',
      };
    case 'SUPPORT_TICKET':
      return {
        key:
          p['created'] === true
            ? 'notifications.text.SUPPORT_TICKET'
            : 'notifications.text.SUPPORT_TICKET_reply',
        params: {
          number: num(p, 'number'),
          subject: str(p, 'subject'),
          name: str(p, 'fromUsername'),
        },
        link: str(p, 'ticketId') ? ['/admin/support', str(p, 'ticketId')] : ['/admin/support'],
        icon: 'admin',
      };
    // Temporary links: opened for the first time, saved to someone's shelf.
    case 'LINK_OPENED':
      return {
        key: `notifications.text.LINK_OPENED${str(p, 'fromUsername') ? '' : '_guest'}`,
        params: { name: str(p, 'fromUsername'), title: str(p, 'title'), count: num(p, 'count', 1) },
        link: LINKS_LINK,
        icon: 'social',
      };
    case 'LINK_SAVED':
      return {
        key: 'notifications.text.LINK_SAVED',
        params: { name: str(p, 'fromUsername'), title: str(p, 'title'), count: num(p, 'count', 1) },
        link: LINKS_LINK,
        icon: 'social',
      };
    case 'ADMIN_NOTICE':
      return {
        key: 'notifications.text.ADMIN_NOTICE',
        params: { message: str(p, 'message') },
        link: null,
        icon: 'admin',
      };
    case 'VIDEO_TAKEN_DOWN':
      return {
        key: `notifications.text.VIDEO_TAKEN_DOWN${str(p, 'message') ? '_note' : ''}`,
        params: {
          title: str(p, 'title'),
          rule: `reports.reason.${RULES.has(str(p, 'rule')) ? str(p, 'rule') : 'OTHER'}`,
          message: str(p, 'message'),
        },
        keyParams: ['rule'],
        link: null,
        icon: 'removed',
      };
    case 'VIDEO_EDITED':
      return {
        key: 'notifications.text.VIDEO_EDITED',
        params: { title: str(p, 'title') },
        link: videoTarget(p),
        icon: 'admin',
      };
    case 'VIDEO_EDIT_FAILED':
      // To the editor: the changes wait there for another try.
      return {
        key: 'notifications.text.VIDEO_EDIT_FAILED',
        params: { title: str(p, 'title') },
        link: str(p, 'videoId') ? ['/edit', str(p, 'videoId')] : null,
        icon: 'failed',
      };
    case 'PLAN_EXPIRING':
      return {
        // A hidden page opens with the end of Pro.
        // Anonymous links stop opening with it.
        key: `notifications.text.PLAN_EXPIRING${p['pageHidden'] === true ? '_page' : ''}${
          p['anonymousLinks'] === true ? '_links' : ''
        }`,
        params: { date: formatMoment(str(p, 'until')) },
        link: PLAN_LINK,
        icon: 'generic',
      };
    case 'PLAN_PAYMENT_FAILED':
      return {
        key: 'notifications.text.PLAN_PAYMENT_FAILED',
        params: { date: formatMoment(str(p, 'until')) },
        link: PLAN_LINK,
        icon: 'generic',
      };
    case 'PLAN_EXPIRED':
      return {
        key: `notifications.text.PLAN_EXPIRED${p['overQuota'] === true ? '_over' : ''}${
          p['pageReopened'] === true ? '_page' : ''
        }${p['anonymousLinks'] === true ? '_links' : ''}`,
        params: {
          file: formatBytes(Number(p['maxFileBytes'] ?? 0)),
          shelf: formatBytes(Number(p['storageQuotaBytes'] ?? 0)),
        },
        link: PLAN_LINK,
        icon: 'generic',
      };
    // The month's traffic: four fifths spent, and all of it; both lead to the plan.
    case 'TRAFFIC_RUNNING_OUT':
      return {
        key: 'notifications.text.TRAFFIC_RUNNING_OUT',
        params: {
          used: formatBytes(num(p, 'usedBytes')),
          limit: formatBytes(num(p, 'limitBytes')),
          date: formatMoment(str(p, 'resetAt')),
        },
        link: PLAN_LINK,
        icon: 'generic',
      };
    case 'TRAFFIC_USED_UP':
      return {
        key: 'notifications.text.TRAFFIC_USED_UP',
        params: { limit: formatBytes(num(p, 'limitBytes')), date: formatMoment(str(p, 'resetAt')) },
        link: PLAN_LINK,
        icon: 'failed',
      };
    default:
      return { key: 'notifications.text.generic', params: {}, link: null, icon: 'generic' };
  }
}

const PLAN_LINK = panelLink('settings', 'plan');
const LINKS_LINK = panelLink('links');

const RULES = new Set(['SPAM', 'ILLEGAL', 'COPYRIGHT', 'ABUSE', 'UNMARKED_ADULT', 'OTHER']);

/** Date and time in the page's language and the viewer's time zone. */
function formatMoment(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
    dateStyle: 'long',
    timeStyle: 'short',
    hourCycle: 'h23',
  }).format(date);
}

/** A video's short code; notifications written before codes existed use /v/<id>. */
function videoTarget(p: Record<string, unknown>): string[] | null {
  if (str(p, 'videoCode')) return videoLink(str(p, 'videoCode'));
  return str(p, 'videoId') ? ['/v', str(p, 'videoId')] : null;
}
