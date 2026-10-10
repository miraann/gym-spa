import { isGymAccess, isValidGymCode, type GymAccess } from '@gym/core';
import type { LocalizedNames } from '@gym/i18n';

/**
 * The gym this device works for, remembered after the first successful login (spec §2.6). The
 * login screen then asks only for username and password, and shows the gym's name. Kept in secure
 * storage with the staff accounts; every staff member on a device belongs to this gym.
 */
export interface DeviceGym extends LocalizedNames {
  readonly id: string;
  readonly code: string;
  /** From the last check with the server; the server decides again on every request. */
  readonly access: GymAccess;
}

/** Secure storage key of the device's gym. */
export const DEVICE_GYM_KEY = 'device.gym';

function optionalText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** Reads the stored gym; null when there is none or it can't be read. */
export function parseDeviceGym(json: string | null): DeviceGym | null {
  if (!json) return null;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const record: Partial<Record<keyof DeviceGym, unknown>> = value;
  const { id, code, nameCkb, access } = record;
  if (
    typeof id !== 'string' ||
    typeof code !== 'string' ||
    !isValidGymCode(code) ||
    typeof nameCkb !== 'string'
  ) {
    return null;
  }
  return {
    id,
    code,
    nameCkb,
    nameEn: optionalText(record.nameEn),
    nameAr: optionalText(record.nameAr),
    access: isGymAccess(access) ? access : 'active',
  };
}
