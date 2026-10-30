import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SHIPPED_LICENSE_KEYS, verifyLicenseCode, type LicenseKeyRing } from '@gym/core';

// A perpetual license never ends, but only builds made up to its "updates until" may be installed
// (spec §2.6). The installer asks the server it is about to update (gym-server-admin
// check-update), and gym-server checks again when it starts, so a newer build never touches the
// gym's data; the version already installed keeps working.

export interface UpdatesBlocked {
  readonly updatesUntil: string;
  readonly buildDate: string;
}

/** Why this build may not run with this license; null when it may (or there is no such limit). */
export async function updatesBlocked(
  licenseCode: string | null,
  buildDate: string | null,
  keys: LicenseKeyRing = SHIPPED_LICENSE_KEYS,
): Promise<UpdatesBlocked | null> {
  if (licenseCode === null || buildDate === null) return null;
  const checked = await verifyLicenseCode(licenseCode, keys);
  if (!checked.ok) return null;
  const { type, updatesUntil } = checked.value;
  if (type !== 'perpetual' || updatesUntil === null || buildDate <= updatesUntil) return null;
  return { updatesUntil, buildDate };
}

/** The license code the server keeps (license.json in its data folder), or null. */
export function storedLicenseCode(dataRoot: string): string | null {
  const file = path.join(dataRoot, 'license.json');
  if (!existsSync(file)) return null;
  try {
    const stored = JSON.parse(readFileSync(file, 'utf8')) as { license?: unknown };
    return typeof stored.license === 'string' ? stored.license : null;
  } catch {
    return null;
  }
}

/** What the installer and the log say, in Kurdish first (the person installing reads it). */
export function updatesBlockedMessage(blocked: UpdatesBlocked): string {
  return [
    `ئەم وەشانە لە ${blocked.buildDate} دروستکراوە، بەڵام نوێکردنەوەکانی ئەم جیمە تا ${blocked.updatesUntil} بوون.`,
    'وەشانی ئێستا هەر کار دەکات و هیچ نەگۆڕدرا. بۆ کڕینی نوێکردنەوە، پەیوەندی بە کلیک گرووپ بکە.',
    `This build is from ${blocked.buildDate}, after this gym's updates ended on ${blocked.updatesUntil}. Nothing was changed.`,
  ].join('\n');
}
