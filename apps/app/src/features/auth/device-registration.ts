import { isLanguage, type Language, type LocalizedNames } from '@gym/i18n';
import type { Platform } from '@gym/platform';

/**
 * This device's registration in its gym (step 1e, decided by the user on 2026-10-11): a manager
 * with devices.manage registers a device once, and it then works in its branch. Kept on the device
 * (secure storage) and refreshed at every server check; the server decides again at every PIN
 * (unlock_on_device).
 */
export interface DeviceRegistration {
  readonly id: string;
  /** D01, ...: the device's short name in its branch. */
  readonly code: string;
  readonly name: string;
  /** Language before anyone logs in, and for staff without their own choice; null: none. */
  readonly defaultLanguage: Language | null;
  readonly isActive: boolean;
  readonly branch: LocalizedNames & {
    readonly id: string;
    readonly code: string;
    readonly isActive: boolean;
  };
}

export const DEVICE_REGISTRATION_KEY = 'device.registration';

/** The platform names the database knows (devices.platform). iOS isn't built yet: it counts as web. */
export type DevicePlatform = 'web' | 'android' | 'windows';

export function devicePlatform(platform: Platform): DevicePlatform {
  if (platform === 'electron') return 'windows';
  if (platform === 'android') return 'android';
  return 'web';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * Reads a my_device() row: the device and its branch. null when the row is missing or malformed
 * (then the device counts as not registered, and a manager registers it again).
 */
export function parseServerDevice(data: unknown): {
  registration: DeviceRegistration;
  canUse: boolean;
} | null {
  if (typeof data !== 'object' || data === null) return null;
  const row: Partial<Record<string, unknown>> = data;
  const id = text(row.id);
  const code = text(row.code);
  const name = text(row.name);
  const branchId = text(row.branch_id);
  const branchCode = text(row.branch_code);
  const branchName = text(row.branch_name_ckb);
  if (!id || !UUID.test(id) || !code || !name || !branchId || !branchCode || !branchName) {
    return null;
  }
  return {
    registration: {
      id,
      code,
      name,
      defaultLanguage: isLanguage(row.default_language) ? row.default_language : null,
      isActive: row.is_active === true,
      branch: {
        id: branchId,
        code: branchCode,
        nameCkb: branchName,
        nameEn: text(row.branch_name_en),
        nameAr: text(row.branch_name_ar),
        isActive: row.branch_is_active === true,
      },
    },
    canUse: row.can_use === true,
  };
}

/** Reads the stored registration; null when there is none or it can't be read. */
export function parseDeviceRegistration(stored: string | null): DeviceRegistration | null {
  if (!stored) return null;
  try {
    const value: unknown = JSON.parse(stored);
    if (typeof value !== 'object' || value === null) return null;
    const record: Partial<Record<keyof DeviceRegistration, unknown>> = value;
    const branch: unknown = record.branch;
    if (typeof branch !== 'object' || branch === null) return null;
    const branchRecord: Partial<Record<string, unknown>> = branch;
    return (
      parseServerDevice({
        id: record.id,
        code: record.code,
        name: record.name,
        default_language: record.defaultLanguage,
        is_active: record.isActive,
        branch_id: branchRecord.id,
        branch_code: branchRecord.code,
        branch_name_ckb: branchRecord.nameCkb,
        branch_name_en: branchRecord.nameEn,
        branch_name_ar: branchRecord.nameAr,
        branch_is_active: branchRecord.isActive,
      })?.registration ?? null
    );
  } catch {
    return null;
  }
}
