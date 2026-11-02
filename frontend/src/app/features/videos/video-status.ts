import { type ProcessingStage, type VideoStatus } from '../../api';

/** Translation key for what a tile says while a video is not ready. */
export function stageKey(video: { status: VideoStatus; stage: ProcessingStage | null }): string {
  if (video.status === 'PROCESSING')
    return video.stage ? `videos.stage.${video.stage}` : 'videos.status.PROCESSING';
  return `videos.status.${video.status}`;
}

const KNOWN_FAILURES = [
  'corrupted',
  'noVideoStream',
  'zeroDuration',
  'tooLong',
  'tooLarge',
  'fpsTooHigh',
  'tooManyStreams',
  'demoLimit',
  'transcodeFailed',
  'internal',
  'blocked',
];

export function failReasonKey(video: { failReason: string | null }): string {
  const reason =
    video.failReason && KNOWN_FAILURES.includes(video.failReason) ? video.failReason : 'internal';
  return `videos.failReason.${reason}`;
}
