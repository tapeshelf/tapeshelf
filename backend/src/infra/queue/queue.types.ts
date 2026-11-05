import type {
  NotificationType,
  ProcessingStage,
  VideoStatus,
} from '../../generated/prisma/enums.js';

/**
 * Queues: `remux` runs the fast part of processing (probe, frames, contact sheet,
 * and packaging when the source is already compatible); when a transcode is needed it hands the video
 * over to the CPU-bound `transcode` queue so short jobs never wait behind a two-hour x264 run.
 */
export const QUEUES = {
  remux: 'remux',
  transcode: 'transcode',
  thumbnail: 'thumbnail',
  maintenance: 'maintenance',
  /** Drains the transactional outbox. */
  outbox: 'outbox',
  /** Notification emails. */
  mail: 'mail',
  /** Video editor renders: one at a time, they are long. */
  edit: 'edit',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const JOB = {
  process: 'process',
  thumbnail: 'thumbnail',
  sheet: 'sheet',
  uploadsExpire: 'uploads.expire',
  quotaReconcile: 'quota.reconcile',
  tmpCleanup: 'tmp.cleanup',
  previewBackfill: 'preview.backfill',
  tierExpire: 'tier.expire',
  hashBackfill: 'hash.backfill',
  /** Deleted videos whose time in the author's trash is over leave it; nothing is erased. */
  trashExpire: 'trash.expire',
  retentionSweep: 'retention.sweep',
  /** Support tickets waiting for their author 7 days close. */
  supportClose: 'support.close',
  /** Videos whose processing or edit stopped without an end are taken up again. */
  processingWatch: 'processing.watch',
  /** Guests' deals: drafts on to the holder, deals out after three quiet days. */
  guestDeals: 'guest.deals',
  /** The public demo's daily erase and seed; scheduled only with DEMO_MODE. */
  demoReset: 'demo.reset',
  /** Rows of monthly traffic older than what is kept go. */
  trafficSweep: 'traffic.sweep',
  outboxDrain: 'outbox.drain',
  mail: 'mail',
  editRender: 'edit.render',
  /** Files of a replaced version, deleted a while later so nobody watching is cut off. */
  filesDelete: 'files.delete',
} as const;

export type ProcessingMode = 'remux' | 'transcode';

/** BullMQ's lowest priority; a job without one would run before every prioritized job. */
export const LOWEST_PRIORITY = 2_097_152;

/**
 * Where a transcode goes in its queue: behind the person's own jobs already waiting, so with
 * one job each, people take turns, and someone's hundred videos let a newcomer's one go next. BullMQ
 * runs the lowest number first, and equal numbers in order of arrival.
 */
export function fairPriority(waitingOfSameUser: number): number {
  return Math.min(LOWEST_PRIORITY, Math.max(0, waitingOfSameUser) + 1);
}

export interface ProcessVideoJob {
  videoId: string;
  userId: string;
  /** Set when the remux worker already probed the file and decided on a transcode. */
  mode?: ProcessingMode;
  /** The demo's own seed: not held to the demo's input limits. */
  seed?: boolean;
}

export interface ThumbnailJob {
  videoId: string;
  userId: string;
  timestampSec: number;
}

export interface SheetJob {
  videoId: string;
  userId: string;
}

export type ThumbnailQueueJob = ThumbnailJob | SheetJob;

/** One requested edit of a video; a job whose revision is no longer the video's is dropped. */
export interface EditRenderJob {
  videoId: string;
  revision: number;
}

/** Progress of an edit render, relayed to the requester's websocket as `video.edit`. */
export interface EditProgressEvent {
  videoId: string;
  userId: string;
  edit: {
    status: 'queued' | 'rendering' | 'failed' | 'done';
    progress: number;
  };
  /** The new video, when the edit was saved as a copy. */
  copyId?: string;
}

/** A video taken off its owner's shelf by the worker, relayed as `video.removed`. */
export interface VideoRemovedEvent {
  videoId: string;
  userId: string;
  removed: true;
}

export interface FilesDeleteJob {
  /** Whole prefixes (`…/`) and single keys, per bucket. */
  private: string[];
  public: string[];
}

/** Emitted through BullMQ job progress; the API relays it to the owner's websocket room. */
export interface VideoProgressEvent {
  videoId: string;
  userId: string;
  status: VideoStatus;
  stage: ProcessingStage | null;
  progress: number;
}

/** Return value of video jobs; `changed` tells the API to push the fresh video to the owner. */
export interface VideoJobResult {
  videoId: string;
  userId: string;
  changed: boolean;
}

/** A notification email to render (in the recipient's locale) and send from the worker. */
export interface MailJob {
  userId: string;
  /** For links to the recipient's own page. */
  username: string;
  to: string;
  locale: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  /** Set when an in-app row exists too: `emailedAt` is stamped after sending. */
  notificationId: string | null;
}

/** An already rendered mail that failed to go out at once (account mail): retried as is. */
export interface RenderedMailJob {
  kind: 'rendered';
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type MailQueueJob = MailJob | RenderedMailJob;
