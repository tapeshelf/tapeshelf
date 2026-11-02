import { describe, expect, it } from 'vitest';

import { type SiteSettingsDto } from '../../api';
import { GiB, fromForm, toForm } from './settings-form';

const SETTINGS: SiteSettingsDto = {
  usernameChangeDays: 30,
  requestCooldownDays: 7,
  requestHintMinShows: 3,
  paymentGraceDays: 7,
  registrationOpen: true,
  tiers: {
    BASIC: {
      maxFileBytes: 2 * GiB,
      storageQuotaBytes: 100 * GiB,
      requestsPerDay: 30,
      downloadsPerMonth: 10,
      downloadSpeedBytesPerSec: 1024 ** 2,
      downloadConcurrency: 1,
      trashRetentionDays: 30,
      apiRateMultiplier: 1,
      extensionPerDay: 3,
    },
    PREMIUM: {
      maxFileBytes: 4 * GiB,
      storageQuotaBytes: 500 * GiB,
      requestsPerDay: 100,
      downloadsPerMonth: 0,
      downloadSpeedBytesPerSec: 0,
      downloadConcurrency: 0,
      trashRetentionDays: 90,
      apiRateMultiplier: 3,
      extensionPerDay: 0,
    },
  },
  limits: {
    maxFileBytes: 0,
    storageQuotaBytes: 0,
    requestsPerDay: 30,
    trashRetentionDays: 90,
    extensionPerDay: 0,
  },
};

describe('settings form', () => {
  it('shows sizes in GiB and round-trips without loss', () => {
    const form = toForm(SETTINGS);
    expect(form.tiers.BASIC).toMatchObject({ maxFileGiB: 2, storageQuotaGiB: 100 });
    expect(fromForm(form)).toEqual(SETTINGS);
  });

  it('keeps exact bytes of sizes that were not edited, even when the GiB view is rounded', () => {
    const odd: SiteSettingsDto = {
      ...SETTINGS,
      tiers: {
        ...SETTINGS.tiers,
        BASIC: { ...SETTINGS.tiers.BASIC, maxFileBytes: 64 * 1024 ** 2 },
      },
    };
    const form = toForm(odd);
    expect(form.tiers.BASIC.maxFileGiB).toBe(0.063);
    expect(fromForm(form).tiers.BASIC.maxFileBytes).toBe(64 * 1024 ** 2);
  });

  it('accepts fractional GiB and rounds counts to whole numbers', () => {
    const form = toForm(SETTINGS);
    form.tiers.BASIC.maxFileGiB = 0.5;
    form.requestCooldownDays = 2.4;
    const dto = fromForm(form);
    expect(dto.tiers.BASIC.maxFileBytes).toBe(512 * 1024 ** 2);
    expect(dto.requestCooldownDays).toBe(2);
  });

  it('shows the download speed in MiB/s and keeps it exact when untouched', () => {
    const form = toForm(SETTINGS);
    expect(form.tiers.BASIC).toMatchObject({ downloadsPerMonth: 10, downloadSpeedMiB: 1 });
    form.tiers.BASIC.downloadSpeedMiB = 0.5;
    expect(fromForm(form).tiers.BASIC.downloadSpeedBytesPerSec).toBe(512 * 1024);
    form.tiers.PREMIUM.downloadSpeedMiB = 0;
    expect(fromForm(form).tiers.PREMIUM.downloadSpeedBytesPerSec).toBe(0);
  });

  it('edits the self-hosted limits in GiB, 0 meaning no limit', () => {
    const form = toForm(SETTINGS);
    expect(form.limits).toEqual({
      maxFileGiB: 0,
      storageQuotaGiB: 0,
      requestsPerDay: 30,
      trashRetentionDays: 90,
      extensionPerDay: 0,
    });
    form.limits.storageQuotaGiB = 50;
    form.limits.trashRetentionDays = 14.6;
    const dto = fromForm(form);
    expect(dto.limits).toEqual({
      maxFileBytes: 0,
      storageQuotaBytes: 50 * GiB,
      requestsPerDay: 30,
      trashRetentionDays: 15,
      extensionPerDay: 0,
    });
    // Tiers are carried through untouched.
    expect(dto.tiers).toEqual(SETTINGS.tiers);
  });
});
