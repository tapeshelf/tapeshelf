import { Pipe, type PipeTransform } from '@angular/core';

const STEPS: [number, string][] = [
  [4320, '8K'],
  [2160, '4K'],
  [1440, '1440p'],
  [1080, '1080p'],
  [720, '720p'],
  [480, '480p'],
  [360, '360p'],
  [240, '240p'],
];

/**
 * A video's quality as YouTube names it: by its size measured as a 16:9 frame, so
 * a phone's 1080×1920 and a film's 1920×804 are both 1080p; a little short of a step still counts
 * (1920×1036 after a crop is 1080p). Null when the size is not known yet.
 */
export function qualityLabel(
  width: number | null | undefined,
  height: number | null | undefined,
): string | null {
  if (!width || !height) return null;
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  const lines = Math.max(short, (long * 9) / 16);
  return STEPS.find(([step]) => lines >= step * 0.94)?.[1] ?? '144p';
}

@Pipe({ name: 'quality' })
export class QualityPipe implements PipeTransform {
  transform(video: { width: number | null; height: number | null }): string | null {
    return qualityLabel(video.width, video.height);
  }
}
