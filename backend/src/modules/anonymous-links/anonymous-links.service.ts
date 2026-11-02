import { HttpStatus, Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';

import type { RequestUser } from '../../common/auth/request-user.js';
import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import {
  type PolicyViewer,
  canMakeAnonymousLinks,
} from '../access/access-policy.js';
import { PlansService } from '../plans/plans.service.js';
import {
  ANONYMOUS_CODE,
  ANONYMOUS_MAX_LINKS,
  anonymousCodeOf,
  namesNickname,
  newAnonymousCode,
  personaName,
} from './anonymous-link-rules.js';
import type {
  CreateAnonymousLinkDto,
  MyAnonymousLinkDto,
  MyAnonymousLinksDto,
} from './anonymous-links.dto.js';
import { LINK_FACTS_SELECT, Masker, linkFacts } from './masker.js';

/** A link that opens, as the API resolves `~<code>`. */
export interface OpenAnonymousLink {
  id: string;
  code: string;
  ownerId: string;
  /** The name the owner goes by through it; '' = "Anonymous" in the reader's language. */
  name: string;
}

/**
 * Anonymous links to one's shelf: the owner makes, lists and deletes them; the rest
 * of the app resolves them where it takes a username and masks their owner out of what it answers.
 */
@Injectable()
export class AnonymousLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly plans: PlansService,
  ) {}

  /** Collects what an answer to `viewer` must mask (see Masker). */
  masker(viewer: Pick<PolicyViewer, 'id' | 'role'> | null | undefined): Masker {
    return new Masker(
      this.prisma,
      this.storage,
      this.plans.hasTiers,
      viewer ?? null,
    );
  }

  async create(
    user: RequestUser,
    dto: CreateAnonymousLinkDto,
  ): Promise<MyAnonymousLinkDto> {
    if (!canMakeAnonymousLinks(user, this.plans.hasTiers))
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'anonymousLinkPro',
        'errors.anonymousLinks.pro',
      );
    const kept = await this.prisma.anonymousLink.count({
      where: { ownerId: user.id, deletedAt: null },
    });
    if (kept >= ANONYMOUS_MAX_LINKS)
      throw new AppException(
        HttpStatus.CONFLICT,
        'anonymousLinkTooMany',
        'errors.anonymousLinks.tooMany',
        { params: { max: ANONYMOUS_MAX_LINKS } },
      );
    const note = dto.note?.trim() || null;
    const name = dto.name?.trim() || null;
    const owner = await this.nicknames(user.id);
    // Through the link the owner goes by their display name or the link's own; neither may give
    // their nickname away.
    if (
      name
        ? namesNickname(name, owner.nicknames)
        : namesNickname(owner.displayName, owner.nicknames)
    )
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'anonymousLinkName',
        name
          ? 'errors.anonymousLinks.nameNamesNickname'
          : 'errors.anonymousLinks.nameNeeded',
      );
    // 31^10 codes: a clash is all but impossible, and a second draw settles it.
    for (let attempt = 0; ; attempt++) {
      try {
        const link = await this.prisma.anonymousLink.create({
          data: {
            code: newAnonymousCode(randomInt),
            ownerId: user.id,
            note,
            name,
          },
        });
        return toMine(link, owner, true);
      } catch (err) {
        if ((err as { code?: string }).code !== 'P2002' || attempt >= 3)
          throw err;
      }
    }
  }

  async mine(user: RequestUser): Promise<MyAnonymousLinksDto> {
    const [links, owner] = await Promise.all([
      this.prisma.anonymousLink.findMany({
        where: { ownerId: user.id, deletedAt: null },
        orderBy: { id: 'desc' },
      }),
      this.nicknames(user.id),
    ]);
    const works = canMakeAnonymousLinks(user, this.plans.hasTiers);
    return {
      links: links.map((l) => toMine(l, owner, works)),
      nameNeeded: namesNickname(owner.displayName, owner.nicknames),
    };
  }

  /** The display name and every nickname a person has had: what a name must not give away. */
  private async nicknames(
    userId: string,
  ): Promise<{ displayName: string; nicknames: string[] }> {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        displayName: true,
        username: true,
        usernameHistory: { select: { username: true } },
      },
    });
    return {
      displayName: u.displayName,
      nicknames: [u.username, ...u.usernameHistory.map((h) => h.username)],
    };
  }

  /** Deleted, the link is a 404; what came of it goes on showing the owner by it. */
  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.anonymousLink.updateMany({
      where: { id, ownerId: userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (!count) throw anonymousLinkNotFound();
  }

  /** The link behind `~<code>` (or a bare code) while it opens: not deleted, its owner active and on Pro. */
  async resolve(handleOrCode: string): Promise<OpenAnonymousLink | null> {
    const code =
      anonymousCodeOf(handleOrCode) ??
      (ANONYMOUS_CODE.test(handleOrCode) ? handleOrCode : null);
    if (!code) return null;
    const link = await this.prisma.anonymousLink.findUnique({
      where: { code },
      select: LINK_FACTS_SELECT,
    });
    if (!link) return null;
    const facts = linkFacts(link, this.plans.hasTiers);
    return facts.live
      ? {
          id: link.id,
          code: link.code,
          ownerId: link.ownerId,
          name: facts.name,
        }
      : null;
  }

  /** The names owners go by through these links, for what is written to the other side. */
  async names(
    ids: (string | null | undefined)[],
  ): Promise<Map<string, string>> {
    const wanted = [...new Set(ids.filter((id): id is string => !!id))];
    if (!wanted.length) return new Map();
    const rows = await this.prisma.anonymousLink.findMany({
      where: { id: { in: wanted } },
      select: LINK_FACTS_SELECT,
    });
    return new Map(
      rows.map((l) => [l.id, linkFacts(l, this.plans.hasTiers).name]),
    );
  }

  /**
   * The holding a video passes on to someone carries the link its author goes by: the
   * giver's own one, or, given through `linkId`, that link when the video is its owner's.
   */
  async passedOn(
    tx: Pick<PrismaService, 'videoAccess' | 'video'>,
    giverId: string,
    videoIds: string[],
    link: { id: string; ownerId: string } | null,
  ): Promise<Map<string, string | null>> {
    if (!videoIds.length) return new Map();
    const [holdings, videos] = await Promise.all([
      tx.videoAccess.findMany({
        where: { holderId: giverId, videoId: { in: videoIds } },
        select: { videoId: true, anonymousLinkId: true },
      }),
      link
        ? tx.video.findMany({
            where: { id: { in: videoIds } },
            select: { id: true, authorId: true },
          })
        : Promise.resolve([]),
    ]);
    const held = new Map(holdings.map((h) => [h.videoId, h.anonymousLinkId]));
    const authors = new Map(videos.map((v) => [v.id, v.authorId]));
    return new Map(
      videoIds.map((id) => [
        id,
        held.get(id) ??
          (link && authors.get(id) === link.ownerId ? link.id : null),
      ]),
    );
  }
}

function toMine(
  l: {
    id: string;
    code: string;
    note: string | null;
    name: string | null;
    createdAt: Date;
  },
  owner: { displayName: string; nicknames: string[] },
  works: boolean,
): MyAnonymousLinkDto {
  return {
    id: l.id,
    code: l.code,
    note: l.note,
    name: personaName(l, owner),
    ownName: !!l.name,
    createdAt: l.createdAt.toISOString(),
    works,
  };
}

export const anonymousLinkNotFound = () =>
  new AppException(
    HttpStatus.NOT_FOUND,
    'anonymousLinkNotFound',
    'errors.anonymousLinks.notFound',
  );
