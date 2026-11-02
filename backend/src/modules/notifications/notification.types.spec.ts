import {
  ACTIVE_NOTIFICATION_TYPES,
  DEFAULT_PREFERENCES,
  NOTIFICATION_TYPES,
  resolvePreferences,
} from './notification.types.js';

describe('notification preferences', () => {
  it('has a default for every type and every active type is known', () => {
    for (const type of NOTIFICATION_TYPES)
      expect(DEFAULT_PREFERENCES[type]).toBeDefined();
    for (const type of ACTIVE_NOTIFICATION_TYPES)
      expect(NOTIFICATION_TYPES).toContain(type);
  });

  it('overrides defaults with stored rows and keeps the rest', () => {
    const prefs = resolvePreferences([
      { type: 'VIDEO_PROCESSED', inApp: false, email: true },
    ]);
    expect(prefs.VIDEO_PROCESSED).toEqual({ inApp: false, email: true });
    expect(prefs.VIDEO_FAILED).toEqual(DEFAULT_PREFERENCES.VIDEO_FAILED);
    expect(DEFAULT_PREFERENCES.VIDEO_PROCESSED).toEqual({
      inApp: true,
      email: false,
    });
  });
});
