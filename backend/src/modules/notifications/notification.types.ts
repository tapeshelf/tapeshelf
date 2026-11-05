import { NotificationType } from '../../generated/prisma/enums.js';

export interface ChannelPrefs {
  inApp: boolean;
  email: boolean;
}

export const NOTIFICATION_TYPES = Object.values(NotificationType);

/**
 * Defaults from (table). Email by default only for what needs an answer, ends
 * something a person waits for, or concerns their money and account.
 */
export const DEFAULT_PREFERENCES: Record<NotificationType, ChannelPrefs> = {
  REQUEST_RECEIVED: { inApp: true, email: true },
  OFFER_RECEIVED: { inApp: true, email: true },
  REQUEST_SHARED: { inApp: true, email: true },
  EXCHANGE_COMPLETED: { inApp: true, email: true },
  REQUEST_DECLINED: { inApp: true, email: false },
  REQUEST_CANCELLED: { inApp: true, email: false },
  REQUEST_INVALIDATED: { inApp: true, email: false },
  NEW_FOLLOWER: { inApp: true, email: false },
  FRIEND_ACCEPTED: { inApp: true, email: false },
  FOLLOWED_NEW_VIDEO: { inApp: true, email: false },
  NEW_MESSAGE: { inApp: true, email: true },
  VIDEO_PROCESSED: { inApp: true, email: false },
  VIDEO_FAILED: { inApp: true, email: false },
  VIDEO_REMOVED: { inApp: true, email: false },
  REPORT_RESOLVED: { inApp: true, email: false },
  ADMIN_NOTICE: { inApp: true, email: true },
  PLAN_EXPIRING: { inApp: true, email: false },
  PLAN_EXPIRED: { inApp: true, email: true },
  VIDEO_TAKEN_DOWN: { inApp: true, email: true },
  PLAN_PAYMENT_FAILED: { inApp: true, email: true },
  VIDEO_EDITED: { inApp: true, email: false },
  VIDEO_EDIT_FAILED: { inApp: true, email: false },
  SUPPORT_REPLY: { inApp: true, email: true },
  SUPPORT_TICKET: { inApp: true, email: true },
  LINK_OPENED: { inApp: true, email: false },
  LINK_SAVED: { inApp: true, email: false },
  // Running out is a heads-up; used up ends sharing for the month, like the end of Pro.
  TRAFFIC_RUNNING_OUT: { inApp: true, email: false },
  TRAFFIC_USED_UP: { inApp: true, email: true },
};

/**
 * Types that something produces; the settings page shows only these. FOLLOWED_NEW_VIDEO is no longer
 * sent ("What's new" shows new videos instead); old ones still read in the bell.
 */
export const ACTIVE_NOTIFICATION_TYPES: NotificationType[] = [
  'REQUEST_RECEIVED',
  'OFFER_RECEIVED',
  'REQUEST_SHARED',
  'EXCHANGE_COMPLETED',
  'REQUEST_DECLINED',
  'REQUEST_CANCELLED',
  'REQUEST_INVALIDATED',
  'NEW_FOLLOWER',
  'FRIEND_ACCEPTED',
  'NEW_MESSAGE',
  'VIDEO_PROCESSED',
  'VIDEO_FAILED',
  'VIDEO_REMOVED',
  'REPORT_RESOLVED',
  'ADMIN_NOTICE',
  'PLAN_EXPIRING',
  'PLAN_EXPIRED',
  'VIDEO_TAKEN_DOWN',
  'VIDEO_EDITED',
  'VIDEO_EDIT_FAILED',
  'PLAN_PAYMENT_FAILED',
  'SUPPORT_REPLY',
  'SUPPORT_TICKET',
  'LINK_OPENED',
  'LINK_SAVED',
  'TRAFFIC_RUNNING_OUT',
  'TRAFFIC_USED_UP',
];

/** About a request: each also tells the recipient's app to refresh its requests, whatever the bell shows. */
export const EXCHANGE_NOTIFICATION_TYPES: readonly NotificationType[] = [
  'REQUEST_RECEIVED',
  'OFFER_RECEIVED',
  'REQUEST_SHARED',
  'EXCHANGE_COMPLETED',
  'REQUEST_DECLINED',
  'REQUEST_CANCELLED',
  'REQUEST_INVALIDATED',
];

/**
 * About Pro and the monthly traffic: only the cloud has tiers and limits, a self-hosted instance
 * never sends these.
 */
export const PLAN_NOTIFICATION_TYPES: NotificationType[] = [
  'PLAN_EXPIRING',
  'PLAN_EXPIRED',
  'PLAN_PAYMENT_FAILED',
  'TRAFFIC_RUNNING_OUT',
  'TRAFFIC_USED_UP',
];

/** For admins only: nobody else is sent these or sees them in the settings. */
export const ADMIN_NOTIFICATION_TYPES: NotificationType[] = ['SUPPORT_TICKET'];

/** What each notification carries (rendered by the frontend and by the email templates). */
/** `fromName`/`withName` are display names at event time; `requestId` links to the thread. */
export interface NotificationPayloads {
  REQUEST_RECEIVED: {
    requestId: string;
    fromName: string;
    /** From a guest without an account: the name reads "Guest" in the reader's language. */
    guest?: boolean;
    fromUsername: string;
    count: number;
    title: string;
    /** The start of the requester's message (`quoteOf`), when there is one. */
    message?: string | null;
    /** How many videos the requester offers in return from the start. */
    offered?: number;
  };
  OFFER_RECEIVED: {
    requestId: string;
    fromName: string;
    guest?: boolean;
    round: number;
    /** The start of the offer's message, when there is one. */
    message?: string | null;
    /** What the proposer gives and asks for: the first title of each side and how many more. */
    gives?: string;
    givesMore?: number;
    wants?: string;
    wantsMore?: number;
  };
  REQUEST_SHARED: {
    requestId: string;
    fromName: string;
    count: number;
    title: string;
  };
  EXCHANGE_COMPLETED: {
    requestId: string;
    withName: string;
    guest?: boolean;
    received: number;
    given: number;
  };
  REQUEST_DECLINED: {
    requestId: string;
    fromName: string;
    guest?: boolean;
    comment: string | null;
    title: string;
    /** Days until the requester may ask again (to the requester only). */
    cooldownDays?: number;
  };
  REQUEST_CANCELLED: {
    requestId: string;
    fromName: string;
    guest?: boolean;
    title: string;
  };
  REQUEST_INVALIDATED: {
    requestId: string;
    /** `expired`: a deal with a guest left three days without a move. */
    reason: 'videoLost' | 'reset' | 'blocked' | 'accountClosed' | 'expired';
    title: string;
  };
  /** `userId` is the other person (also used to avoid repeating the same news within a day). */
  NEW_FOLLOWER: { userId: string; fromName: string; fromUsername: string };
  FRIEND_ACCEPTED: { userId: string; withName: string; withUsername: string };
  FOLLOWED_NEW_VIDEO: {
    videoId: string;
    /** Short link code; missing in notifications written before it existed. */
    videoCode?: string;
    title: string;
    authorName: string;
    authorUsername: string;
    private: boolean;
  };
  /** One unread notification per conversation: `count` grows while it stays unread. */
  NEW_MESSAGE: {
    conversationId: string;
    /** The message itself; absent in events queued before it was added. */
    messageId?: string;
    fromUserId: string;
    fromName: string;
    fromUsername: string;
    preview: string;
    hasVideo: boolean;
    count: number;
  };
  VIDEO_PROCESSED: { videoId: string; videoCode?: string; title: string };
  VIDEO_FAILED: { videoId: string; title: string; reason: string };
  /** `anonymous`: the author is known to this holder by an anonymous link without a name. */
  VIDEO_REMOVED: {
    videoId: string;
    title: string;
    authorName: string;
    anonymous?: true;
  };
  /** `title` is the video title or the reported person's display name at report time. */
  REPORT_RESOLVED: {
    reportId: string;
    outcome: 'actionTaken' | 'noViolation';
    targetType: 'VIDEO' | 'USER';
    title: string;
  };
  /** A message from the admins, plain text. */
  ADMIN_NOTICE: { message: string };
  /**
   * A reminder about the end of PREMIUM (a week before and on the last day); `until` is ISO;
   * `pageHidden`: the page is hidden now and opens with the end; `anonymousLinks`: they have
   * anonymous links, which stop opening with the end.
   */
  PLAN_EXPIRING: { until: string; pageHidden?: true; anonymousLinks?: true };
  /**
   * PREMIUM ended: the BASIC limits at that moment and whether the shelf is over its quota now;
   * `pageReopened`: the hidden page is visible again; `anonymousLinks`: their anonymous links
   * no longer open until Pro is back.
   */
  PLAN_EXPIRED: {
    maxFileBytes: number;
    storageQuotaBytes: number;
    overQuota: boolean;
    pageReopened?: true;
    anonymousLinks?: true;
  };
  /** A renewal failed: Pro stays until `until` (ISO) unless the payment goes through. */
  PLAN_PAYMENT_FAILED: { until: string };
  /** An admin removed the author's video: the rule broken and the admin's words. */
  VIDEO_TAKEN_DOWN: {
    videoId: string;
    title: string;
    rule:
      'SPAM' | 'ILLEGAL' | 'COPYRIGHT' | 'ABUSE' | 'UNMARKED_ADULT' | 'OTHER';
    message: string | null;
  };
  /** An admin edited someone else's video; the author is told. */
  VIDEO_EDITED: {
    videoId: string;
    videoCode: string;
    title: string;
  };
  /** An edit's render failed: whoever saved it hears, the editor need not be open. */
  VIDEO_EDIT_FAILED: {
    videoId: string;
    videoCode: string;
    title: string;
  };
  /** Support answered the author's ticket, or marked it solved (`resolved`, maybe without words). */
  SUPPORT_REPLY: {
    ticketId: string;
    number: number;
    subject: string;
    resolved: boolean;
    /** The start of the answer; empty when support only marked it solved. */
    preview: string;
  };
  /** To admins: a new ticket (`created`) or a new message from its author. */
  SUPPORT_TICKET: {
    ticketId: string;
    number: number;
    subject: string;
    topic: 'QUESTION' | 'BUG' | 'ACCOUNT' | 'IDEA';
    fromUsername: string;
    created: boolean;
    preview: string;
  };
  /**
   * Someone else than the sender opened a temporary link for the first time; `fromUsername`
   * when they were signed in. `title` is the link's first video, `count` how many it has.
   */
  LINK_OPENED: {
    linkId: string;
    count: number;
    title: string;
    fromName?: string | null;
    fromUsername?: string | null;
  };
  /** Someone put videos of a temporary link on their shelf: how many, the first title. */
  LINK_SAVED: {
    linkId: string;
    userId: string;
    fromName: string;
    fromUsername: string;
    count: number;
    title: string;
  };
  /** Four fifths of the month's traffic are spent; `resetAt` is ISO, when the next month starts. */
  TRAFFIC_RUNNING_OUT: {
    usedBytes: number;
    limitBytes: number;
    resetAt: string;
  };
  /** The month's traffic is spent: nothing of theirs opens for others until `resetAt`. */
  TRAFFIC_USED_UP: { limitBytes: number; resetAt: string };
}
export type ActiveNotificationType = keyof NotificationPayloads;

export interface PreferenceRow {
  type: NotificationType;
  inApp: boolean;
  email: boolean;
}

/** Stored rows override the defaults; the result always covers every type. */
export function resolvePreferences(
  rows: readonly PreferenceRow[],
): Record<NotificationType, ChannelPrefs> {
  const out = { ...DEFAULT_PREFERENCES };
  for (const row of rows)
    if (row.type in out) out[row.type] = { inApp: row.inApp, email: row.email };
  return out;
}
