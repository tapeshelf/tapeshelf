import { HttpStatus, Injectable } from '@nestjs/common';

import type { RequestUser } from '../../common/auth/request-user.js';
import { AppException } from '../../common/errors/app.exception.js';
import { t } from '../../common/i18n/i18n.js';
import { formatBytes } from '../processing/contact-sheet.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { QueueService } from '../../infra/queue/queue.service.js';
import { WsGateway } from '../../infra/ws/ws.gateway.js';
import { canUseEditor, isAdmin } from '../access/access-policy.js';
import { AuditService } from '../audit/audit.service.js';
import { FRAME_COUNT, frameKey } from '../collection/video-card.js';
import { overLimit } from '../plans/plan.js';
import { PlansService } from '../plans/plans.service.js';
import { toViewer } from '../streaming/streaming.service.js';
import { TITLE_MAX } from '../uploads/uploads.dto.js';
import { WS_EVENT } from '../videos/video-events.relay.js';
import { VideosService } from '../videos/videos.service.js';
import { createCopyPlaceholder, dropCopyPlaceholder } from './edit-copy.js';
import {
  type EditJob,
  type EditMode,
  READY_AGAIN,
  UNDER_EDIT,
  editInProgress,
} from './edit-job.js';
import {
  type EditSource,
  type EditSpec,
  EditSpecError,
  isIdentity,
  normalizeEdit,
} from './edit-spec.js';
import type { EditStateDto, SaveEditDto } from './editor.dto.js';

const VIDEO_SELECT = {
  id: true,
  code: true,
  title: true,
  description: true,
  sensitive: true,
  originalFilename: true,
  authorId: true,
  visibility: true,
  status: true,
  stage: true,
  deletedAt: true,
  purgedAt: true,
  durationSec: true,
  width: true,
  height: true,
  probe: true,
  sizeBytes: true,
  renderBytes: true,
  editJob: true,
  assetPrefix: true,
  smallFrames: true,
  contactSheetKey: true,
} as const;
type EditorVideo = Prisma.VideoGetPayload<{ select: typeof VIDEO_SELECT }>;

/**
 * The API side of the video editor: what the editor starts from — the video
 * as it is now —, saving an edit (into the same video, for good, or as a copy) and cancelling. The
 * work itself is the worker's (`EditRenderService`); one edit of a video at a time.
 */
@Injectable()
export class EditorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly queues: QueueService,
    private readonly audit: AuditService,
    private readonly ws: WsGateway,
    private readonly videos: VideosService,
    private readonly storage: StorageService,
  ) {}

  async state(user: RequestUser, videoId: string): Promise<EditStateDto> {
    return this.toState(user, await this.load(user, videoId));
  }

  async save(
    user: RequestUser,
    videoId: string,
    dto: SaveEditDto,
  ): Promise<EditStateDto> {
    const video = await this.load(user, videoId);
    let spec: EditSpec;
    try {
      spec = normalizeEdit(dto.spec as EditSpec, sourceOf(video));
    } catch (err) {
      if (err instanceof EditSpecError)
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'invalidEdit',
          'errors.editor.invalid',
          {
            details: { reason: err.message },
          },
        );
      throw err;
    }
    const own = video.authorId === user.id;
    if (dto.mode === 'copy' && !own)
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'editorCopyOwnOnly',
        'errors.editor.copyOwnOnly',
      );
    // Nothing changed: there is nothing to make, into the video or as a copy.
    if (isIdentity(spec, sourceOf(video))) throw nothingToSave();
    // A copy needs room on the shelf, about the video's size; a save into the same video takes
    // the place of what it is made from. A moderator's edit is not held back.
    if (own && dto.mode === 'copy') await this.assertRoom(user, video);
    return this.enqueue(user, video, dto.mode, spec);
  }

  /**
   * Cancels an edit waiting for or going through its render, or puts away a failed one. The video
   * is watchable again at once; a copy that was being made leaves the shelf.
   */
  async cancel(user: RequestUser, videoId: string): Promise<EditStateDto> {
    const video = await this.load(user, videoId);
    const outcome = await this.prisma.$transaction(async (tx) => {
      const row = await lockVideo(tx, videoId);
      const job = row.editJob as EditJob | null;
      await tx.video.update({
        where: { id: videoId },
        data: { editJob: Prisma.DbNull, editRevision: { increment: 1 } },
      });
      if (!editInProgress(job)) return null;
      if (job.copyId)
        return (await dropCopyPlaceholder(tx, job.copyId))
          ? { dropped: job.copyId }
          : null;
      const { count } = await tx.video.updateMany({
        where: { id: videoId, stage: 'EDIT' },
        data: READY_AGAIN,
      });
      return count ? { restored: videoId } : null;
    });
    await this.queues.dropEditJobs(videoId);
    if (outcome && 'dropped' in outcome)
      this.ws.emitToUser(video.authorId, WS_EVENT.removed, {
        videoId: outcome.dropped,
      });
    else if (outcome) await this.tellAuthor(video.authorId, videoId);
    return this.state(user, videoId);
  }

  /** The author's own pages show the video as it is now (its tile, its page). */
  private async tellAuthor(authorId: string, videoId: string): Promise<void> {
    try {
      const fresh = await this.videos.getOwnDto(authorId, videoId);
      this.ws.emitToUser(authorId, WS_EVENT.changed, { video: fresh });
    } catch {
      // gone meanwhile: nothing to show
    }
  }

  private async enqueue(
    user: RequestUser,
    video: EditorVideo,
    mode: EditMode,
    spec: EditSpec | null,
  ): Promise<EditStateDto> {
    const author = await this.prisma.user.findUniqueOrThrow({
      where: { id: video.authorId },
      select: { locale: true },
    });
    const { revision, copyId } = await this.prisma.$transaction(async (tx) => {
      const row = await lockVideo(tx, video.id);
      const pending = row.editJob as EditJob | null;
      if (pending && pending.status !== 'failed')
        throw new AppException(
          HttpStatus.CONFLICT,
          'editInProgress',
          'errors.editor.inProgress',
        );
      const next = row.editRevision + 1;
      const job: EditJob = {
        revision: next,
        mode,
        spec,
        requestedById: user.id,
        requestedAt: new Date().toISOString(),
        status: 'queued',
        progress: 0,
        error: null,
        ...(mode === 'copy'
          ? {
              copyTitle:
                `${video.title} ${t(author.locale, 'editor.copySuffix')}`.slice(
                  0,
                  TITLE_MAX,
                ),
            }
          : {}),
      };
      // A copy is on the shelf from now on; the video itself, edited, is watched by no one until
      // its new version is there.
      if (mode === 'copy')
        job.copyId = await createCopyPlaceholder(tx, video, job.copyTitle!);
      await tx.video.update({
        where: { id: video.id },
        data: {
          editRevision: next,
          editJob: job as unknown as Prisma.InputJsonValue,
          ...(mode === 'copy' ? {} : UNDER_EDIT),
        },
      });
      if (user.id !== video.authorId)
        await this.audit.log(
          {
            actorId: user.id,
            action: 'video.edit',
            targetType: 'video',
            targetId: video.id,
            meta: { title: video.title, mode },
          },
          tx,
        );
      return { revision: next, copyId: job.copyId };
    });
    await this.queues.enqueueEdit({ videoId: video.id, revision });
    await this.tellAuthor(video.authorId, copyId ?? video.id);
    return this.state(user, video.id);
  }

  private async assertRoom(
    user: RequestUser,
    video: EditorVideo,
  ): Promise<void> {
    const quota = (await this.plans.limitsForUser(user)).storageQuotaBytes;
    const me = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { storageUsedBytes: true },
    });
    const reserved = await this.prisma.uploadSession.aggregate({
      where: {
        userId: user.id,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      _sum: { declaredSize: true },
    });
    const used =
      Number(me.storageUsedBytes) + Number(reserved._sum.declaredSize ?? 0);
    // The file the copy is made from: an edit kept aside before, else the video's own.
    const needed = Number(video.renderBytes ?? video.sizeBytes);
    if (overLimit(used + needed, quota))
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'quotaExceeded',
        'errors.uploads.quotaExceeded',
        {
          params: { used: formatBytes(used), quota: formatBytes(quota) },
        },
      );
  }

  /**
   * The video, if this user may edit it. Someone who may not even manage it gets a 404, as for any
   * video they cannot reach; its Free author gets `editorProOnly` (the editor is Pro).
   */
  private async load(user: RequestUser, videoId: string): Promise<EditorVideo> {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: VIDEO_SELECT,
    });
    const viewer = toViewer(user);
    if (
      !video ||
      video.deletedAt ||
      (video.authorId !== user.id && !isAdmin(viewer))
    )
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'videoNotFound',
        'errors.videos.notFound',
      );
    // Being edited, it is not READY, and its editor still opens: to follow the render or cancel it.
    if (video.status !== 'READY' && !editInProgress(video.editJob))
      throw new AppException(
        HttpStatus.CONFLICT,
        'videoNotReady',
        'errors.editor.notReady',
      );
    if (!canUseEditor(viewer, video, this.plans.hasTiers))
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'editorProOnly',
        'errors.editor.proOnly',
      );
    return video;
  }

  private async toState(
    user: RequestUser,
    video: EditorVideo,
  ): Promise<EditStateDto> {
    const job = video.editJob as EditJob | null;
    return {
      videoId: video.id,
      code: video.code,
      title: video.title,
      source: { ...sourceOf(video), fps: fpsOf(video.probe) },
      // The tile's own frames, which exist once its contact sheet does.
      frameUrls:
        video.assetPrefix && video.contactSheetKey
          ? Array.from({ length: FRAME_COUNT }, (_, i) =>
              this.storage.publicUrl(frameKey(video, i)),
            )
          : [],
      job: job
        ? {
            mode: job.mode,
            status: job.status,
            progress: job.progress,
            error: job.error,
            spec: (job.spec as EditSpec | null) ?? null,
          }
        : null,
      canCopy: video.authorId === user.id,
      foreign: video.authorId !== user.id,
    };
  }
}

/**
 * What the edit is made from: the video as it is now, an earlier edit included. Its size is
 * the file's (from its probe), not its playback's, which may have been fitted into 1080p: the
 * render works on the file, and the editor shows the result's size and plates by it.
 */
function sourceOf(video: EditorVideo): EditSource {
  return {
    durationSec: video.durationSec ?? 0,
    width: video.width ?? 0,
    height: video.height ?? 0,
    hasAudio: !!(video.probe as { audio?: unknown } | null)?.audio,
    ...displaySize(video.probe),
  };
}

/** Frames per second of a probed file, when the probe says it. */
function fpsOf(probe: unknown): number | null {
  const fps = (probe as { video?: { fps?: unknown } } | null)?.video?.fps;
  return typeof fps === 'number' && fps > 0 ? fps : null;
}

/** The display size of a probed file (its own rotation applied), when the probe says it. */
function displaySize(probe: unknown): { width: number; height: number } | {} {
  const v = (
    probe as {
      video?: { width?: unknown; height?: unknown; rotation?: unknown };
    } | null
  )?.video;
  if (typeof v?.width !== 'number' || typeof v.height !== 'number') return {};
  if (!(v.width > 0 && v.height > 0)) return {};
  return v.rotation === 90 || v.rotation === 270
    ? { width: v.height, height: v.width }
    : { width: v.width, height: v.height };
}

async function lockVideo(
  tx: Prisma.TransactionClient,
  videoId: string,
): Promise<{ editRevision: number; editJob: unknown }> {
  const rows = await tx.$queryRaw<{ editRevision: number; editJob: unknown }[]>`
    SELECT "editRevision", "editJob" FROM "Video" WHERE id = ${videoId}::uuid FOR UPDATE`;
  return rows[0]!;
}

const nothingToSave = () =>
  new AppException(
    HttpStatus.BAD_REQUEST,
    'nothingToSave',
    'errors.editor.nothing',
  );
