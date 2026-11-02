import type { NotificationType } from '../../generated/prisma/enums.js';

/**
 * Domain events written to the transactional outbox. The worker's
 * relay turns them into notifications, emails and websocket pushes; nothing else reads them.
 */
export const OUTBOX_EVENT = {
  videoProcessed: 'video.processed',
  videoFailed: 'video.failed',
  videoRemoved: 'video.removed',
  /** Explicit deliveries decided inside the transaction (exchange events). */
  notify: 'notify',
  /**
   * Stop a Pro subscription at Paddle: at once (account deleted) or at the end of the paid period
   * (account banned); retried until Paddle answers.
   */
  billingCancel: 'billing.cancel',
  /** Take back a cancel a ban scheduled (unbanned before the period ended). */
  billingKeep: 'billing.keep',
} as const;
export type OutboxEventType = (typeof OUTBOX_EVENT)[keyof typeof OUTBOX_EVENT];

export interface Delivery {
  userId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
}

export interface OutboxPayloads {
  /** `sourceEventId`: set on chunks fanned out from another event (makes the fan-out idempotent). */
  notify: { deliveries: Delivery[]; sourceEventId?: string };
  /** `when` absent in events written before bans cancelled subscriptions: at once. */
  'billing.cancel': { subscriptionId: string; when?: 'now' | 'periodEnd' };
  'billing.keep': { subscriptionId: string };
  'video.processed': {
    videoId: string;
    /** Short link code; absent in events written before it existed. */
    code?: string;
    authorId: string;
    title: string;
    /**
     * First time this video became READY. Followers used to be notified of it; "What's
     * new" shows it to them now instead, so older events with it set notify no one.
     */
    notifyFollowers?: boolean;
    private?: boolean;
  };
  'video.failed': {
    videoId: string;
    authorId: string;
    title: string;
    reason: string;
  };
  'video.removed': {
    videoId: string;
    title: string;
    authorId: string;
    authorName: string;
    deletedById: string;
    /** Everyone who held the video except the person who deleted it. */
    holderIds: string[];
    /**
     * Holders who know the author by an anonymous link: the name the author goes by there
     * ('' = "Anonymous").
     */
    maskedNames?: Record<string, string>;
  };
}
