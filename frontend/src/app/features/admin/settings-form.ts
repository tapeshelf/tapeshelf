import {
  type InstanceLimitsDto,
  type SiteSettingsDto,
  type Tier,
  type TierLimitsDto,
} from '../../api';

export const MiB = 1024 ** 2;
export const GiB = 1024 ** 3;

/** What the admin edits: sizes in GiB and speed in MiB/s (decimals allowed), everything else as is. */
export interface TierForm {
  maxFileGiB: number;
  storageQuotaGiB: number;
  requestsPerDay: number;
  downloadsPerMonth: number;
  /** 0 = straight from storage at full speed. */
  downloadSpeedMiB: number;
  downloadConcurrency: number;
  trashRetentionDays: number;
  apiRateMultiplier: number;
  /** Videos a day through the browser extension; 0 = no limit. */
  extensionPerDay: number;
}

/** The one set of limits of a self-hosted instance; 0 GiB = no limit. */
export interface InstanceForm {
  maxFileGiB: number;
  storageQuotaGiB: number;
  requestsPerDay: number;
  trashRetentionDays: number;
  extensionPerDay: number;
}

export interface SettingsForm {
  usernameChangeDays: number;
  requestCooldownDays: number;
  requestHintMinShows: number;
  paymentGraceDays: number;
  registrationOpen: boolean;
  tiers: Record<Tier, TierForm>;
  limits: InstanceForm;
  /** What was loaded: an untouched size keeps its exact byte value (the GiB view is rounded). */
  original: SiteSettingsDto;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const toGiB = (bytes: number) => round3(bytes / GiB);
const toMiB = (bytes: number) => round3(bytes / MiB);

/** Bytes for a GiB (or MiB) field: the original value when the shown number was not changed. */
function bytes(shown: number, original: number, unit = GiB): number {
  return shown === round3(original / unit) ? original : Math.round(shown * unit);
}

function tierToForm(t: TierLimitsDto): TierForm {
  return {
    maxFileGiB: toGiB(t.maxFileBytes),
    storageQuotaGiB: toGiB(t.storageQuotaBytes),
    requestsPerDay: t.requestsPerDay,
    downloadsPerMonth: t.downloadsPerMonth,
    downloadSpeedMiB: toMiB(t.downloadSpeedBytesPerSec),
    downloadConcurrency: t.downloadConcurrency,
    trashRetentionDays: t.trashRetentionDays,
    apiRateMultiplier: t.apiRateMultiplier,
    extensionPerDay: t.extensionPerDay,
  };
}

function tierFromForm(t: TierForm, original: TierLimitsDto): TierLimitsDto {
  return {
    maxFileBytes: bytes(t.maxFileGiB, original.maxFileBytes),
    storageQuotaBytes: bytes(t.storageQuotaGiB, original.storageQuotaBytes),
    requestsPerDay: Math.round(t.requestsPerDay),
    downloadsPerMonth: Math.round(t.downloadsPerMonth),
    downloadSpeedBytesPerSec: bytes(t.downloadSpeedMiB, original.downloadSpeedBytesPerSec, MiB),
    downloadConcurrency: Math.round(t.downloadConcurrency),
    trashRetentionDays: Math.round(t.trashRetentionDays),
    apiRateMultiplier: Math.round(t.apiRateMultiplier * 100) / 100,
    extensionPerDay: Math.round(t.extensionPerDay),
  };
}

function instanceToForm(l: InstanceLimitsDto): InstanceForm {
  return {
    maxFileGiB: toGiB(l.maxFileBytes),
    storageQuotaGiB: toGiB(l.storageQuotaBytes),
    requestsPerDay: l.requestsPerDay,
    trashRetentionDays: l.trashRetentionDays,
    extensionPerDay: l.extensionPerDay,
  };
}

function instanceFromForm(l: InstanceForm, original: InstanceLimitsDto): InstanceLimitsDto {
  return {
    maxFileBytes: bytes(l.maxFileGiB, original.maxFileBytes),
    storageQuotaBytes: bytes(l.storageQuotaGiB, original.storageQuotaBytes),
    requestsPerDay: Math.round(l.requestsPerDay),
    trashRetentionDays: Math.round(l.trashRetentionDays),
    extensionPerDay: Math.round(l.extensionPerDay),
  };
}

export function toForm(s: SiteSettingsDto): SettingsForm {
  return {
    usernameChangeDays: s.usernameChangeDays,
    requestCooldownDays: s.requestCooldownDays,
    requestHintMinShows: s.requestHintMinShows,
    paymentGraceDays: s.paymentGraceDays,
    registrationOpen: s.registrationOpen,
    tiers: { BASIC: tierToForm(s.tiers.BASIC), PREMIUM: tierToForm(s.tiers.PREMIUM) },
    limits: instanceToForm(s.limits),
    original: s,
  };
}

export function fromForm(f: SettingsForm): SiteSettingsDto {
  return {
    usernameChangeDays: Math.round(f.usernameChangeDays),
    requestCooldownDays: Math.round(f.requestCooldownDays),
    requestHintMinShows: Math.round(f.requestHintMinShows),
    paymentGraceDays: Math.round(f.paymentGraceDays),
    registrationOpen: f.registrationOpen,
    tiers: {
      BASIC: tierFromForm(f.tiers.BASIC, f.original.tiers.BASIC),
      PREMIUM: tierFromForm(f.tiers.PREMIUM, f.original.tiers.PREMIUM),
    },
    limits: instanceFromForm(f.limits, f.original.limits),
  };
}
