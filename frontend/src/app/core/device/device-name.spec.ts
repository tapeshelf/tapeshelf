import { deviceName } from './device-name';

describe('deviceName', () => {
  it('names the browser and the system', () => {
    expect(
      deviceName(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome · Windows');
    expect(
      deviceName(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
      ),
    ).toBe('Edge · macOS');
    expect(
      deviceName(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 OPR/125.0.0.0',
      ),
    ).toBe('Opera · Linux');
    expect(
      deviceName('Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0'),
    ).toBe('Firefox · Linux');
  });

  it('falls back to what it knows', () => {
    expect(deviceName('curl/8.0')).toBe('Browser');
    expect(deviceName('Something (Windows NT 10.0)')).toBe('Windows');
  });
});
