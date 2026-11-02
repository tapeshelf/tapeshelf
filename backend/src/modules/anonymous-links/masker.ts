import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { StorageService } from '../../infra/storage/storage.service.js';
import {
  type PolicyViewer,
  canMakeAnonymousLinks,
  isAdmin,
} from '../access/access-policy.js';
import type { VideoCardDto } from '../collection/video-card.dto.js';
import { effectiveTier } from '../plans/plan.js';
import { anonymousHandle, personaName } from './anonymous-link-rules.js';

/** A person as an answer names them; the fields it has of these are masked. */
export interface MaskableUser {
  id: string;
  username: string;
  displayName?: string;
  pageHidden?: boolean;
  pageVisible?: boolean;
  guest?: boolean;
}

/**
 * How the masks apply to one tile:
 * - `holding`: the anonymous link the holding it stands for came through (VideoAccess.anonymousLinkId);
 *   the video's author goes by it.
 * - `context`: the anonymous link the page or the request is seen through; its owner goes by it
 *   wherever they appear, and the tile's code is the one seen through it.
 */
export interface CardMasks {
  holding?: string | null;
  context?: string | null;
}

interface LinkFacts {
  code: string;
  ownerId: string;
  live: boolean;
  /** What the owner goes by through it; '' = "Anonymous" in the reader's language. */
  name: string;
}

/** What a link's facts are read from: the link, its owner and the nicknames they ever had. */
export const LINK_FACTS_SELECT = {
  id: true,
  code: true,
  name: true,
  ownerId: true,
  deletedAt: true,
  owner: {
    select: {
      status: true,
      role: true,
      tier: true,
      tierUntil: true,
      username: true,
      displayName: true,
      usernameHistory: { select: { username: true } },
    },
  },
} as const;

type LinkFactsRow = {
  code: string;
  name: string | null;
  ownerId: string;
  deletedAt: Date | null;
  owner: {
    status: string;
    role: PolicyViewer['role'];
    tier: PolicyViewer['tier'];
    tierUntil: Date | null;
    username: string;
    displayName: string;
    usernameHistory: { username: string }[];
  };
};

/** Whether a link opens, and the name its owner goes by through it. */
export function linkFacts(l: LinkFactsRow, hasTiers: boolean): LinkFacts {
  return {
    code: l.code,
    ownerId: l.ownerId,
    live:
      !l.deletedAt &&
      l.owner.status === 'ACTIVE' &&
      canMakeAnonymousLinks(
        { id: l.ownerId, role: l.owner.role, tier: effectiveTier(l.owner) },
        hasTiers,
      ),
    name: personaName(l, {
      displayName: l.owner.displayName,
      nicknames: [
        l.owner.username,
        ...l.owner.usernameHistory.map((h) => h.username),
      ],
    }),
  };
}

/**
 * Masks the owner of an anonymous link out of an answer: their name becomes the link's
 * handle, a video's code the one seen through the link, its contact sheet the one without the link
 * printed on it. Collect with `card` and `user` while building the answer, then `apply` once: it
 * costs a few queries only when something was collected. The owner themselves and admins see
 * everything as it is.
 */
export class Masker {
  private readonly cards: { card: VideoCardDto; masks: CardMasks }[] = [];
  private readonly users: { dto: MaskableUser; linkId: string }[] = [];
  private readonly bare: {
    target: { id: string; code: string };
    linkId: string;
  }[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly hasTiers: boolean,
    private readonly viewer: Pick<PolicyViewer, 'id' | 'role'> | null,
  ) {}

  card<T extends VideoCardDto>(card: T, masks: CardMasks): T {
    if (masks.holding || masks.context) this.cards.push({ card, masks });
    return card;
  }

  user<T extends MaskableUser>(dto: T, linkId: string | null | undefined): T {
    if (linkId) this.users.push({ dto, linkId });
    return dto;
  }

  /** Only the code of a video that names no author (a chat card): the one seen through `linkId`. */
  code<T extends { id: string; code: string }>(
    target: T,
    linkId: string | null | undefined,
  ): T {
    if (linkId) this.bare.push({ target, linkId });
    return target;
  }

  async apply(): Promise<void> {
    const ids = new Set<string>();
    for (const { masks } of this.cards) {
      if (masks.holding) ids.add(masks.holding);
      if (masks.context) ids.add(masks.context);
    }
    for (const { linkId } of this.users) ids.add(linkId);
    for (const { linkId } of this.bare) ids.add(linkId);
    if (!ids.size || isAdmin(this.viewer as PolicyViewer | null)) return;
    const links = await this.links([...ids]);
    const shown = (id: string | null | undefined) => {
      const link = id ? links.get(id) : undefined;
      return link && !this.sees(link) ? link : null;
    };

    for (const { dto, linkId } of this.users) {
      const link = shown(linkId);
      if (link && dto.id === link.ownerId) persona(dto, link);
    }

    const codes: { card: { id: string; code: string }; linkId: string }[] = [];
    for (const { target, linkId } of this.bare)
      if (shown(linkId)) codes.push({ card: target, linkId });
    const plain: VideoCardDto[] = [];
    for (const { card, masks } of this.cards) {
      const context = shown(masks.context);
      const holding = shown(masks.holding);
      const by =
        context && card.author.id === context.ownerId
          ? context
          : holding && card.author.id === holding.ownerId
            ? holding
            : null;
      if (by) {
        persona(card.author, by);
        plain.push(card);
      }
      const codeBy = context ? masks.context! : by ? masks.holding! : null;
      if (codeBy) codes.push({ card, linkId: codeBy });
    }
    await Promise.all([this.codes(codes), this.plainSheets(plain)]);
  }

  /** The owner and admins see through the masks. */
  private sees(link: LinkFacts): boolean {
    return (
      !!this.viewer &&
      (this.viewer.id === link.ownerId || isAdmin(this.viewer as PolicyViewer))
    );
  }

  private async links(ids: string[]): Promise<Map<string, LinkFacts>> {
    const rows = await this.prisma.anonymousLink.findMany({
      where: { id: { in: ids } },
      select: LINK_FACTS_SELECT,
    });
    return new Map(rows.map((l) => [l.id, linkFacts(l, this.hasTiers)]));
  }

  /** The codes the videos go by through their link, given out the first time they are needed. */
  private async codes(
    wanted: { card: { id: string; code: string }; linkId: string }[],
  ): Promise<void> {
    if (!wanted.length) return;
    const pairs = [
      ...new Map(
        wanted.map((w) => [`${w.linkId}:${w.card.id}`, w] as const),
      ).values(),
    ];
    const rows = await this.prisma.$queryRaw<
      { linkId: string; videoId: string; code: string }[]
    >(Prisma.sql`
      WITH wanted AS (
        SELECT * FROM unnest(${pairs.map((p) => p.linkId)}::uuid[], ${pairs.map((p) => p.card.id)}::uuid[])
          AS w("linkId", "videoId")
      ), given AS (
        INSERT INTO "AnonymousCode" ("linkId", "videoId")
        SELECT w."linkId", w."videoId" FROM wanted w
        ON CONFLICT ("linkId", "videoId") DO NOTHING
        RETURNING "linkId", "videoId", code
      )
      SELECT "linkId", "videoId", code FROM given
      UNION ALL
      SELECT c."linkId", c."videoId", c.code FROM "AnonymousCode" c
        JOIN wanted w ON w."linkId" = c."linkId" AND w."videoId" = c."videoId"`);
    const byPair = new Map(rows.map((r) => [`${r.linkId}:${r.videoId}`, r]));
    for (const w of wanted) {
      const row = byPair.get(`${w.linkId}:${w.card.id}`);
      if (row) w.card.code = row.code;
    }
  }

  private async plainSheets(cards: VideoCardDto[]): Promise<void> {
    if (!cards.length) return;
    const rows = await this.prisma.video.findMany({
      where: { id: { in: [...new Set(cards.map((c) => c.id))] } },
      select: { id: true, plainSheetKey: true },
    });
    const keys = new Map(rows.map((r) => [r.id, r.plainSheetKey]));
    for (const card of cards) {
      // Not drawn yet (older videos, until the worker has caught up): no sheet, the tile's picture.
      if (!card.contactSheetUrl) continue;
      const key = keys.get(card.id);
      card.contactSheetUrl = key ? this.storage.publicUrl(key) : null;
    }
  }
}

function persona(dto: MaskableUser, link: LinkFacts): void {
  dto.username = anonymousHandle(link.live ? link.code : null);
  if ('displayName' in dto) dto.displayName = link.name;
  if ('pageHidden' in dto) dto.pageHidden = !link.live;
  if ('pageVisible' in dto) dto.pageVisible = link.live;
  if ('guest' in dto) dto.guest = false;
}
