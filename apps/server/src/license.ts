import {
  licenseState,
  licenseUpdates,
  normalizeMachineCode,
  readLicenseCode,
  SHIPPED_LICENSE_KEYS,
  verifyActivationCode,
  verifyLicenseCode,
  type Activation,
  type License,
  type LicenseCodeProblem,
  type LicenseKeyRing,
  type LicenseState,
  type LicenseUpdates,
} from '@gym/core';

// The offline server's license (spec §2.6, step OF-b): which codes it holds, whether they are
// good for this gym and this PC, and what that means for the gym. Click Group signs the codes; the
// server only checks them against the public keys in packages/core.

/** What the server keeps in license.json: the codes as the gym pasted them. */
export interface StoredCodes {
  readonly license: string;
  readonly activation: string | null;
}

/** Why codes were refused; the app translates these keys. */
export type LicenseInstallProblem =
  | 'license_invalid'
  | 'license_other_gym'
  | 'license_older'
  | 'license_needed'
  | 'activation_invalid'
  | 'activation_other_gym'
  | 'activation_other_machine'
  | 'nothing_to_install';

export class LicenseInstallError extends Error {
  constructor(
    readonly key: LicenseInstallProblem,
    readonly detail: string,
  ) {
    super(key);
  }
}

export type ServerLicense =
  | { readonly kind: 'none' }
  /** The stored license no longer verifies (an update revoked its key). */
  | { readonly kind: 'broken'; readonly problem: LicenseCodeProblem; readonly gymId: string | null }
  | { readonly kind: 'not_activated'; readonly license: License }
  /** The activation is for another PC: Windows was reinstalled, or the data moved to a new PC. */
  | { readonly kind: 'wrong_machine'; readonly license: License }
  | { readonly kind: 'activated'; readonly license: License; readonly activation: Activation };

/** Whether an activation is for this gym and this PC. */
function activationFits(activation: Activation, gymId: string, machineCode: string): boolean {
  return activation.gymId === gymId && activation.machineCode === normalizeMachineCode(machineCode);
}

/** The stored codes, checked against the keys and this PC. */
export async function readServerLicense(
  stored: StoredCodes | null,
  machineCode: string,
  keys: LicenseKeyRing = SHIPPED_LICENSE_KEYS,
): Promise<ServerLicense> {
  if (stored === null) return { kind: 'none' };
  const checked = await verifyLicenseCode(stored.license, keys);
  if (!checked.ok) {
    return {
      kind: 'broken',
      problem: checked.problem,
      gymId: readLicenseCode(stored.license)?.gymId ?? null,
    };
  }
  const license = checked.value;
  if (stored.activation === null) return { kind: 'not_activated', license };
  const activation = await verifyActivationCode(stored.activation, keys);
  if (!activation.ok || !activationFits(activation.value, license.gymId, machineCode)) {
    return { kind: 'wrong_machine', license };
  }
  return { kind: 'activated', license, activation: activation.value };
}

/**
 * The codes after installing a new license and/or activation. A license must be for this server's
 * gym (once it has one) and not older than the one installed; an activation must be for the gym
 * and this PC. A renewal is a new license alone: the activation stays.
 */
export async function installCodes(
  input: { readonly license?: string | undefined; readonly activation?: string | undefined },
  current: StoredCodes | null,
  machineCode: string,
  keys: LicenseKeyRing = SHIPPED_LICENSE_KEYS,
): Promise<StoredCodes> {
  const licenseCode = input.license?.trim();
  const activationCode = input.activation?.trim();
  if (!licenseCode && !activationCode) {
    throw new LicenseInstallError('nothing_to_install', 'Neither a license nor an activation');
  }
  const installed = current === null ? null : await verifyLicenseCode(current.license, keys);
  const installedLicense = installed?.ok ? installed.value : null;

  let license = installedLicense;
  let storedLicense = installedLicense === null ? null : (current?.license ?? null);
  if (licenseCode) {
    const checked = await verifyLicenseCode(licenseCode, keys);
    if (!checked.ok) throw new LicenseInstallError('license_invalid', checked.problem);
    if (installedLicense !== null && checked.value.gymId !== installedLicense.gymId) {
      throw new LicenseInstallError('license_other_gym', 'This server belongs to another gym');
    }
    if (installedLicense !== null && checked.value.issuedOn < installedLicense.issuedOn) {
      throw new LicenseInstallError('license_older', 'Older than the license installed');
    }
    license = checked.value;
    storedLicense = licenseCode;
  }
  if (license === null || storedLicense === null) {
    throw new LicenseInstallError('license_needed', 'An activation needs the license first');
  }

  let storedActivation = current?.activation ?? null;
  if (activationCode) {
    const checked = await verifyActivationCode(activationCode, keys);
    if (!checked.ok) throw new LicenseInstallError('activation_invalid', checked.problem);
    if (checked.value.gymId !== license.gymId) {
      throw new LicenseInstallError('activation_other_gym', 'The activation is for another gym');
    }
    if (checked.value.machineCode !== normalizeMachineCode(machineCode)) {
      throw new LicenseInstallError('activation_other_machine', 'The activation is for another PC');
    }
    storedActivation = activationCode;
  }
  return { license: storedLicense, activation: storedActivation };
}

/** What the gym row should say: the license's end and limits, and whether it is read-only. */
export interface GymTarget {
  readonly gymId: string;
  /** null: leave the end and limits as they are (the license can't be read). */
  readonly terms: {
    /** A yearly license's last day (Baghdad); null for perpetual (no end). */
    readonly lastDay: string | null;
    readonly maxBranches: number | null;
    readonly maxDevices: number | null;
  } | null;
  /** Without a good activation, or with the clock set back, nothing new can be saved. */
  readonly readOnly: boolean;
}

export function gymTarget(server: ServerLicense, clockBehind: boolean): GymTarget | null {
  if (server.kind === 'none') return null;
  if (server.kind === 'broken') {
    return server.gymId === null ? null : { gymId: server.gymId, terms: null, readOnly: true };
  }
  const { license } = server;
  return {
    gymId: license.gymId,
    terms: {
      lastDay: license.type === 'yearly' ? license.expiresOn : null,
      maxBranches: license.maxBranches,
      maxDevices: license.maxDevices,
    },
    readOnly: server.kind !== 'activated' || clockBehind,
  };
}

/** What /server/v1/info tells every PC about the license (no codes, no machine code). */
export interface LicenseSummary {
  readonly kind: ServerLicense['kind'];
  readonly gymCode: string | null;
  readonly type: License['type'] | null;
  readonly expiresOn: string | null;
  readonly updatesUntil: string | null;
  readonly maxBranches: number | null;
  readonly maxDevices: number | null;
  readonly state: LicenseState | null;
  readonly updates: LicenseUpdates | null;
  readonly clockBehind: boolean;
}

export function summarize(
  server: ServerLicense,
  clockBehind: boolean,
  now: Date | number = Date.now(),
): LicenseSummary {
  const license = 'license' in server ? server.license : null;
  return {
    kind: server.kind,
    gymCode: license?.gymCode ?? null,
    type: license?.type ?? null,
    expiresOn: license?.expiresOn ?? null,
    updatesUntil: license?.updatesUntil ?? null,
    maxBranches: license?.maxBranches ?? null,
    maxDevices: license?.maxDevices ?? null,
    state: license === null ? null : licenseState(license, now),
    updates: license === null ? null : licenseUpdates(license, now),
    clockBehind,
  };
}
