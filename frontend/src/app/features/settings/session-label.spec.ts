import { appSessionLabel } from './session-label';

describe('appSessionLabel', () => {
  it('names the app, its version and the device', () => {
    expect(appSessionLabel('android/1.4.0 (Pixel 8; Android 15)')).toBe(
      'tapeshelf 1.4.0 · Pixel 8 · Android 15',
    );
    expect(appSessionLabel('ios/2.0.1 (iPhone 15; iOS 18.2)')).toBe(
      'tapeshelf 2.0.1 · iPhone 15 · iOS 18.2',
    );
  });

  it('without a device says the platform', () => {
    expect(appSessionLabel('android/1.4.0')).toBe('tapeshelf 1.4.0 · Android');
    expect(appSessionLabel('ios/1.0.0')).toBe('tapeshelf 1.0.0 · iPhone');
  });

  it('shows what it cannot read as it is', () => {
    expect(appSessionLabel('something else')).toBe('something else');
  });
});
