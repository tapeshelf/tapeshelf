import { actionForKey, frameAt, shouldRefreshPlayback } from './player-utils';

describe('player utils', () => {
  it('maps a time to the evenly spaced frame', () => {
    const frames = Array.from({ length: 16 }, (_, i) => ({ timestampSec: i, url: `f${i}` }));
    expect(frameAt(frames, 0, 160)?.url).toBe('f0');
    expect(frameAt(frames, 79, 160)?.url).toBe('f7');
    expect(frameAt(frames, 160, 160)?.url).toBe('f15');
    expect(frameAt(frames, 999, 160)?.url).toBe('f15');
    expect(frameAt([], 10, 160)).toBeNull();
    expect(frameAt(frames, 10, 0)).toBeNull();
  });

  it('refreshes playback only for expired segments or tokens', () => {
    expect(
      shouldRefreshPlayback({
        type: 'networkError',
        details: 'fragLoadError',
        fatal: false,
        response: { code: 403 },
      }),
    ).toBe(true);
    expect(
      shouldRefreshPlayback({
        type: 'networkError',
        details: 'fragLoadError',
        fatal: false,
        response: { code: 404 },
      }),
    ).toBe(false);
    expect(
      shouldRefreshPlayback({
        type: 'networkError',
        details: 'keyLoadError',
        fatal: true,
        response: { code: 401 },
      }),
    ).toBe(true);
    expect(
      shouldRefreshPlayback({
        type: 'networkError',
        details: 'levelLoadError',
        fatal: true,
        response: { code: 403 },
      }),
    ).toBe(true);
    expect(
      shouldRefreshPlayback({
        type: 'networkError',
        details: 'manifestLoadError',
        fatal: true,
        response: { code: 500 },
      }),
    ).toBe(false);
    expect(
      shouldRefreshPlayback({ type: 'mediaError', details: 'bufferStalledError', fatal: false }),
    ).toBe(false);
  });

  it('maps keys to actions', () => {
    expect(actionForKey(' ')).toEqual({ kind: 'toggle' });
    expect(actionForKey('ArrowRight')).toEqual({ kind: 'seek', by: 5 });
    expect(actionForKey('m')).toEqual({ kind: 'mute' });
    expect(actionForKey('End')).toEqual({ kind: 'seekTo', fraction: 1 });
    expect(actionForKey('x')).toBeNull();
  });
});
