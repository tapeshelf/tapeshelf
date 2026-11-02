import { HttpStatus } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';

import { AppException } from '../../common/errors/app.exception.js';
import { SUPPORT_FILE_MAX_BYTES, SUPPORT_FILES_MAX } from './support.dto.js';

/** A picture as multer hands it over (memory storage). */
export interface UploadedPicture {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export interface ProcessedPicture {
  body: Buffer;
  contentType: string;
  ext: string;
  width: number;
  height: number;
}

/** Screenshots stay sharp: no bigger than this on either side, never enlarged. */
const MAX_SIDE = 2560;

const FORMATS: Record<string, { ext: string; contentType: string }> = {
  'image/png': { ext: 'png', contentType: 'image/png' },
  'image/jpeg': { ext: 'jpg', contentType: 'image/jpeg' },
  'image/webp': { ext: 'webp', contentType: 'image/webp' },
};

/**
 * Every picture of a ticket lives under its author's prefix in the private bucket, the answers'
 * pictures too: deleting the account clears them at once.
 */
export function supportPrefix(userId: string): string {
  return `support/${userId}/`;
}

export function supportKey(userId: string, ext: string): string {
  return `${supportPrefix(userId)}${randomBytes(12).toString('hex')}.${ext}`;
}

const badImage = () =>
  new AppException(
    HttpStatus.BAD_REQUEST,
    'supportBadImage',
    'errors.support.badImage',
  );

/**
 * Re-encoded in their own format (a screenshot stays a lossless PNG), turned upright and without
 * their metadata — sharp writes none unless asked.
 */
export async function processPictures(
  files: UploadedPicture[],
): Promise<ProcessedPicture[]> {
  if (files.length > SUPPORT_FILES_MAX)
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      'supportTooManyFiles',
      'errors.support.tooManyFiles',
      { params: { count: SUPPORT_FILES_MAX } },
    );
  const out: ProcessedPicture[] = [];
  for (const file of files) {
    const format = FORMATS[file.mimetype];
    if (!format || file.size === 0 || file.size > SUPPORT_FILE_MAX_BYTES)
      throw badImage();
    try {
      let image = sharp(file.buffer, {
        animated: false,
        limitInputPixels: 50e6,
      })
        .rotate()
        .resize({
          width: MAX_SIDE,
          height: MAX_SIDE,
          fit: 'inside',
          withoutEnlargement: true,
        });
      image =
        format.ext === 'png'
          ? image.png({ compressionLevel: 9 })
          : format.ext === 'jpg'
            ? image.jpeg({ quality: 86, mozjpeg: true })
            : image.webp({ quality: 86 });
      const { data, info } = await image.toBuffer({ resolveWithObject: true });
      out.push({
        body: data,
        ...format,
        width: info.width,
        height: info.height,
      });
    } catch {
      throw badImage();
    }
  }
  return out;
}
