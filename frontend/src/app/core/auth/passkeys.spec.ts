import { deviceName } from './passkeys';

/** A new passkey is named after the device it was made on. */
describe('deviceName', () => {
  it('knows phones from the systems their agents also mention', () => {
    expect(
      deviceName('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile'),
    ).toBe('Android');
    expect(
      deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'),
    ).toBe('iPhone');
    expect(deviceName('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36')).toBe(
      'ChromeOS',
    );
    expect(deviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Safari/605.1.15')).toBe('Mac');
    expect(deviceName('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Firefox/131.0')).toBe('Linux');
    expect(deviceName('curl/8.0')).toBe('Passkey');
  });
});
