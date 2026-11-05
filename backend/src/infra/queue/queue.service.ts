import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Queue, type JobsOptions, type RedisOptions } from 'bullmq';

import { QUEUE_CONNECTION } from './queue.connection.js';
import {
  JOB,
  QUEUES,
  fairPriority,
  type MailQueueJob,
  type ProcessVideoJob,
  type SheetJob,
  type ThumbnailJob,
  type ThumbnailQueueJob,
  type VideoJobResult,
  type EditRenderJob,
  type FilesDeleteJob,
} from './queue.types.js';

export const QUEUE_PREFIX = 'vs';

/** Rename → contact-sheet regeneration is debounced by delaying the (single, per-video) job. */
const SHEET_DEBOUNCE_MS = 5_000;

/** Job states of work still to come; `completed`, `failed` and `unknown` (gone) are not. */
const LIVE_STATES = new Set([
  'waiting',
  'active',
  'delayed',
  'prioritized',
  'waiting-children',
]);

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 2,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

/** Producers for every queue; workers live in the worker process (modules/processing). */
@Injectable()
export class QueueService implements OnApplicationShutdown {
  readonly remux: Queue<ProcessVideoJob, VideoJobResult>;
  readonly transcode: Queue<ProcessVideoJob, VideoJobResult>;
  readonly thumbnail: Queue<ThumbnailQueueJob, VideoJobResult>;
  readonly maintenance: Queue;
  readonly outbox: Queue;
  readonly mail: Queue<MailQueueJob>;
  readonly edit: Queue<EditRenderJob, VideoJobResult>;

  constructor(@Inject(QUEUE_CONNECTION) connection: RedisOptions) {
    const opts = {
      connection,
      prefix: QUEUE_PREFIX,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    };
    this.remux = new Queue(QUEUES.remux, opts);
    this.transcode = new Queue(QUEUES.transcode, opts);
    this.thumbnail = new Queue(QUEUES.thumbnail, opts);
    this.maintenance = new Queue(QUEUES.maintenance, {
      ...opts,
      defaultJobOptions: { removeOnComplete: 20, removeOnFail: 50 },
    });
    this.outbox = new Queue(QUEUES.outbox, {
      ...opts,
      defaultJobOptions: { removeOnComplete: true, removeOnFail: 20 },
    });
    // A failed render is not retried by itself: the editor shows the error and the user saves again.
    this.edit = new Queue(QUEUES.edit, {
      ...opts,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    });
    this.mail = new Queue(QUEUES.mail, {
      ...opts,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
  }

  /** Asks the worker to drain the outbox now; one pending drain at a time (fixed job id). */
  async nudgeOutbox(): Promise<void> {
    await this.outbox.add(JOB.outboxDrain, {}, { jobId: 'drain' });
  }

  /** The outbox is also drained on a timer, so a lost nudge or a restart never strands an event. */
  async scheduleOutbox(): Promise<void> {
    await this.outbox.upsertJobScheduler(
      JOB.outboxDrain,
      { every: 5_000 },
      { name: JOB.outboxDrain },
    );
  }

  async enqueueMail(data: MailQueueJob): Promise<void> {
    await this.mail.add(JOB.mail, data);
  }

  /**
   * One processing job per video and queue; a finished job with the same id is replaced. A
   * transcode takes its turn behind the same person's transcodes already waiting.
   */
  async enqueueProcessing(data: ProcessVideoJob): Promise<void> {
    const queue = data.mode === 'transcode' ? this.transcode : this.remux;
    await this.replaceFinished(queue, data.videoId);
    await queue.add(JOB.process, data, {
      jobId: data.videoId,
      ...(data.mode === 'transcode'
        ? { priority: fairPriority(await this.transcodesWaiting(data.userId)) }
        : {}),
    });
  }

  /** The person's transcodes not yet begun; the queue is short enough to read through. */
  private async transcodesWaiting(userId: string): Promise<number> {
    const waiting = await this.transcode.getJobs([
      'prioritized',
      'waiting',
      'delayed',
    ]);
    return waiting.filter((job) => job?.data.userId === userId).length;
  }

  /** A processing job for the video waiting or under way, in either queue; a finished one is not. */
  async hasProcessingJob(videoId: string): Promise<boolean> {
    for (const queue of [this.remux, this.transcode]) {
      const state = await (await queue.getJob(videoId))?.getState();
      if (state && LIVE_STATES.has(state)) return true;
    }
    return false;
  }

  /** The render of this edit of the video, waiting or under way. */
  async hasEditJob(videoId: string, revision: number): Promise<boolean> {
    const job = await this.edit.getJob(`edit_${videoId}_${revision}`);
    const state = await job?.getState();
    return !!state && LIVE_STATES.has(state);
  }

  async enqueueEdit(data: EditRenderJob): Promise<void> {
    await this.edit.add(JOB.editRender, data, {
      jobId: `edit_${data.videoId}_${data.revision}`,
    });
  }

  /** Removes an edit's render that has not started (a cancel, an erased video). */
  async dropEditJobs(videoId: string): Promise<void> {
    const waiting = await this.edit.getJobs([
      'waiting',
      'delayed',
      'prioritized',
    ]);
    for (const job of waiting)
      if (job.data.videoId === videoId)
        await job.remove().catch(() => undefined);
  }

  /** Deletes a replaced version's files later: a player that began on it keeps its segments. */
  async enqueueFilesDelete(
    data: FilesDeleteJob,
    delayMs: number,
  ): Promise<void> {
    if (data.private.length + data.public.length === 0) return;
    // Tried again for about a day and a half (a minute, doubling): a storage down for a while does
    // not keep the files for good.
    await this.maintenance.add(JOB.filesDelete, data, {
      delay: delayMs,
      attempts: 11,
      backoff: { type: 'exponential', delay: 60_000 },
    });
  }

  async enqueueThumbnail(data: ThumbnailJob): Promise<void> {
    await this.thumbnail.add(JOB.thumbnail, data, {
      jobId: `thumb_${data.videoId}_${Date.now()}`,
    });
  }

  /** Removes a video's jobs that have not started yet: an erased video must not get files again. */
  async dropVideoJobs(videoId: string): Promise<void> {
    const jobs = await Promise.all([
      this.remux.getJob(videoId),
      this.transcode.getJob(videoId),
      this.thumbnail.getJob(`sheet_${videoId}`),
    ]);
    for (const job of jobs) {
      if (!job) continue;
      const state = await job.getState().catch(() => 'unknown');
      if (state === 'waiting' || state === 'delayed' || state === 'prioritized')
        await job.remove().catch(() => undefined);
    }
    await this.dropEditJobs(videoId);
  }

  async enqueueSheet(data: SheetJob): Promise<void> {
    const jobId = `sheet_${data.videoId}`; // BullMQ forbids ':' in custom ids
    await this.replaceFinished(this.thumbnail, jobId);
    await this.thumbnail.add(JOB.sheet, data, {
      jobId,
      delay: SHEET_DEBOUNCE_MS,
    });
  }

  /** Repeatable housekeeping (idempotent upserts; safe to call on every start). */
  async scheduleMaintenance(): Promise<void> {
    await this.maintenance.upsertJobScheduler(
      JOB.uploadsExpire,
      { every: 15 * 60_000 },
      { name: JOB.uploadsExpire },
    );
    await this.maintenance.upsertJobScheduler(
      JOB.tmpCleanup,
      { every: 60 * 60_000 },
      { name: JOB.tmpCleanup },
    );
    await this.maintenance.upsertJobScheduler(
      JOB.quotaReconcile,
      { every: 24 * 60 * 60_000 },
      { name: JOB.quotaReconcile },
    );
    await this.maintenance.upsertJobScheduler(
      JOB.tierExpire,
      { every: 60 * 60_000 },
      { name: JOB.tierExpire },
    );
    // The hourly purge that erased files is gone: only the admin erases.
    await this.maintenance.removeJobScheduler('trash.purge');
    await this.maintenance.upsertJobScheduler(
      JOB.trashExpire,
      { every: 60 * 60_000 },
      { name: JOB.trashExpire },
    );
    await this.maintenance.upsertJobScheduler(
      JOB.supportClose,
      { every: 60 * 60_000 },
      { name: JOB.supportClose },
    );
    await this.maintenance.upsertJobScheduler(
      JOB.processingWatch,
      { every: 15 * 60_000 },
      { name: JOB.processingWatch },
    );
    await this.maintenance.upsertJobScheduler(
      JOB.guestDeals,
      { every: 60_000 },
      { name: JOB.guestDeals },
    );
    await this.maintenance.upsertJobScheduler(
      JOB.retentionSweep,
      { every: 24 * 60 * 60_000 },
      { name: JOB.retentionSweep },
    );
    await this.maintenance.upsertJobScheduler(
      JOB.trafficSweep,
      { every: 24 * 60 * 60_000 },
      { name: JOB.trafficSweep },
    );
  }

  /** The demo is erased and seeded again every day at 04:00 UTC. */
  async scheduleDemoReset(): Promise<void> {
    await this.maintenance.upsertJobScheduler(
      JOB.demoReset,
      { pattern: '0 4 * * *', tz: 'UTC' },
      { name: JOB.demoReset },
    );
  }

  /** Hashes originals that have none yet; after start-up and when a block waits for one. */
  async enqueueHashBackfill(): Promise<void> {
    const jobId = 'hash_backfill';
    await this.replaceFinished(this.maintenance, jobId);
    await this.maintenance.add(JOB.hashBackfill, {}, { jobId });
  }

  /** One pass over videos processed before the small previews existed; no-op once done. */
  async enqueuePreviewBackfill(): Promise<void> {
    const jobId = 'preview_backfill';
    await this.replaceFinished(this.maintenance, jobId);
    await this.maintenance.add(JOB.previewBackfill, {}, { jobId });
  }

  private async replaceFinished(queue: Queue, jobId: string): Promise<void> {
    const existing = await queue.getJob(jobId);
    if (!existing) return;
    const state = await existing.getState();
    if (state === 'completed' || state === 'failed' || state === 'unknown')
      await existing.remove().catch(() => undefined);
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(
      [
        this.remux,
        this.transcode,
        this.thumbnail,
        this.maintenance,
        this.outbox,
        this.mail,
        this.edit,
      ].map((q) => q.close().catch(() => undefined)),
    );
  }
}
