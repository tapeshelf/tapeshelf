import { Injectable, Logger } from '@nestjs/common';

import { OutboxService } from '../../infra/outbox/outbox.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { quoteOf } from '../exchange/request-locks.js';
import { VideoPurgeService } from '../trash/video-purge.service.js';

const DAY_MS = 24 * 3600 * 1000;
/** A deal with a guest ends three days after its last round. */
export const GUEST_DEAL_TTL_MS = 3 * DAY_MS;
/** A guest watches and downloads what they received this long. */
export const GUEST_ACCESS_MS = 7 * DAY_MS;
/** Videos a guest may upload for one deal (as Free). */
export const GUEST_MAX_UPLOADS = 5;
/** A draft its guest never sent goes after a day; one whose videos never got ready, after a week. */
const DRAFT_UNSENT_MS = DAY_MS;
const DRAFT_STUCK_MS = 7 * DAY_MS;

/**
 * What a guest uploads waits on our servers only while their deal goes on: the holder sees
 * its title, size, quality and contact sheet, never the video; once the deal ends without handing
 * it over, it is deleted and erased at once. Runs in the API after each move and in the worker
 * every minute (drafts reaching the holder, deals running out).
 */
@Injectable()
export class GuestEscrowService {
  private readonly logger = new Logger(GuestEscrowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly purge: VideoPurgeService,
    private readonly outbox: OutboxService,
  ) {}

  /** What a guest uploaded for the deal and nobody else holds: deleted and erased now. */
  async discard(dealId: string): Promise<number> {
    const videos = await this.prisma.video.findMany({
      where: {
        dealId,
        purgedAt: null,
        author: { status: 'GUEST' },
        holdings: { none: { source: { not: 'AUTHOR' } } },
      },
      select: { id: true, authorId: true },
    });
    if (!videos.length) return 0;
    return this.discardVideos(videos.map((v) => v.id));
  }

  /** Guest uploads deleted and erased now (nobody but their guest holds them). */
  async discardVideos(ids: string[]): Promise<number> {
    const videos = await this.prisma.video.findMany({
      where: {
        id: { in: ids },
        purgedAt: null,
        author: { status: 'GUEST' },
        holdings: { none: { source: { not: 'AUTHOR' } } },
      },
      select: { id: true, authorId: true },
    });
    if (!videos.length) return 0;
    const now = new Date();
    const found = videos.map((v) => v.id);
    await this.prisma.video.updateMany({
      where: { id: { in: found }, deletedAt: null },
      data: {
        deletedAt: now,
        deletedById: videos[0]!.authorId,
        deleteReason: 'USER',
        trashExitAt: now,
        trashExit: 'REMOVED',
      },
    });
    const done = await this.purge.purge(videos[0]!.authorId, found);
    if (done.skipped.length)
      this.logger.warn(
        `${done.skipped.length} guest video(s) not erased yet; the sweep tries again`,
      );
    return done.done;
  }

  /**
   * After a move: a deal with a guest that is over lets go of what the guest did not hand over; an
   * accepted one opens the guest's week to watch and download.
   */
  async settle(dealId: string): Promise<void> {
    const deal = await this.prisma.videoRequest.findUnique({
      where: { id: dealId },
      select: {
        status: true,
        guestAccessUntil: true,
        requester: { select: { status: true } },
      },
    });
    if (!deal || deal.requester.status !== 'GUEST') return;
    if (deal.status === 'OPEN' || deal.status === 'DRAFT') return;
    if (deal.status === 'ACCEPTED' && !deal.guestAccessUntil)
      await this.prisma.videoRequest.update({
        where: { id: dealId },
        data: {
          guestAccessUntil: new Date(Date.now() + GUEST_ACCESS_MS),
          expiresAt: null,
        },
      });
    await this.discard(dealId);
  }

  /** Sent drafts whose videos are all ready reach the holder; one deal or every one. */
  async promote(dealId?: string): Promise<number> {
    const drafts = await this.prisma.videoRequest.findMany({
      where: {
        status: 'DRAFT',
        awaitingUserId: { not: null },
        ...(dealId ? { id: dealId } : {}),
      },
      select: {
        id: true,
        holderId: true,
        message: true,
        offers: {
          where: { round: 0 },
          select: {
            items: {
              select: {
                givingSide: true,
                video: { select: { title: true, status: true } },
              },
            },
          },
        },
      },
    });
    let promoted = 0;
    for (const d of drafts) {
      const items = d.offers[0]?.items ?? [];
      const given = items.filter((i) => i.givingSide === 'REQUESTER');
      const asked = items.filter((i) => i.givingSide === 'HOLDER');
      if (!given.length || !asked.length) continue;
      if (given.some((i) => i.video.status !== 'READY')) continue;
      const done = await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.videoRequest.updateMany({
          where: { id: d.id, status: 'DRAFT' },
          data: {
            status: 'OPEN',
            expiresAt: new Date(Date.now() + GUEST_DEAL_TTL_MS),
          },
        });
        if (!count) return false;
        await this.outbox.emit(tx, 'notify', {
          deliveries: [
            {
              userId: d.holderId,
              type: 'REQUEST_RECEIVED',
              payload: {
                requestId: d.id,
                fromName: '',
                fromUsername: '',
                guest: true,
                count: asked.length,
                title: asked[0]!.video.title,
                message: quoteOf(d.message),
                offered: given.length,
              },
            },
          ],
        });
        return true;
      });
      if (done) promoted++;
    }
    if (promoted) await this.outbox.nudge();
    return promoted;
  }

  /** Deals with guests left three days without a move end; unsent drafts go. */
  async expire(now = new Date()): Promise<number> {
    const due = await this.prisma.videoRequest.findMany({
      where: { status: 'OPEN', expiresAt: { lt: now } },
      select: { id: true },
    });
    let ended = 0;
    for (const { id } of due) {
      const done = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM "VideoRequest" WHERE id = ${id}::uuid FOR UPDATE`;
        const r = await tx.videoRequest.findUnique({
          where: { id },
          select: {
            status: true,
            expiresAt: true,
            holderId: true,
            requesterId: true,
            currentOfferId: true,
            offers: {
              where: { round: 0 },
              select: {
                items: {
                  where: { givingSide: 'HOLDER' },
                  select: { video: { select: { title: true } } },
                  take: 1,
                },
              },
            },
          },
        });
        if (!r || r.status !== 'OPEN' || !r.expiresAt || r.expiresAt >= now)
          return false;
        if (r.currentOfferId)
          await tx.exchangeOffer.update({
            where: { id: r.currentOfferId },
            data: { status: 'VOID', respondedAt: now },
          });
        await tx.videoRequest.update({
          where: { id },
          data: { status: 'EXPIRED', awaitingUserId: null, resolvedAt: now },
        });
        const title = r.offers[0]?.items[0]?.video.title ?? '';
        await this.outbox.emit(tx, 'notify', {
          deliveries: [r.holderId, r.requesterId].map((userId) => ({
            userId,
            type: 'REQUEST_INVALIDATED' as const,
            payload: { requestId: id, reason: 'expired', title },
          })),
        });
        return true;
      });
      if (done) {
        ended++;
        await this.settle(id);
      }
    }
    // Drafts: not sent within a day, or whose videos never got ready within a week.
    const stale = await this.prisma.videoRequest.findMany({
      where: {
        status: 'DRAFT',
        OR: [
          {
            awaitingUserId: null,
            createdAt: { lt: new Date(now.getTime() - DRAFT_UNSENT_MS) },
          },
          { createdAt: { lt: new Date(now.getTime() - DRAFT_STUCK_MS) } },
        ],
      },
      select: { id: true },
    });
    for (const { id } of stale) await this.dropDraft(id);
    if (ended) await this.outbox.nudge();
    return ended;
  }

  /** A draft the holder never saw goes without a trace: its uploads erased, the request deleted. */
  async dropDraft(id: string): Promise<void> {
    await this.discard(id);
    await this.prisma.videoRequest.deleteMany({
      where: { id, status: 'DRAFT' },
    });
  }

  /** Every minute in the worker: drafts on, deals out, and whatever a missed settle left behind. */
  async sweep(): Promise<{ promoted: number; expired: number }> {
    const promoted = await this.promote();
    const expired = await this.expire();
    const left = await this.prisma.video.findMany({
      where: {
        dealId: { not: null },
        purgedAt: null,
        author: { status: 'GUEST' },
        deal: { status: { notIn: ['OPEN', 'DRAFT'] } },
        holdings: { none: { source: { not: 'AUTHOR' } } },
      },
      select: { dealId: true },
      distinct: ['dealId'],
      take: 50,
    });
    for (const v of left) await this.settle(v.dealId!);
    return { promoted, expired };
  }
}
