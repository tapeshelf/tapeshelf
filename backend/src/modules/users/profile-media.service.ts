import { HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';

import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';

export type ProfileImageKind = 'avatar' | 'cover';

/** What multer hands over for the `file` field (typed locally: no @types/multer dependency). */
export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Output sizes: the image is centre-cropped to the target aspect. */
const SIZES: Record<ProfileImageKind, { width: number; height: number }> = {
  avatar: { width: 512, height: 512 },
  cover: { width: 1600, height: 500 },
};
const IMMUTABLE = 'public, max-age=31536000, immutable';
const ACCEPTED = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/**
 * Avatars and covers: decoded and resized with sharp, stored in the public bucket
 * under an unguessable key; the previous file is removed.
 */
@Injectable()
export class ProfileMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async set(
    userId: string,
    kind: ProfileImageKind,
    file: UploadedImage | undefined,
  ): Promise<void> {
    if (!file || !ACCEPTED.has(file.mimetype) || file.size === 0)
      throw invalidImage();
    const { width, height } = SIZES[kind];
    let jpeg: Buffer;
    try {
      jpeg = await sharp(file.buffer, {
        animated: false,
        limitInputPixels: 50e6,
      })
        .rotate() // honour EXIF orientation
        .resize(width, height, { fit: 'cover', position: 'attention' })
        .jpeg({ quality: 86, mozjpeg: true })
        .toBuffer();
    } catch {
      throw invalidImage();
    }
    const key = `u/${userId}/${kind}-${randomBytes(8).toString('hex')}.jpg`;
    await this.storage.put('public', {
      key,
      body: jpeg,
      contentType: 'image/jpeg',
      cacheControl: IMMUTABLE,
    });
    const previous = await this.swapKey(userId, kind, key);
    if (previous) await this.deleteQuietly(previous);
  }

  async remove(userId: string, kind: ProfileImageKind): Promise<void> {
    const previous = await this.swapKey(userId, kind, null);
    if (previous) await this.deleteQuietly(previous);
  }

  /** Stores the new key and returns the old one. */
  private async swapKey(
    userId: string,
    kind: ProfileImageKind,
    key: string | null,
  ): Promise<string | null> {
    const before = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarKey: true, coverKey: true },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: kind === 'avatar' ? { avatarKey: key } : { coverKey: key },
    });
    return kind === 'avatar' ? before.avatarKey : before.coverKey;
  }

  private async deleteQuietly(key: string): Promise<void> {
    await this.storage.deleteObjects('public', [key]).catch(() => undefined);
  }
}

const invalidImage = () =>
  new AppException(
    HttpStatus.BAD_REQUEST,
    'invalidImage',
    'errors.users.invalidImage',
  );
