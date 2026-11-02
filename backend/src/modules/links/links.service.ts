import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { Readable } from 'node:stream';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';

import type { RequestUser } from '../../common/auth/request-user.js';
import { hashPassword, verifyPassword } from '../../common/crypto/password.js';
import { siteName } from '../../common/i18n/i18n.js';
import { AppException } from '../../common/errors/app.exception.js';
import { normalizeEmail } from '../../common/validation/email.js';
import type { Env } from '../../config/env.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { MailDeliveryService } from '../../infra/mail/mail-delivery.service.js';
import {
  renderLinkCode,
  renderLinkInvite,
} from '../../infra/mail/templates.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../infra/redis/redis.module.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { canProtectLinks, isAdmin } from '../access/access-policy.js';
import { AnonymousLinksService } from '../anonymous-links/anonymous-links.service.js';
import { videoCard } from '../collection/video-card.js';
import { attachmentHeader } from '../downloads/download-rules.js';
import { fileOf } from '../downloads/downloads.service.js';
import { formatUtc } from '../notifications/notification-mail.js';
import { PlansService } from '../plans/plans.service.js';
import type { PlaybackDto } from '../streaming/streaming.dto.js';
import { StreamingService } from '../streaming/streaming.service.js';
import { toViewer } from '../streaming/streaming.service.js';
import {
  LINK_CODES_PER_HOUR,
  LINK_CODE_TRIES,
  LINK_CODE_TTL_SEC,
  LINK_MAX_ACTIVE,
  LINK_TTL_MS,
  linkCarries,
  linkLive,
  maskEmail,
} from './link-rules.js';
import type {
  CreateLinkDto,
  LinkPageDto,
  LinkVideoDto,
  MyLinkDto,
  SaveLinkDto,
  SaveLinkResultDto,
  UnlockLinkDto,
} from './links.dto.js';
import {
  type ZipEntry,
  uniqueNames,
  zipSize,
  zipStream,
} from './zip-writer.js';

/** Presigned links of downloads live as long as the other direct ones. */
const DOWNLOAD_URL_TTL_SEC = 120;
/** Pictures in a row of "My links". */
const PICTURES = 4;
/** How often an archive being sent looks whether its link was taken back elsewhere. */
export const ZIP_RECHECK_MS = 5_000;

/**
 * What a browser has passed on a link's page (a signed cookie): the password, the emailed
 * code. Bound to the link's id, so it never opens another one.
 */
export interface LinkPass {
  l: string;
  p?: 1;
  e?: 1;
}

const LINK_SELECT = {
  id: true,
  code: true,
  senderId: true,
  expiresAt: true,
  revokedAt: true,
  passwordHash: true,
  email: true,
  openedAt: true,
  createdAt: true,
  sender: {
    select: {
      username: true,
      displayName: true,
      avatarKey: true,
      status: true,
      pageHidden: true,
      locale: true,
    },
  },
} as const;
type LinkRow = Prisma.ShareLinkGetPayload<{ select: typeof LINK_SELECT }>;

const VIDEO_SELECT = {
  id: true,
  code: true,
  title: true,
  visibility: true,
  status: true,
  stage: true,
  progress: true,
  failReason: true,
  durationSec: true,
  width: true,
  height: true,
  sizeBytes: true,
  thumbnailKey: true,
  thumbnailSmallKey: true,
  contactSheetKey: true,
  assetPrefix: true,
  smallFrames: true,
  sensitive: true,
  createdAt: true,
  deletedAt: true,
  authorId: true,
  originalKey: true,
  originalFilename: true,
  mimeType: true,
  renderKey: true,
  renderBytes: true,
  author: { select: { id: true, username: true, displayName: true } },
} as const;
type LinkVideo = Prisma.VideoGetPayload<{ select: typeof VIDEO_SELECT }>;

/** A video the link still carries, with the sender's own name for it. */
interface Item {
  video: LinkVideo;
  title: string;
}

/**
 * Temporary links. A Pro sender puts videos on a page
 * at /t/<code>; whoever has the link (and passes its password, its emailed code) watches them,
 * downloads them without the tier's limits — one by one straight from storage, or all as one ZIP —
 * and puts them on their own shelf as a copy shared by the sender, for good. When the time is up,
 * the link is taken back or nothing is left in it, the page is a 404.
 */
@Injectable()
export class LinksService {
  private readonly publicUrl: string;
  /** Archives being sent, by link: taking the link back cuts them at once. */
  private readonly sending = new Map<string, Set<Readable>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly plans: PlansService,
    private readonly streaming: StreamingService,
    private readonly outbox: OutboxService,
    private readonly mail: MailDeliveryService,
    private readonly anonymous: AnonymousLinksService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService<Env, true>,
  ) {
    this.publicUrl = config
      .get('PUBLIC_URL', { infer: true })
      .replace(/\/$/, '');
  }

  // ------------------------------------------------------------------ the sender

  async create(user: RequestUser, dto: CreateLinkDto): Promise<MyLinkDto> {
    if (dto.password && !canProtectLinks(toViewer(user)!, this.plans.hasTiers))
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'linkPasswordPro',
        'errors.links.passwordPro',
      );
    const ids = [...new Set(dto.videoIds)];
    const now = new Date();
    // The links the sender's list shows: one whose videos have all gone is neither listed nor
    // anything they could take back, so it does not count either.
    const active = (await this.mine(user.id)).length;
    if (active >= LINK_MAX_ACTIVE)
      throw new AppException(
        HttpStatus.CONFLICT,
        'linkTooMany',
        'errors.links.tooMany',
        { params: { max: LINK_MAX_ACTIVE } },
      );
    const items = await this.carried(user.id, ids);
    if (items.length !== ids.length)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'linkVideoNotAllowed',
        'errors.links.videoNotAllowed',
      );
    const email = dto.email ? normalizeEmail(dto.email) : null;
    const passwordHash = dto.password ? await hashPassword(dto.password) : null;
    const link = await this.prisma.shareLink.create({
      data: {
        code: randomBytes(9).toString('base64url'),
        senderId: user.id,
        expiresAt: new Date(now.getTime() + LINK_TTL_MS[dto.ttl]),
        passwordHash,
        email,
        items: {
          create: ids.map((videoId, position) => ({ videoId, position })),
        },
      },
      select: LINK_SELECT,
    });
    if (email) await this.invite(link, items, email);
    return this.toMine(link, items);
  }

  /** My links that still work, newest first. */
  async mine(userId: string): Promise<MyLinkDto[]> {
    const links = await this.prisma.shareLink.findMany({
      where: {
        senderId: userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        ...LINK_SELECT,
        items: { select: { videoId: true }, orderBy: { position: 'asc' } },
      },
    });
    const ids = [
      ...new Set(links.flatMap((l) => l.items.map((i) => i.videoId))),
    ];
    const carried = new Map(
      (await this.carried(userId, ids)).map((i) => [i.video.id, i]),
    );
    return links
      .map((link) =>
        this.toMine(
          link,
          link.items.flatMap((i) => carried.get(i.videoId) ?? []),
        ),
      )
      .filter((l) => l.count > 0);
  }

  /** Taken back before its time: a 404 from now on, its videos stop playing at once. */
  async revoke(userId: string, id: string): Promise<void> {
    const link = await this.prisma.shareLink.findFirst({
      where: { id, senderId: userId, revokedAt: null },
      select: { id: true, items: { select: { videoId: true } } },
    });
    if (!link) throw notFound();
    await this.prisma.shareLink.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    for (const body of this.sending.get(id) ?? []) body.destroy();
    await this.streaming.forgetLink(
      id,
      link.items.map((i) => i.videoId),
    );
  }

  // ------------------------------------------------------------------ whoever has the link

  async page(
    code: string,
    viewer: RequestUser | undefined,
    pass: LinkPass | null,
  ): Promise<LinkPageDto> {
    const { link, items } = await this.load(code);
    const needs = await this.needs(link, viewer, pass);
    const own = viewer?.id === link.senderId;
    const open = !needs.password && !needs.code;
    if (open && !own && !isAdmin(toViewer(viewer)))
      await this.markOpened(link, items, viewer);
    const videos = open
      ? await this.videosFor(items, viewer, link.senderId)
      : [];
    const entries = open ? this.entries(items) : [];
    return {
      sender: {
        username: link.sender.username,
        displayName: link.sender.displayName,
        avatarUrl: link.sender.avatarKey
          ? this.storage.publicUrl(link.sender.avatarKey)
          : null,
        pageHidden: link.sender.pageHidden,
      },
      expiresAt: link.expiresAt.toISOString(),
      expiresInSec: secondsLeft(link.expiresAt),
      count: items.length,
      access: open ? 'open' : 'locked',
      needsPassword: needs.password,
      needsCode: needs.code,
      emailHint: needs.code && link.email ? maskEmail(link.email) : null,
      own,
      videos,
      totalBytes: entries.reduce((n, e) => n + e.size, 0),
      zipBytes: entries.length ? zipSize(entries) : 0,
    };
  }

  /** The password, the emailed code: what passes is remembered in the returned pass. */
  async unlock(
    code: string,
    viewer: RequestUser | undefined,
    pass: LinkPass | null,
    dto: UnlockLinkDto,
  ): Promise<{ pass: LinkPass; page: LinkPageDto }> {
    const { link } = await this.load(code);
    let next: LinkPass = pass?.l === link.id ? { ...pass } : { l: link.id };
    if (dto.password !== undefined && link.passwordHash) {
      if (!(await verifyPassword(link.passwordHash, dto.password)))
        throw new AppException(
          HttpStatus.FORBIDDEN,
          'linkWrongPassword',
          'errors.links.wrongPassword',
        );
      next = { ...next, p: 1 };
    }
    if (dto.code !== undefined && link.email) {
      if (!(await this.takeCode(link.id, dto.code.trim())))
        throw new AppException(
          HttpStatus.FORBIDDEN,
          'linkWrongCode',
          'errors.links.wrongCode',
        );
      next = { ...next, e: 1 };
    }
    return { pass: next, page: await this.page(code, viewer, next) };
  }

  /** A code to the link's address: once a minute, five an hour. */
  async sendCode(code: string, locale: string): Promise<void> {
    const { link } = await this.load(code);
    if (!link.email)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'linkNoEmail',
        'errors.links.noEmail',
      );
    const fresh = await this.redis.set(
      codeSentKey(link.id),
      '1',
      'EX',
      60,
      'NX',
    );
    if (fresh !== 'OK')
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        'linkCodeTooSoon',
        'errors.links.codeTooSoon',
      );
    // Counted and given its hour in one step: a key left without one would block the link's codes
    // for good.
    const counted = await this.redis
      .multi()
      .incr(codeHourKey(link.id))
      .expire(codeHourKey(link.id), 3600, 'NX')
      .exec();
    const sent = Number(counted?.[0]?.[1] ?? 0);
    if (sent > LINK_CODES_PER_HOUR)
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        'linkCodeLimit',
        'errors.links.codeLimit',
      );
    const digits = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.redis
      .multi()
      .del(codeKey(link.id))
      .hset(codeKey(link.id), { h: digest(digits), n: 0 })
      .expire(codeKey(link.id), LINK_CODE_TTL_SEC)
      .exec();
    await this.mail.deliver(
      link.email,
      renderLinkCode(locale, { username: link.sender.username, code: digits }),
    );
  }

  async playback(
    code: string,
    videoId: string,
    viewer: RequestUser | undefined,
    pass: LinkPass | null,
  ): Promise<PlaybackDto> {
    const { link, item } = await this.openItem(code, videoId, viewer, pass);
    return this.streaming.linkPlayback(item.video.id, link.id, link.expiresAt);
  }

  /** Straight from storage at full speed: the link is the sender's Pro, not a tier. */
  async download(
    code: string,
    videoId: string,
    viewer: RequestUser | undefined,
    pass: LinkPass | null,
  ): Promise<string> {
    const { item } = await this.openItem(code, videoId, viewer, pass);
    const file = fileOf(item.video);
    return this.storage.presignGet('private', file.key, DOWNLOAD_URL_TTL_SEC, {
      contentDisposition: attachmentHeader(file.filename),
    });
  }

  /** Every video in one ZIP, streamed through the API, its length known up front. */
  async zip(
    code: string,
    viewer: RequestUser | undefined,
    pass: LinkPass | null,
  ): Promise<{ filename: string; size: number; body: Readable }> {
    const { link, items } = await this.openLink(code, viewer, pass);
    // The files' real lengths: one byte off and the archive would break at its end.
    const heads = await Promise.all(
      items.map((i) => this.storage.head('private', fileOf(i.video).key)),
    );
    const entries = this.entries(items).map((e, i) => ({
      ...e,
      size: heads[i]?.size ?? e.size,
    }));
    const body = Readable.from(zipStream(entries));
    this.watch(link.id, body);
    return {
      filename: `${siteName()}-${link.sender.username}.zip`,
      size: zipSize(entries),
      body,
    };
  }

  /** On the viewer's shelf as a copy the sender shared, for good. */
  async save(
    code: string,
    user: RequestUser,
    pass: LinkPass | null,
    dto: SaveLinkDto,
  ): Promise<SaveLinkResultDto> {
    const { link, items } = await this.openLink(code, user, pass);
    const wanted = dto.videoIds
      ? items.filter((i) => dto.videoIds!.includes(i.video.id))
      : items;
    if (user.id === link.senderId)
      return { added: 0, onShelf: wanted.map((i) => i.video.id) };
    const blocked = await this.prisma.block.count({
      where: {
        OR: [
          { blockerId: user.id, blockedId: link.senderId },
          { blockerId: link.senderId, blockedId: user.id },
        ],
      },
    });
    if (blocked)
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'linkBlocked',
        'errors.links.blocked',
      );
    const ids = wanted.map((i) => i.video.id);
    const added = await this.prisma.$transaction(async (tx) => {
      const held = await tx.videoAccess.findMany({
        where: { holderId: user.id, videoId: { in: ids } },
        select: { id: true, videoId: true, source: true },
      });
      const heldBy = new Map(held.map((h) => [h.videoId, h]));
      const fresh = wanted.filter(
        (i) => !heldBy.has(i.video.id) && i.video.authorId !== user.id,
      );
      // A bookmark of a public video becomes a copy that stays.
      const bookmarks = held.filter((h) => h.source === 'PUBLIC_ADD');
      // A video whose author goes by an anonymous link in the sender's copy goes on so.
      const passed = await this.anonymous.passedOn(
        tx,
        link.senderId,
        fresh.map((i) => i.video.id),
        null,
      );
      if (fresh.length)
        await tx.videoAccess.createMany({
          data: fresh.map((i) => ({
            videoId: i.video.id,
            holderId: user.id,
            source: 'SHARE' as const,
            grantedById: link.senderId,
            unseen: true,
            anonymousLinkId: passed.get(i.video.id) ?? null,
          })),
          skipDuplicates: true,
        });
      if (bookmarks.length)
        await tx.videoAccess.updateMany({
          where: { id: { in: bookmarks.map((b) => b.id) } },
          data: { source: 'SHARE', grantedById: link.senderId, unseen: true },
        });
      const addedIds = new Set([
        ...fresh.map((i) => i.video.id),
        ...bookmarks.map((b) => b.videoId),
      ]);
      const first = wanted.find((i) => addedIds.has(i.video.id));
      if (first) {
        const me = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
          select: { username: true, displayName: true },
        });
        await this.outbox.emit(tx, 'notify', {
          deliveries: [
            {
              userId: link.senderId,
              type: 'LINK_SAVED',
              payload: {
                linkId: link.id,
                userId: user.id,
                fromName: me.displayName,
                fromUsername: me.username,
                count: addedIds.size,
                title: first.title,
              },
            },
          ],
        });
      }
      return [...addedIds];
    });
    if (added.length) {
      await this.outbox.nudge();
      await Promise.all(
        added.map((videoId) => this.streaming.forgetDecision(videoId, user.id)),
      );
    }
    return { added: added.length, onShelf: ids };
  }

  // ------------------------------------------------------------------ internals

  /** The link and the videos it still carries; a link gone or empty is a 404. */
  private async load(code: string): Promise<{ link: LinkRow; items: Item[] }> {
    const link = await this.prisma.shareLink.findUnique({
      where: { code },
      select: {
        ...LINK_SELECT,
        items: { select: { videoId: true }, orderBy: { position: 'asc' } },
      },
    });
    if (!link || !linkLive(link)) throw notFound();
    const items = await this.carried(
      link.senderId,
      link.items.map((i) => i.videoId),
    );
    if (!items.length) throw notFound();
    return { link, items };
  }

  /** Of these videos, in this order, the ones `senderId` may still pass on by a link. */
  private async carried(senderId: string, ids: string[]): Promise<Item[]> {
    if (!ids.length) return [];
    const [videos, holdings] = await Promise.all([
      this.prisma.video.findMany({
        where: { id: { in: ids } },
        select: VIDEO_SELECT,
      }),
      this.prisma.videoAccess.findMany({
        where: { holderId: senderId, videoId: { in: ids } },
        select: {
          videoId: true,
          holderId: true,
          source: true,
          hidden: true,
          customTitle: true,
        },
      }),
    ]);
    const byId = new Map(videos.map((v) => [v.id, v]));
    const heldBy = new Map(holdings.map((h) => [h.videoId, h]));
    return ids.flatMap((id) => {
      const video = byId.get(id);
      const holding = heldBy.get(id) ?? null;
      if (!video || !linkCarries(video, holding)) return [];
      return [{ video, title: holding?.customTitle ?? video.title }];
    });
  }

  /** What the viewer still has to pass: the sender and admins pass by themselves. */
  private async needs(
    link: LinkRow,
    viewer: RequestUser | undefined,
    pass: LinkPass | null,
  ): Promise<{ password: boolean; code: boolean }> {
    if (viewer && (viewer.id === link.senderId || isAdmin(toViewer(viewer))))
      return { password: false, code: false };
    const own = pass?.l === link.id ? pass : null;
    let code = !!link.email && !own?.e;
    // Signed in with that very address, confirmed: no code to wait for.
    if (code && viewer?.emailVerified) {
      const me = await this.prisma.user.findUnique({
        where: { id: viewer.id },
        select: { email: true },
      });
      if (me?.email && normalizeEmail(me.email) === link.email) code = false;
    }
    return { password: !!link.passwordHash && !own?.p, code };
  }

  private async openLink(
    code: string,
    viewer: RequestUser | undefined,
    pass: LinkPass | null,
  ): Promise<{ link: LinkRow; items: Item[] }> {
    const loaded = await this.load(code);
    const needs = await this.needs(loaded.link, viewer, pass);
    if (needs.password || needs.code)
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'linkLocked',
        'errors.links.locked',
      );
    return loaded;
  }

  private async openItem(
    code: string,
    videoId: string,
    viewer: RequestUser | undefined,
    pass: LinkPass | null,
  ): Promise<{ link: LinkRow; item: Item }> {
    const { link, items } = await this.openLink(code, viewer, pass);
    const item = items.find((i) => i.video.id === videoId);
    if (!item) throw notFound();
    return { link, item };
  }

  private async videosFor(
    items: Item[],
    viewer: RequestUser | undefined,
    senderId: string,
  ): Promise<LinkVideoDto[]> {
    const ids = items.map((i) => i.video.id);
    const [held, sent] = await Promise.all([
      viewer
        ? this.prisma.videoAccess.findMany({
            where: {
              holderId: viewer.id,
              videoId: { in: ids },
              source: { not: 'PUBLIC_ADD' },
            },
            select: { videoId: true },
          })
        : Promise.resolve([]),
      // The sender's copies keep the masks they came with.
      this.prisma.videoAccess.findMany({
        where: {
          holderId: senderId,
          videoId: { in: ids },
          anonymousLinkId: { not: null },
        },
        select: { videoId: true, anonymousLinkId: true },
      }),
    ]);
    const onShelf = new Set(held.map((h) => h.videoId));
    const masks = new Map(sent.map((h) => [h.videoId, h.anonymousLinkId]));
    const masker = this.anonymous.masker(viewer);
    const videos = items.map((i) => ({
      video: masker.card(
        Object.assign(videoCard(this.storage, i.video, i.video.author), {
          title: i.title,
        }),
        { holding: masks.get(i.video.id) },
      ),
      fileBytes: fileOf(i.video).sizeBytes,
      onShelf: onShelf.has(i.video.id) || i.video.authorId === viewer?.id,
    }));
    await masker.apply();
    return videos;
  }

  private entries(items: Item[]): ZipEntry[] {
    const names = uniqueNames(items.map((i) => fileOf(i.video).filename));
    return items.map((i, n) => {
      const file = fileOf(i.video);
      return {
        name: names[n]!,
        size: file.sizeBytes,
        modified: i.video.createdAt,
        open: async () =>
          (await this.storage.getStream('private', file.key)).body,
      };
    });
  }

  /**
   * Taken back, or its sender banned, the link stops its archive too: at once in this process,
   * within ZIP_RECHECK_MS in another. Time running out does not — an archive begun in time is
   * finished, as a single file begun from the storage is.
   */
  private watch(linkId: string, body: Readable): void {
    const bodies = this.sending.get(linkId) ?? new Set<Readable>();
    bodies.add(body);
    this.sending.set(linkId, bodies);
    const timer = setInterval(() => {
      this.prisma.shareLink
        .findUnique({
          where: { id: linkId },
          select: { revokedAt: true, sender: { select: { status: true } } },
        })
        .then(
          (link) => {
            if (!link || link.revokedAt || link.sender.status !== 'ACTIVE')
              body.destroy();
          },
          () => undefined,
        );
    }, ZIP_RECHECK_MS);
    timer.unref();
    body.once('close', () => {
      clearInterval(timer);
      bodies.delete(body);
      if (!bodies.size && this.sending.get(linkId) === bodies)
        this.sending.delete(linkId);
    });
  }

  /** The first opening by someone else tells the sender, once. */
  private async markOpened(
    link: LinkRow,
    items: Item[],
    viewer: RequestUser | undefined,
  ): Promise<void> {
    if (link.openedAt) return;
    const who = viewer
      ? await this.prisma.user.findUnique({
          where: { id: viewer.id },
          select: { username: true, displayName: true },
        })
      : null;
    const told = await this.prisma.$transaction(async (tx) => {
      const first = await tx.shareLink.updateMany({
        where: { id: link.id, openedAt: null },
        data: { openedAt: new Date() },
      });
      if (!first.count) return false;
      await this.outbox.emit(tx, 'notify', {
        deliveries: [
          {
            userId: link.senderId,
            type: 'LINK_OPENED',
            payload: {
              linkId: link.id,
              count: items.length,
              title: items[0]!.title,
              fromName: who?.displayName ?? null,
              fromUsername: who?.username ?? null,
            },
          },
        ],
      });
      return true;
    });
    if (told) await this.outbox.nudge();
  }

  /** The letter to the link's address: in their language when they have an account here. */
  private async invite(
    link: LinkRow,
    items: Item[],
    email: string,
  ): Promise<void> {
    const account = await this.prisma.user.findFirst({
      where: { email },
      select: { locale: true },
    });
    const locale = account?.locale ?? link.sender.locale;
    await this.mail.deliver(
      email,
      renderLinkInvite(locale, {
        name: link.sender.displayName,
        username: link.sender.username,
        count: items.length,
        title: items[0]!.title,
        date: formatUtc(locale, link.expiresAt.toISOString()),
        link: `${this.publicUrl}/t/${link.code}`,
      }),
    );
  }

  private toMine(link: LinkRow, items: Item[]): MyLinkDto {
    return {
      id: link.id,
      code: link.code,
      expiresAt: link.expiresAt.toISOString(),
      expiresInSec: secondsLeft(link.expiresAt),
      createdAt: link.createdAt.toISOString(),
      count: items.length,
      pictures: items.slice(0, PICTURES).flatMap((i) => {
        const key = i.video.thumbnailSmallKey ?? i.video.thumbnailKey;
        return key ? [this.storage.publicUrl(key)] : [];
      }),
      hasPassword: !!link.passwordHash,
      email: link.email,
      opened: !!link.openedAt,
    };
  }

  /**
   * The code is spent when it opens the link; five wrong tries spend it too. Each try is counted in
   * the same step that reads the code: tries sent at once each take one of the five.
   */
  private async takeCode(linkId: string, digits: string): Promise<boolean> {
    const taken = (await this.redis.eval(TAKE_TRY, 1, codeKey(linkId))) as
      [string, number] | null;
    if (!taken) return false;
    const [stored, tries] = taken;
    const given = Buffer.from(digest(digits));
    const ok =
      given.length === stored.length &&
      timingSafeEqual(given, Buffer.from(stored));
    if (ok || tries >= LINK_CODE_TRIES) await this.redis.del(codeKey(linkId));
    return ok;
  }
}

/** Seconds until then by the server's clock, never below zero. */
const secondsLeft = (at: Date) =>
  Math.max(0, Math.floor((at.getTime() - Date.now()) / 1000));
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
/**
 * The code's hash and this try's number, the try counted; nothing once the code is gone (or is one
 * kept the earlier way, as a string: asked for again, it comes in this form).
 */
const TAKE_TRY = `
if redis.call('TYPE', KEYS[1]).ok ~= 'hash' then return nil end
local h = redis.call('HGET', KEYS[1], 'h')
if not h then return nil end
return { h, redis.call('HINCRBY', KEYS[1], 'n', 1) }
`;
const codeKey = (linkId: string) => `link:code:${linkId}`;
const codeSentKey = (linkId: string) => `link:code:sent:${linkId}`;
const codeHourKey = (linkId: string) => `link:code:hour:${linkId}`;

const notFound = () =>
  new AppException(
    HttpStatus.NOT_FOUND,
    'linkNotFound',
    'errors.links.notFound',
  );
