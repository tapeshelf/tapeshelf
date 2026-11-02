import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const FIXTURES_DIR = join(__dirname, 'fixtures');
export const SAMPLE_VIDEO = join(FIXTURES_DIR, 'sample.mp4');
/** A second, visibly different clip for scenarios that need two videos. */
export const SAMPLE_VIDEO_2 = join(FIXTURES_DIR, 'second.mp4');
/** Flat grey: every edge of a plate drawn on it can be found to the pixel. */
export const GRAY_VIDEO = join(FIXTURES_DIR, 'gray.mp4');
/** A plain PNG for avatar/cover uploads. */
export const SAMPLE_IMAGE = join(FIXTURES_DIR, 'avatar.png');

/** Generates the small h264/aac clips the scenarios upload (git-ignored, built once). */
export default function globalSetup(): void {
  mkdirSync(FIXTURES_DIR, { recursive: true });
  if (!existsSync(SAMPLE_VIDEO)) generate(SAMPLE_VIDEO, 'testsrc2=size=640x360:rate=30', '4');
  if (!existsSync(SAMPLE_VIDEO_2)) generate(SAMPLE_VIDEO_2, 'smptebars=size=640x360:rate=30', '3');
  if (!existsSync(GRAY_VIDEO)) generate(GRAY_VIDEO, 'color=c=0x808080:size=640x360:rate=30', '3');
  if (!existsSync(SAMPLE_IMAGE))
    execFileSync(process.env['FFMPEG_PATH'] ?? 'ffmpeg', [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=0x3366cc:size=300x200',
      '-frames:v',
      '1',
      SAMPLE_IMAGE,
    ]);
}

function generate(path: string, source: string, seconds: string): void {
  execFileSync(process.env['FFMPEG_PATH'] ?? 'ffmpeg', [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    source,
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000',
    '-t',
    seconds,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p',
    '-g',
    '60',
    '-c:a',
    'aac',
    '-b:a',
    '64k',
    '-movflags',
    '+faststart',
    path,
  ]);
}
