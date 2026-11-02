import {
  SETTING_DEFAULTS,
  withDefaults,
} from '../settings/settings.defaults.js';
import {
  type TierReminder,
  type TierState,
  dueReminder,
  effectiveTier,
  instancePlan,
  instanceTierLimits,
  overLimit,
  planOf,
} from './plan.js';

const NOW = new Date('2026-11-01T12:00:00Z');
const at = (hours: number) => new Date(NOW.getTime() + hours * 3600 * 1000);

describe('plans', () => {
  describe('effectiveTier', () => {
    it.each<[string, TierState, 'BASIC' | 'PREMIUM']>([
      ['basic', { tier: 'BASIC', tierUntil: null }, 'BASIC'],
      [
        'basic with a stray date',
        { tier: 'BASIC', tierUntil: at(48) },
        'BASIC',
      ],
      [
        'premium without an end',
        { tier: 'PREMIUM', tierUntil: null },
        'PREMIUM',
      ],
      [
        'premium before the end',
        { tier: 'PREMIUM', tierUntil: at(1) },
        'PREMIUM',
      ],
      ['premium at the end', { tier: 'PREMIUM', tierUntil: NOW }, 'BASIC'],
      ['premium past the end', { tier: 'PREMIUM', tierUntil: at(-1) }, 'BASIC'],
    ])('%s', (_, state, expected) => {
      expect(effectiveTier(state, NOW)).toBe(expected);
    });
  });

  describe('dueReminder', () => {
    it.each<[string, number | null, number | null, TierReminder | null]>([
      // [case, hours left (null = no end), reminder already sent, due]
      ['no end date', null, null, null],
      ['eight days left', 8 * 24, null, null],
      ['exactly a week left', 7 * 24, null, 7],
      ['three days left', 3 * 24, null, 7],
      ['three days left, week reminder sent', 3 * 24, 7, null],
      ['last day', 20, 7, 1],
      ['last day, nothing sent yet (short grant)', 20, null, 1],
      ['last day, already reminded', 20, 1, null],
      ['already over', -1, 7, null],
    ])('%s', (_, hoursLeft, sent, expected) => {
      const state = {
        tier: 'PREMIUM' as const,
        tierUntil: hoursLeft === null ? null : at(hoursLeft),
        tierReminder: sent,
      };
      expect(dueReminder(state, NOW)).toBe(expected);
    });

    it('never reminds a basic account', () => {
      expect(
        dueReminder(
          { tier: 'BASIC', tierUntil: at(24), tierReminder: null },
          NOW,
        ),
      ).toBeNull();
    });
  });

  describe('planOf', () => {
    const tiers = SETTING_DEFAULTS.tiers;

    it('gives an active premium its end date, source and limits', () => {
      const plan = planOf(
        { tier: 'PREMIUM', tierUntil: at(24), tierSource: 'ADMIN' },
        tiers,
        NOW,
      );
      expect(plan).toEqual({
        tier: 'PREMIUM',
        until: at(24),
        source: 'ADMIN',
        limits: tiers.PREMIUM,
      });
    });

    it('treats an expired premium as basic, without its date or source', () => {
      const plan = planOf(
        { tier: 'PREMIUM', tierUntil: at(-1), tierSource: 'ADMIN' },
        tiers,
        NOW,
      );
      expect(plan).toEqual({
        tier: 'BASIC',
        until: null,
        source: null,
        limits: tiers.BASIC,
      });
    });
  });

  describe('stored tier limits', () => {
    it('get the defaults for keys added after they were saved and lose keys that are gone', () => {
      const stored = {
        BASIC: {
          maxFileBytes: 1,
          storageQuotaBytes: 2,
          requestsPerDay: 3,
          // Dropped with the author's download switch.
          publicDownloadAllowed: false,
        },
      };
      const tiers = withDefaults('tiers', stored);
      expect(tiers.BASIC).toEqual({
        ...SETTING_DEFAULTS.tiers.BASIC,
        maxFileBytes: 1,
        storageQuotaBytes: 2,
        requestsPerDay: 3,
      });
      expect(tiers.BASIC).not.toHaveProperty('publicDownloadAllowed');
      expect(tiers.PREMIUM).toEqual(SETTING_DEFAULTS.tiers.PREMIUM);
    });

    it('fall back to the defaults when nothing is stored; plain settings are replaced whole', () => {
      expect(withDefaults('tiers', undefined)).toEqual(SETTING_DEFAULTS.tiers);
      expect(withDefaults('requestCooldownDays', 3)).toBe(3);
      expect(withDefaults('requestCooldownDays', undefined)).toBe(7);
    });

    it('merge the self-hosted limits key by key too', () => {
      expect(withDefaults('limits', undefined)).toEqual(
        SETTING_DEFAULTS.limits,
      );
      expect(
        withDefaults('limits', { storageQuotaBytes: 5, downloadsPerMonth: 1 }),
      ).toEqual({ ...SETTING_DEFAULTS.limits, storageQuotaBytes: 5 });
    });
  });

  describe('self-hosted instance', () => {
    it('has no limit on file, shelf or the extension by default, keeps 90 days of trash and 30 requests a day', () => {
      expect(SETTING_DEFAULTS.limits).toEqual({
        maxFileBytes: 0,
        storageQuotaBytes: 0,
        requestsPerDay: 30,
        trashRetentionDays: 90,
        extensionPerDay: 0,
      });
    });

    it('never limits downloads nor multiplies rate limits, whatever is stored', () => {
      const limits = instanceTierLimits({
        maxFileBytes: 7,
        storageQuotaBytes: 8,
        requestsPerDay: 9,
        trashRetentionDays: 10,
        extensionPerDay: 11,
      });
      expect(limits).toEqual({
        maxFileBytes: 7,
        storageQuotaBytes: 8,
        requestsPerDay: 9,
        trashRetentionDays: 10,
        extensionPerDay: 11,
        downloadsPerMonth: 0,
        downloadSpeedBytesPerSec: 0,
        downloadConcurrency: 0,
        apiRateMultiplier: 1,
      });
      expect(instancePlan(limits)).toEqual({
        tier: 'BASIC',
        until: null,
        source: null,
        limits,
      });
    });

    it.each([
      [5, 0, false],
      [5, 5, false],
      [6, 5, true],
      [Number.MAX_SAFE_INTEGER, 0, false],
    ])('overLimit(%d, %d) = %s (0 = no limit)', (value, limit, over) => {
      expect(overLimit(value, limit)).toBe(over);
    });
  });
});
