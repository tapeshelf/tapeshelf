import { PlaybackTokenService } from './playback-token.service.js';

const config = {
  get: () => 'test-jwt-secret-0123456789abcdef0123456789abcd',
} as never;

describe('PlaybackTokenService', () => {
  const service = new PlaybackTokenService(config);

  it('round-trips video id and subject', () => {
    const token = service.sign('video-1', 'user-1');
    expect(service.verify(token)).toMatchObject({ v: 'video-1', s: 'user-1' });
    expect(service.verify(service.sign('video-1', null))?.s).toBeNull();
  });

  it('rejects tampered, foreign and expired tokens', () => {
    const token = service.sign('video-1', 'user-1');
    const [body, sig] = token.split('.') as [string, string];
    expect(service.verify(`${body}x.${sig}`)).toBeNull();
    expect(service.verify(`${body}.${sig.slice(0, -2)}ab`)).toBeNull();
    expect(service.verify(undefined)).toBeNull();
    expect(service.verify('garbage')).toBeNull();
    const other = new PlaybackTokenService({
      get: () => 'another-secret-0123456789abcdef0123456789',
    } as never);
    expect(other.verify(token)).toBeNull();
    expect(
      service.verify(service.sign('video-1', null, 1), Date.now() + 2000),
    ).toBeNull();
  });

  it('marks the editor’s tokens, which play while the video is being edited', () => {
    expect(
      service.verify(service.sign('video-1', 'user-1', 60, 2, true)),
    ).toMatchObject({
      k: 2,
      e: 1,
    });
    expect(
      service.verify(service.sign('video-1', 'user-1'))?.e,
    ).toBeUndefined();
  });
});
