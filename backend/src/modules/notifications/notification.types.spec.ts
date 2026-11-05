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
      { type: 'NEW_FOLLOWER', inApp: true, email: false, push: true },
      { type: 'NEW_MESSAGE', inApp: true, email: true, push: false },
    ]);
    // A row from before push (or that changed another channel) keeps the type's push default.
    expect(prefs.VIDEO_PROCESSED).toEqual({
      inApp: false,
      email: true,
      push: true,
    });
    expect(prefs.NEW_FOLLOWER.push).toBe(true);
    expect(prefs.NEW_MESSAGE.push).toBe(false);
    expect(prefs.VIDEO_FAILED).toEqual(DEFAULT_PREFERENCES.VIDEO_FAILED);
    expect(DEFAULT_PREFERENCES.VIDEO_PROCESSED).toEqual({
      inApp: true,
      email: false,
      push: true,
    });
  });

  it('pushes by default what needs an answer or ends a wait, and only rings the bell for the rest', () => {
    const on = ACTIVE_NOTIFICATION_TYPES.filter(
      (type) => DEFAULT_PREFERENCES[type].push,
    ).sort();
    expect(on).toEqual(
      [
        'REQUEST_RECEIVED',
        'OFFER_RECEIVED',
        'REQUEST_SHARED',
        'EXCHANGE_COMPLETED',
        'NEW_MESSAGE',
        'SUPPORT_REPLY',
        'VIDEO_TAKEN_DOWN',
        'ADMIN_NOTICE',
        'PLAN_EXPIRED',
        'PLAN_PAYMENT_FAILED',
        'TRAFFIC_USED_UP',
        'VIDEO_PROCESSED',
        'VIDEO_FAILED',
        'VIDEO_EDIT_FAILED',
      ].sort(),
    );
  });
});
