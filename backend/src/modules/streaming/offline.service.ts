import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { RequestUser } from '../../common/auth/request-user.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { canStream, canView } from '../access/access-policy.js';
import { editInProgress } from '../editor/edit-job.js';
import { deriveHlsKey } from '../processing/hls-crypto.js';
import { TrafficService } from '../traffic/traffic.service.js';
import { playbackSize } from '../traffic/traffic-rules.js';
import type {
  OfflineCheckDto,
  OfflineCopyDto,
  OfflineHeldDto,
  OfflineQuoteDto,
  OfflineState,
} from './offline.dto.js';
import {
  POLICY_SELECT,
  StreamingService,
  toViewer,
} from './streaming.service.js';

/**
 * A copy's links live this long: a phone that waits for Wi-Fi or charges overnight usually finishes
 * on one set of them, and asks again when they run out.
 */
export const OFFLINE_LINK_TTL_SEC = 6 * 3600;
/**
 * For this long after a copy was charged, the phone may fetch it again without being charged again:
 * to finish a download that waited, or to redo a copy an edit replaced.
 */
export const OFFLINE_RENEW_SEC = 7 * 24 * 3600;

/**
 * Videos saved to a phone for watching without a network (–). A copy is the same
 * encrypted HLS the player streams, with its key; saving it costs what a view costs, once, and the
 * phone checks its copies with the server whenever it comes back online.
 */
@Injectable()
export class OfflineService {
  private readonly kek: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly streaming: StreamingService,
    private readonly traffic: TrafficService,
    config: ConfigService<Env, true>,
  ) {
    this.kek = Buffer.from(config.get('KEK', { infer: true }), 'hex');
  }

  /** What saving these videos would take: their sizes, which of them cost traffic, what is left. */
  async quote(user: RequestUser, videoIds: string[]): Promise<OfflineQuoteDto> {
    const ids = [...new Set(videoIds)];
    const [videos, holdings, renewable, standing] = await Promise.all([
      this.prisma.video.findMany({
        where: { id: { in: ids } },
        select: {
          ...POLICY_SELECT,
          playbackBytes: true,
          renderBytes: true,
          sizeBytes: true,
        },
      }),
      this.prisma.videoAccess.findMany({
        where: { holderId: user.id, videoId: { in: ids } },
        select: { videoId: true, holderId: true, source: true, hidden: true },
      }),
      this.prisma.offlineCopy.findMany({
        where: {
          userId: user.id,
          videoId: { in: ids },
          savedAt: { gt: renewFrom() },
        },
        select: { videoId: true },
      }),
      this.traffic.standing(user.id),
    ]);
    const byId = new Map(videos.map((v) => [v.id, v]));
    const held = new Map(holdings.map((h) => [h.videoId, h]));
    const free = new Set(renewable.map((r) => r.videoId));
    const viewer = toViewer(user);
    const counted = ids.filter((id) => {
      const video = byId.get(id);
      return (
        !!video &&
        standing.limitBytes > 0 &&
        viewer?.role !== 'ADMIN' &&
        video.authorId !== user.id &&
        !free.has(id)
      );
    });
    const seen = await this.traffic.seenLately(
      counted.map((id) =>
        this.traffic.seenKeys(user.id, `view:${id}`, { userId: user.id }),
      ),
    );
    const spends = new Set(counted.filter((_, i) => !seen[i]));
    return {
      videos: ids.map((id) => {
        const video = byId.get(id);
        const allowed =
          !!video && canStream(viewer, video, held.get(id) ?? null);
        return {
          videoId: id,
          allowed,
          bytes: video && allowed ? playbackSize(video) : 0,
          spends: allowed && spends.has(id),
        };
      }),
      traffic: {
        usedBytes: standing.usedBytes,
        limitBytes: standing.limitBytes,
        resetAt: standing.resetAt.toISOString(),
      },
    };
  }

  /**
   * Hands the phone a copy of the video: its playlist with signed links, and its key. The first time
   * it is charged like a view, in the same window (a video watched today saves for free, and one
   * saved today plays for free); for a week after that the phone may come back for fresh links
   * without paying again.
   */
  async save(user: RequestUser, videoId: string): Promise<OfflineCopyDto> {
    const video = await this.streaming.loadVideo(videoId);
    if (!video) throw notFound();
    const holding = await this.streaming.viewerHolding(user, videoId);
    if (!canStream(toViewer(user), video, holding) || !video.hlsPrefix) {
      if (video.deletedAt) throw notFound();
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'videoNotWatchable',
        'errors.videos.notWatchable',
      );
    }
    const kept = await this.prisma.offlineCopy.findUnique({
      where: { userId_videoId: { userId: user.id, videoId } },
      select: { savedAt: true },
    });
    if (!kept || kept.savedAt <= renewFrom()) {
      await this.streaming.chargeView(user, video, {});
      await this.prisma.offlineCopy.upsert({
        where: { userId_videoId: { userId: user.id, videoId } },
        create: { userId: user.id, videoId },
        update: { savedAt: new Date() },
      });
    }
    const playlist = await this.streaming.signedMediaPlaylist(
      video.hlsPrefix,
      OFFLINE_LINK_TTL_SEC,
      'key',
    );
    return {
      videoId,
      keyVersion: video.keyVersion,
      key: deriveHlsKey(this.kek, videoId, video.keyVersion).toString('base64'),
      playlist,
      bytes: playbackSize(video),
      expiresAt: new Date(
        Date.now() + OFFLINE_LINK_TTL_SEC * 1000,
      ).toISOString(),
    };
  }

  /**
   * What the phone should do with each copy it holds: keep it, remove it (the person may no longer
   * watch the video) or save it again (an edit replaced it; free for a week from now). A video being
   * edited keeps its old copy until the edit is done.
   */
  async check(
    user: RequestUser,
    copies: OfflineHeldDto[],
  ): Promise<OfflineCheckDto> {
    const ids = [...new Set(copies.map((c) => c.videoId))];
    const [videos, holdings] = await Promise.all([
      this.prisma.video.findMany({
        where: { id: { in: ids } },
        select: { ...POLICY_SELECT, keyVersion: true, editJob: true },
      }),
      this.prisma.videoAccess.findMany({
        where: { holderId: user.id, videoId: { in: ids } },
        select: { videoId: true, holderId: true, source: true, hidden: true },
      }),
    ]);
    const byId = new Map(videos.map((v) => [v.id, v]));
    const held = new Map(holdings.map((h) => [h.videoId, h]));
    const viewer = toViewer(user);
    const verdicts = copies.map(({ videoId, keyVersion }) => {
      const video = byId.get(videoId);
      const holding = held.get(videoId) ?? null;
      let state: OfflineState;
      if (!video) state = 'remove';
      else if (editInProgress(video.editJob) && !video.deletedAt)
        // Judged as the video it was: a public one is not ready mid-edit, yet its copy stays.
        state = canView(viewer, { ...video, status: 'READY' }, holding)
          ? 'keep'
          : 'remove';
      else if (!canStream(viewer, video, holding)) state = 'remove';
      else state = video.keyVersion === keyVersion ? 'keep' : 'update';
      return { videoId, state };
    });
    const redo = verdicts.filter((v) => v.state === 'update');
    if (redo.length)
      await this.prisma.offlineCopy.updateMany({
        where: {
          userId: user.id,
          videoId: { in: redo.map((v) => v.videoId) },
        },
        data: { savedAt: new Date() },
      });
    return { copies: verdicts };
  }
}

/** Charged before this, a copy is paid for no longer: saving it again costs again. */
const renewFrom = () => new Date(Date.now() - OFFLINE_RENEW_SEC * 1000);

const notFound = () =>
  new AppException(
    HttpStatus.NOT_FOUND,
    'videoNotFound',
    'errors.videos.notFound',
  );
