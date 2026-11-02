import {
  BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type Job, type RedisOptions } from 'bullmq';

import type { Env } from '../../config/env.js';
import { QUEUE_CONNECTION } from '../../infra/queue/queue.connection.js';
import { QUEUE_PREFIX, QueueService } from '../../infra/queue/queue.service.js';
import {
  JOB,
  QUEUES,
  type ProcessVideoJob,
  type SheetJob,
  type ThumbnailJob,
  type ThumbnailQueueJob,
  type VideoJobResult,
  type VideoProgressEvent,
  type EditRenderJob,
  type FilesDeleteJob,
} from '../../infra/queue/queue.types.js';
import { BlocklistService } from '../blocklist/blocklist.service.js';
import { PlanExpiryService } from '../plans/plan-expiry.service.js';
import { DemoService } from '../demo/demo.service.js';
import { RetentionService } from '../retention/retention.service.js';
import { SupportService } from '../support/support.service.js';
import { TrashService } from '../trash/trash.service.js';
import { GuestEscrowService } from '../deals/guest-escrow.service.js';
import { MaintenanceService } from './maintenance.service.js';
import { EditRenderService } from './edit-render.service.js';
import {
  VideoPipelineService,
  type JobContext,
} from './video-pipeline.service.js';

const FAST_CONCURRENCY = 2;
const LOCK_MS = 120_000;
/**
 * Times a processing job may lose its worker (a deploy, the worker out of memory) and still be run
 * again; one more and the queue gives up on it, and the video fails. BullMQ's default is 1:
 * two deploys during one long transcode were enough.
 */
const PROCESSING_MAX_STALLS = 2;

function context<T>(job: Job<T>): JobContext<T> {
  return {
    data: job.data,
    attemptsMade: job.attemptsMade,
    maxAttempts: job.opts.attempts ?? 1,
    updateProgress: (event: VideoProgressEvent) => job.updateProgress(event),
  };
}

/** BullMQ consumers; only the worker process instantiates this. */
@Injectable()
export class ProcessingWorkers
  implements OnModuleInit, BeforeApplicationShutdown
{
  private readonly logger = new Logger(ProcessingWorkers.name);
  private readonly workers: Worker[] = [];
  private readonly transcodeConcurrency: number;

  constructor(
    @Inject(QUEUE_CONNECTION) private readonly connection: RedisOptions,
    private readonly pipeline: VideoPipelineService,
    private readonly editRender: EditRenderService,
    private readonly maintenance: MaintenanceService,
    private readonly planExpiry: PlanExpiryService,
    private readonly blocklist: BlocklistService,
    private readonly trash: TrashService,
    private readonly retention: RetentionService,
    private readonly support: SupportService,
    private readonly guestDeals: GuestEscrowService,
    private readonly queues: QueueService,
    private readonly demo: DemoService,
    config: ConfigService<Env, true>,
  ) {
    this.transcodeConcurrency = config.get('WORKER_CONCURRENCY', {
      infer: true,
    });
    this.demoMode = config.get('DEMO_MODE', { infer: true });
  }

  /** The public demo: its daily reset is scheduled and an empty demo is seeded at start. */
  private readonly demoMode: boolean;

  async onModuleInit(): Promise<void> {
    // Every queue holds its lock for two minutes (renewed every minute while the job runs): with
    // BullMQ's 30 s, a worker busy or short of memory lost the lock and the same video was
    // processed a second time beside the first, in the same folder.
    const opts = (concurrency: number) => ({
      connection: this.connection,
      prefix: QUEUE_PREFIX,
      concurrency,
      lockDuration: LOCK_MS,
    });
    for (const [name, concurrency] of [
      [QUEUES.remux, FAST_CONCURRENCY],
      [QUEUES.transcode, this.transcodeConcurrency],
    ] as const) {
      const worker = new Worker<ProcessVideoJob, VideoJobResult>(
        name,
        (job) => this.pipeline.process(context(job)),
        { ...opts(concurrency), maxStalledCount: PROCESSING_MAX_STALLS },
      );
      // A job the queue gave up on never reached the run's own error handling: the video would stay
      // "processing" for good. A failure with an attempt left is retried and passes here too.
      worker.on('failed', (job, err) => {
        if (job) void this.giveUp(job, err).catch(() => undefined);
      });
      this.add(worker);
    }
    this.add(
      new Worker<ThumbnailQueueJob, VideoJobResult>(
        QUEUES.thumbnail,
        (job) =>
          job.name === JOB.sheet
            ? this.pipeline.sheet(context(job as Job<SheetJob>))
            : this.pipeline.thumbnail(context(job as Job<ThumbnailJob>)),
        opts(FAST_CONCURRENCY),
      ),
    );
    // Editor renders: one at a time, beside the transcodes; long, so the lock is renewed.
    const edits = new Worker<EditRenderJob, VideoJobResult>(
      QUEUES.edit,
      (job) =>
        this.editRender.run({
          data: job.data,
          updateProgress: (event) => job.updateProgress(event),
        }),
      opts(1),
    );
    // A render the queue gave up on (its worker died on it): the video is not left "being edited".
    edits.on('failed', (job) => {
      if (job) void this.editRender.abandon(job.data).catch(() => undefined);
    });
    this.add(edits);
    this.add(
      new Worker(
        QUEUES.maintenance,
        async (job) => {
          switch (job.name) {
            case JOB.uploadsExpire:
              return this.maintenance.expireUploads();
            case JOB.tmpCleanup:
              return this.maintenance.cleanupTmp();
            case JOB.quotaReconcile:
              return this.maintenance.reconcileQuotas();
            case JOB.previewBackfill:
              // The passes that bring older videos up to date, once after each start.
              await this.maintenance.bakeEdits();
              await this.maintenance.refreshSheets();
              return this.maintenance.backfillPreviews();
            case JOB.tierExpire:
              return this.planExpiry.run();
            case JOB.hashBackfill:
              return this.blocklist.backfill();
            case JOB.trashExpire:
              return this.trash.sweep();
            case JOB.retentionSweep:
              return this.retention.sweep();
            case JOB.processingWatch:
              return this.maintenance.reviveStuck();
            case JOB.supportClose:
              return this.support.closeIdle();
            case JOB.guestDeals:
              return this.guestDeals.sweep();
            case JOB.demoReset:
              return this.demo.reset();
            case JOB.filesDelete:
              return this.maintenance.deleteFiles(job.data as FilesDeleteJob);
            default:
              this.logger.warn(`Unknown maintenance job ${job.name}`);
              return null;
          }
        },
        opts(1),
      ),
    );
    await this.startUp();
    this.logger.log(
      `Workers started: remux×${FAST_CONCURRENCY}, transcode×${this.transcodeConcurrency}, thumbnail×${FAST_CONCURRENCY}, edit×1, maintenance×1`,
    );
  }

  /**
   * Schedules, the demo's seed and the backfills, tried again a minute later while they fail: a
   * throw here (storage or Redis away) used to end the process after its queues had already taken
   * jobs, and the restart did it again.
   */
  private async startUp(): Promise<void> {
    try {
      await this.queues.scheduleMaintenance();
      if (this.demoMode) {
        await this.queues.scheduleDemoReset();
        await this.demo.ensureSeeded();
      }
      await this.queues.enqueuePreviewBackfill();
      await this.queues.enqueueHashBackfill();
    } catch (err) {
      this.logger.error(
        `Start-up tasks failed, retrying in a minute: ${(err as Error).message}`,
      );
      this.retry = setTimeout(() => void this.startUp(), 60_000);
      this.retry.unref();
    }
  }

  private retry: ReturnType<typeof setTimeout> | null = null;

  private add(worker: Worker): void {
    worker.on('failed', (job, err) =>
      this.logger.error(
        `${worker.name} job ${job?.id ?? '?'} failed: ${err.message}`,
      ),
    );
    worker.on('error', (err) =>
      this.logger.error(`${worker.name} worker error: ${err.message}`),
    );
    this.workers.push(worker);
  }

  private async giveUp(
    job: Job<ProcessVideoJob, VideoJobResult>,
    err: Error,
  ): Promise<void> {
    if ((await job.getState()) !== 'failed') return;
    const failed = await this.pipeline.abandon(
      job.data,
      { updateProgress: (event) => job.updateProgress(event) },
      err.message,
    );
    if (failed)
      this.logger.warn(`Video ${job.data.videoId} failed: ${err.message}`);
  }

  /**
   * Before the modules go (the database among them): a job under way finishes while Docker
   * waits (`stop_grace_period`); one that does not is run again by the next worker.
   */
  async beforeApplicationShutdown(): Promise<void> {
    if (this.retry) clearTimeout(this.retry);
    await Promise.all(
      this.workers.map((w) => w.close().catch(() => undefined)),
    );
  }
}
