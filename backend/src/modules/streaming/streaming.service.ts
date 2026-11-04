import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';

import type { RequestUser } from '../../common/auth/request-user.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../infra/redis/redis.module.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import {
  type PolicyHolding,
  type PolicyVideo,
  type Viewer,
  canManage,
  canStream,
} from '../access/access-policy.js';
import {
  HLS_KEY_URI_PLACEHOLDER,
  deriveHlsKey,
  hlsPrefixOf,
} from '../processing/hls-crypto.js';
import {
  PLAYBACK_TOKEN_TTL_SEC,
  PlaybackTokenService,
} from './playback-token.service.js';
import { editInProgress } from '../editor/edit-job.js';
import { linkCarries, linkLive } from '../links/link-rules.js';
import {
  TrafficService,
  type TrafficViewer,
} from '../traffic/traffic.service.js';
import { VIEW_WINDOW_SEC, playbackSize } from '../traffic/traffic-rules.js';
import type { PlaybackDto } from './streaming.dto.js';

/** Access decisions are cached briefly; deletion is the only revocation and it may lag a minute. */
const DECISION_TTL_SEC = 60;
/** Rewritten playlists are cached; segment URLs live ≥ 1 h, so a 10-minute cache never serves dead links. */
const PLAYLIST_CACHE_TTL_SEC = 600;
const KEY_URI_MARKER = '__VS_KEY_URI__';

type StreamVideo = PolicyVideo & {
  durationSec: number | null;
  hlsPrefix: string | null;
  keyVersion: number;
  editJob: unknown;
  playbackBytes: bigint | null;
  renderBytes: bigint | null;
  sizeBytes: bigint;
};

/** The video and the version a token plays, with that version's files. */
interface Playing {
  video: StreamVideo;
  keyVersion: number;
  prefix: string;
}

/** Playback tokens, playlist rewriting and key delivery; downloads: DownloadsModule. */
@Injectable()
export class StreamingService {
  private readonly publicUrl: string;
  private readonly kek: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly tokens: PlaybackTokenService,
    private readonly traffic: TrafficService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService<Env, true>,
  ) {
    this.publicUrl = config
      .get('PUBLIC_URL', { infer: true })
      .replace(/\/$/, '');
    this.kek = Buffer.from(config.get('KEK', { infer: true }), 'hex');
  }

  /**
   * `POST /videos/:id/playback`: checks the right to stream and hands out a short-lived playlist URL.
   * `source`: for its editor (author or admin only), which plays the video as it is now — an
   * edit starts from it — also while that edit renders. `guest`: who a guest is, for the
   * traffic count.
   */
  async createPlayback(
    viewer: RequestUser | undefined,
    videoId: string,
    source = false,
    guest: TrafficViewer = {},
  ): Promise<PlaybackDto> {
    const video = await this.loadVideo(videoId);
    if (!video) throw notFound();
    const holding = await this.viewerHolding(viewer, videoId);
    // Being edited, a video plays for no one — but its editor still plays what it edits.
    const allowed =
      (source &&
        editInProgress(video.editJob) &&
        canManage(toViewer(viewer), video)) ||
      canStream(toViewer(viewer), video, holding);
    // For everyone but the admin a deleted video is simply gone.
    if (!allowed && video.deletedAt) throw notFound();
    if (!allowed)
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'videoNotWatchable',
        'errors.videos.notWatchable',
      );
    if (source && !canManage(toViewer(viewer), video))
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'videoNotWatchable',
        'errors.videos.notWatchable',
      );
    if (!source) await this.chargeView(viewer, video, guest);
    const token = this.tokens.sign(
      videoId,
      viewer?.id ?? null,
      PLAYBACK_TOKEN_TTL_SEC,
      video.keyVersion,
      source,
    );
    return {
      playlistUrl: `${this.publicUrl}/api/stream/${videoId}/master.m3u8?t=${token}`,
      expiresAt: new Date(
        Date.now() + PLAYBACK_TOKEN_TTL_SEC * 1000,
      ).toISOString(),
    };
  }

  /**
   * A temporary link's page, once the links module checked the link is open to this
   * browser and carries the video: a token bound to the link, at most an hour and never past it.
   */
  async linkPlayback(
    videoId: string,
    linkId: string,
    until: Date,
  ): Promise<PlaybackDto> {
    const video = await this.loadVideo(videoId);
    if (!video || video.deletedAt || video.status !== 'READY') throw notFound();
    // Never past the link: a floor of a minute let a link that was about to end start a video up to
    // two minutes after it ended.
    const ttl = Math.max(
      1,
      Math.min(
        PLAYBACK_TOKEN_TTL_SEC,
        Math.floor((until.getTime() - Date.now()) / 1000),
      ),
    );
    const token = this.tokens.sign(
      videoId,
      null,
      ttl,
      video.keyVersion,
      false,
      linkId,
    );
    return {
      playlistUrl: `${this.publicUrl}/api/stream/${videoId}/master.m3u8?t=${token}`,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }

  /**
   * A guest's deal page, once the deals module checked the guest received the video: a token
   * bound to the deal, at most an hour and never past the guest's week.
   */
  async dealPlayback(
    videoId: string,
    dealId: string,
    until: Date,
  ): Promise<PlaybackDto> {
    const video = await this.loadVideo(videoId);
    if (!video || video.deletedAt || video.status !== 'READY') throw notFound();
    const ttl = Math.max(
      1,
      Math.min(
        PLAYBACK_TOKEN_TTL_SEC,
        Math.floor((until.getTime() - Date.now()) / 1000),
      ),
    );
    const token = this.tokens.sign(
      videoId,
      null,
      ttl,
      video.keyVersion,
      false,
      undefined,
      dealId,
    );
    return {
      playlistUrl: `${this.publicUrl}/api/stream/${videoId}/master.m3u8?t=${token}`,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }

  /** A link taken back: its videos stop playing at once, not after the cached minute. */
  async forgetLink(linkId: string, videoIds: string[]): Promise<void> {
    if (!videoIds.length) return;
    await this.redis
      .del(...videoIds.map((v) => linkDecisionKey(v, linkId)))
      .catch(() => undefined);
  }

  async masterPlaylist(
    videoId: string,
    token: string | undefined,
    session: RequestUser | undefined,
  ): Promise<string> {
    const { keyVersion, prefix } = await this.authorize(
      videoId,
      token,
      session,
    );
    const text = await this.cached(`hls:master:${videoId}:${keyVersion}`, () =>
      this.storage.getText('private', `${prefix}/master.m3u8`),
    );
    return text.replace(
      /^index\.m3u8\s*$/m,
      `${this.publicUrl}/api/stream/${videoId}/index.m3u8?t=${token}`,
    );
  }

  async mediaPlaylist(
    videoId: string,
    token: string | undefined,
    session: RequestUser | undefined,
  ): Promise<string> {
    const playing = await this.authorize(videoId, token, session);
    const rewritten = await this.cached(
      `hls:index:${videoId}:${playing.keyVersion}`,
      () => this.rewriteMediaPlaylist(playing),
    );
    return rewritten.replaceAll(
      KEY_URI_MARKER,
      `${this.publicUrl}/api/stream/${videoId}/key?t=${token}`,
    );
  }

  async key(
    videoId: string,
    token: string | undefined,
    session: RequestUser | undefined,
  ): Promise<Buffer> {
    const { keyVersion } = await this.authorize(videoId, token, session);
    return deriveHlsKey(this.kek, videoId, keyVersion);
  }

  /**
   * Forgets one person's cached decision on one video: a change in who holds it counts at once
   * instead of after DECISION_TTL_SEC.
   */
  async forgetDecision(videoId: string, userId: string): Promise<void> {
    await this.redis
      .del(
        decisionKey(videoId, userId, false),
        decisionKey(videoId, userId, true),
      )
      .catch(() => undefined);
  }

  // ------------------------------------------------------------------ internals

  /**
   * A view comes off someone's traffic when it starts: the viewer's, or for a guest the
   * author's, who made the video public. Own uploads and admins spend nothing.
   */
  private async chargeView(
    viewer: RequestUser | undefined,
    video: StreamVideo,
    guest: TrafficViewer,
  ): Promise<void> {
    if (viewer?.role === 'ADMIN' || viewer?.id === video.authorId) return;
    const accountId = viewer?.id ?? video.authorId;
    await this.traffic.charge({
      accountId,
      bytes: playbackSize(video),
      payer: viewer ? 'viewer' : 'sharer',
      seen: {
        keys: this.traffic.seenKeys(
          accountId,
          `view:${video.id}`,
          viewer ? { userId: viewer.id } : guest,
        ),
        windowSec: VIEW_WINDOW_SEC,
      },
    });
  }

  /**
   * Token + (for anything not public) the cookie session must agree with the token subject.
   * The decision is cached per (video, subject) for a minute.
   */
  private async authorize(
    videoId: string,
    rawToken: string | undefined,
    session: RequestUser | undefined,
  ): Promise<Playing> {
    const token = this.tokens.verify(rawToken);
    if (!token || token.v !== videoId) throw unauthorized();
    const video = await this.loadVideo(videoId);
    const editor = token.e === 1;
    if (
      !video ||
      !video.hlsPrefix ||
      (video.status !== 'READY' && !(editor && editInProgress(video.editJob)))
    )
      throw notFound();
    const subject = token.s;
    const cacheKey = token.l
      ? linkDecisionKey(videoId, token.l)
      : token.d
        ? `stream:${videoId}:deal:${token.d}`
        : decisionKey(videoId, subject, editor);
    const cached = await this.redis.get(cacheKey).catch(() => null);
    let allowed: boolean;
    if (cached !== null) allowed = cached === '1';
    else {
      allowed = token.l
        ? await this.decideLink(video, token.l)
        : token.d
          ? await this.decideDeal(video, token.d)
          : editor
            ? await this.decideEditor(video, subject)
            : await this.decide(video, subject);
      await this.redis
        .set(cacheKey, allowed ? '1' : '0', 'EX', DECISION_TTL_SEC)
        .catch(() => undefined);
    }
    if (!allowed) throw video.deletedAt ? notFound() : forbidden();
    // A private video additionally needs the live session of the token subject (a leaked URL is useless alone).
    if (
      video.visibility !== 'PUBLIC' &&
      subject !== null &&
      session?.id !== subject
    )
      throw unauthorized();
    // The version the token was given for; its files stay a few hours after an edit replaced it.
    const keyVersion = token.k ?? video.keyVersion;
    const prefix =
      keyVersion === video.keyVersion
        ? video.hlsPrefix
        : hlsPrefixOf(videoId, keyVersion);
    return { video, keyVersion, prefix };
  }

  private async decide(
    video: StreamVideo,
    subject: string | null,
  ): Promise<boolean> {
    if (subject === null) return canStream(null, video, null);
    const user = await this.prisma.user.findUnique({
      where: { id: subject },
      select: { id: true, role: true, tier: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE') return false;
    const holding = await this.prisma.videoAccess.findUnique({
      where: { videoId_holderId: { videoId: video.id, holderId: subject } },
      select: { holderId: true, source: true, hidden: true },
    });
    return canStream(user, video, holding);
  }

  /** A link's token: the link still works and still carries the video. */
  private async decideLink(
    video: StreamVideo,
    linkId: string,
  ): Promise<boolean> {
    const item = await this.prisma.shareLinkItem.findUnique({
      where: { linkId_videoId: { linkId, videoId: video.id } },
      select: {
        link: {
          select: {
            senderId: true,
            expiresAt: true,
            revokedAt: true,
            sender: { select: { status: true } },
          },
        },
      },
    });
    if (!item || !linkLive(item.link)) return false;
    const holding = await this.prisma.videoAccess.findUnique({
      where: {
        videoId_holderId: { videoId: video.id, holderId: item.link.senderId },
      },
      select: { holderId: true, source: true, hidden: true },
    });
    return linkCarries(video, holding);
  }

  /** A deal's token: accepted, the guest's week not over, the guest holds the video. */
  private async decideDeal(
    video: StreamVideo,
    dealId: string,
  ): Promise<boolean> {
    const deal = await this.prisma.videoRequest.findUnique({
      where: { id: dealId },
      select: { status: true, guestAccessUntil: true, requesterId: true },
    });
    if (
      !deal ||
      deal.status !== 'ACCEPTED' ||
      !deal.guestAccessUntil ||
      deal.guestAccessUntil < new Date()
    )
      return false;
    const holding = await this.prisma.videoAccess.findUnique({
      where: {
        videoId_holderId: { videoId: video.id, holderId: deal.requesterId },
      },
      select: { source: true },
    });
    return !!holding && holding.source !== 'AUTHOR';
  }

  /** An editor's token: its subject may still manage the video. */
  private async decideEditor(
    video: StreamVideo,
    subject: string | null,
  ): Promise<boolean> {
    if (subject === null) return false;
    const user = await this.prisma.user.findUnique({
      where: { id: subject },
      select: { id: true, role: true, tier: true, status: true },
    });
    return !!user && user.status === 'ACTIVE' && canManage(user, video);
  }

  private async rewriteMediaPlaylist({
    video,
    prefix,
  }: Playing): Promise<string> {
    const ttl = Math.max(Math.ceil(1.5 * (video.durationSec ?? 0)), 3600);
    const plain = await this.storage.getText('private', `${prefix}/index.m3u8`);
    const lines = await Promise.all(
      plain.split('\n').map(async (line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#'))
          return this.storage.presignGet(
            'private',
            `${prefix}/${trimmed}`,
            ttl,
          );
        if (trimmed.startsWith('#EXT-X-KEY'))
          return trimmed.replace(
            `URI="${HLS_KEY_URI_PLACEHOLDER}"`,
            `URI="${KEY_URI_MARKER}"`,
          );
        return line;
      }),
    );
    return lines.join('\n');
  }

  private async cached(
    key: string,
    load: () => Promise<string>,
  ): Promise<string> {
    const hit = await this.redis.get(key).catch(() => null);
    if (hit) return hit;
    const value = await load();
    await this.redis
      .set(key, value, 'EX', PLAYLIST_CACHE_TTL_SEC)
      .catch(() => undefined);
    return value;
  }

  /** Deleted videos too: the policy lets only the admin stream one from the trash. */
  private loadVideo(videoId: string): Promise<StreamVideo | null> {
    return this.prisma.video.findFirst({
      where: { id: videoId },
      select: {
        ...POLICY_SELECT,
        durationSec: true,
        hlsPrefix: true,
        keyVersion: true,
        editJob: true,
        playbackBytes: true,
        renderBytes: true,
        sizeBytes: true,
      },
    });
  }

  private async viewerHolding(
    viewer: RequestUser | undefined,
    videoId: string,
  ): Promise<PolicyHolding | null> {
    if (!viewer) return null;
    return this.prisma.videoAccess.findUnique({
      where: { videoId_holderId: { videoId, holderId: viewer.id } },
      select: { holderId: true, source: true, hidden: true },
    });
  }
}

export const POLICY_SELECT = {
  id: true,
  authorId: true,
  visibility: true,
  status: true,
  deletedAt: true,
  purgedAt: true,
} as const;

export function toViewer(user: RequestUser | undefined): Viewer {
  return user ? { id: user.id, role: user.role, tier: user.tier } : null;
}

const notFound = () =>
  new AppException(
    HttpStatus.NOT_FOUND,
    'videoNotFound',
    'errors.videos.notFound',
  );
const unauthorized = () =>
  new AppException(
    HttpStatus.UNAUTHORIZED,
    'playbackTokenInvalid',
    'errors.videos.playbackTokenInvalid',
  );
const forbidden = () =>
  new AppException(
    HttpStatus.FORBIDDEN,
    'videoNotWatchable',
    'errors.videos.notWatchable',
  );

const linkDecisionKey = (videoId: string, linkId: string) =>
  `stream:${videoId}:link:${linkId}`;

const decisionKey = (
  videoId: string,
  subject: string | null,
  editor: boolean,
) => `stream:${videoId}:${subject ?? 'guest'}${editor ? ':editor' : ''}`;
