import type {
  ProcessingStage,
  VideoStatus,
  Visibility,
} from '../../generated/prisma/enums.js';
import type { StorageService } from '../../infra/storage/storage.service.js';
import { isGuestUsername } from '../deals/guest-keys.js';
import { smallFrameKey } from '../videos/video-previews.js';
import type { VideoCardDto } from './collection.dto.js';

const FRAME_COUNT = 16;

/** The columns a tile needs (a Prisma `Video` row satisfies it). */
export interface CardVideo {
  id: string;
  code: string;
  title: string;
  visibility: Visibility;
  status: VideoStatus;
  stage: ProcessingStage | null;
  progress: number;
  failReason: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  sizeBytes: bigint;
  thumbnailKey: string | null;
  thumbnailSmallKey: string | null;
  contactSheetKey: string | null;
  assetPrefix: string | null;
  smallFrames: boolean;
  sensitive: boolean;
  createdAt: Date;
}

export interface CardAuthor {
  id: string;
  username: string;
  displayName: string;
}

/** Tile DTO; no stream information ever appears here. */
export function videoCard(
  storage: StorageService,
  v: CardVideo,
  author: CardAuthor,
): VideoCardDto {
  return {
    id: v.id,
    code: v.code,
    title: v.title,
    visibility: v.visibility,
    status: v.status,
    stage: v.stage,
    progress: v.progress,
    failReason: v.failReason,
    durationSec: v.durationSec,
    width: v.width,
    height: v.height,
    sizeBytes: Number(v.sizeBytes),
    // Tiles get the small WebP copies; videos processed before them fall back to the JPEGs.
    thumbnailUrl: v.thumbnailKey
      ? storage.publicUrl(v.thumbnailSmallKey ?? v.thumbnailKey)
      : null,
    contactSheetUrl: v.contactSheetKey
      ? storage.publicUrl(v.contactSheetKey)
      : null,
    // Frames are published under the asset prefix as f00..f15; they exist once the sheet does.
    frameUrls:
      v.assetPrefix && v.contactSheetKey
        ? Array.from({ length: FRAME_COUNT }, (_, i) =>
            storage.publicUrl(frameKey(v, i)),
          )
        : [],
    sensitive: v.sensitive,
    createdAt: v.createdAt.toISOString(),
    author: {
      id: author.id,
      username: author.username,
      displayName: author.displayName,
      guest: isGuestUsername(author.username),
    },
  };
}

/** A tile's picture and preview frames (the small copies when they exist). */
export function tilePictures(
  storage: StorageService,
  v: Pick<
    CardVideo,
    | 'thumbnailKey'
    | 'thumbnailSmallKey'
    | 'contactSheetKey'
    | 'assetPrefix'
    | 'smallFrames'
  >,
): { tileThumbnailUrl: string | null; tileFrameUrls: string[] } {
  return {
    tileThumbnailUrl: v.thumbnailKey
      ? storage.publicUrl(v.thumbnailSmallKey ?? v.thumbnailKey)
      : null,
    tileFrameUrls:
      v.assetPrefix && v.contactSheetKey
        ? Array.from({ length: FRAME_COUNT }, (_, i) =>
            storage.publicUrl(frameKey(v, i)),
          )
        : [],
  };
}

/** Frame `i` for a tile or a timeline preview: the small copy when it exists. */
export function frameKey(
  v: Pick<CardVideo, 'assetPrefix' | 'smallFrames'>,
  index: number,
): string {
  return v.smallFrames
    ? smallFrameKey(v.assetPrefix!, index)
    : `${v.assetPrefix}/f${String(index).padStart(2, '0')}.jpg`;
}
