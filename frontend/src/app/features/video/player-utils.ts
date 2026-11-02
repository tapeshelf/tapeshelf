export interface TimelineFrame {
  timestampSec: number;
  url: string;
}

/** The extracted frame that best represents time `t` (frames are evenly spaced). */
export function frameAt(
  frames: TimelineFrame[],
  t: number,
  duration: number,
): TimelineFrame | null {
  if (frames.length === 0 || !(duration > 0)) return null;
  const i = Math.min(frames.length - 1, Math.max(0, Math.floor((t / duration) * frames.length)));
  return frames[i] ?? null;
}

export interface HlsErrorLike {
  type: string;
  details: string;
  fatal: boolean;
  response?: { code?: number };
}

/**
 * Expired presigned segments answer 403, an expired playback token makes
 * playlist/key requests answer 401. Both are fixed by asking for a new playback, not by retrying.
 */
export function shouldRefreshPlayback(err: HlsErrorLike): boolean {
  const code = err.response?.code ?? 0;
  if (err.details === 'fragLoadError') return code === 403;
  if (['keyLoadError', 'levelLoadError', 'manifestLoadError'].includes(err.details))
    return code === 401 || code === 403;
  return false;
}

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/** Keyboard shortcuts of the player; returns the action or null when the key is not ours. */
export type PlayerAction =
  | { kind: 'toggle' }
  | { kind: 'seek'; by: number }
  | { kind: 'seekTo'; fraction: number }
  | { kind: 'volume'; by: number }
  | { kind: 'mute' }
  | { kind: 'fullscreen' };

export function actionForKey(key: string): PlayerAction | null {
  switch (key) {
    case ' ':
    case 'k':
      return { kind: 'toggle' };
    case 'ArrowLeft':
      return { kind: 'seek', by: -5 };
    case 'ArrowRight':
      return { kind: 'seek', by: 5 };
    case 'j':
      return { kind: 'seek', by: -10 };
    case 'l':
      return { kind: 'seek', by: 10 };
    case 'ArrowUp':
      return { kind: 'volume', by: 0.1 };
    case 'ArrowDown':
      return { kind: 'volume', by: -0.1 };
    case 'm':
      return { kind: 'mute' };
    case 'f':
      return { kind: 'fullscreen' };
    case 'Home':
      return { kind: 'seekTo', fraction: 0 };
    case 'End':
      return { kind: 'seekTo', fraction: 1 };
    default:
      return null;
  }
}
