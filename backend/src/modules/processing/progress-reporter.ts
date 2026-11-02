import type {
  ProcessingStage,
  VideoStatus,
} from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { VideoProgressEvent } from '../../infra/queue/queue.types.js';

export interface ProgressSink {
  updateProgress(event: VideoProgressEvent): Promise<void>;
}

/** Overall progress bands per stage, in percent. */
export const STAGE_BAND: Record<ProcessingStage, [number, number]> = {
  PROBE: [0, 2],
  FRAMES: [2, 10],
  SHEET: [10, 12],
  PACKAGE: [12, 85],
  ENCRYPT: [85, 90],
  UPLOAD: [90, 100],
  // The editor's own progress, told by the edit as a whole, not in these steps.
  EDIT: [0, 100],
};

export function inBand(stage: ProcessingStage, fraction: number): number {
  const [from, to] = STAGE_BAND[stage];
  return from + (to - from) * Math.min(1, Math.max(0, fraction));
}

const DB_WRITE_INTERVAL_MS = 2_000;

/**
 * Pushes progress to the job (relayed to the owner's websocket by the API) and persists it to the
 * video row at most every couple of seconds, so a page reload shows where processing is.
 */
export class ProgressReporter {
  private lastDbWrite = 0;
  private lastPct = -1;
  private lastStage: ProcessingStage | null | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sink: ProgressSink,
    private readonly videoId: string,
    private readonly userId: string,
  ) {}

  async report(
    stage: ProcessingStage | null,
    progress: number,
    opts: { force?: boolean; status?: VideoStatus } = {},
  ): Promise<void> {
    const pct = Math.max(0, Math.min(100, Math.round(progress)));
    const status = opts.status ?? 'PROCESSING';
    const stageChanged = stage !== this.lastStage;
    if (!opts.force && !stageChanged && pct === this.lastPct) return;
    this.lastPct = pct;
    this.lastStage = stage;
    await this.sink
      .updateProgress({
        videoId: this.videoId,
        userId: this.userId,
        status,
        stage,
        progress: pct,
      })
      .catch(() => undefined);
    const now = Date.now();
    if (
      !opts.force &&
      !stageChanged &&
      now - this.lastDbWrite < DB_WRITE_INTERVAL_MS
    )
      return;
    this.lastDbWrite = now;
    if (status === 'PROCESSING')
      await this.prisma.video
        .updateMany({
          where: { id: this.videoId, status: 'PROCESSING' },
          data: { stage, progress: pct },
        })
        .catch(() => undefined);
  }
}
