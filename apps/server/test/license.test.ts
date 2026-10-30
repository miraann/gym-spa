import {
  generateLicenseKey,
  importLicenseSigningKey,
  keyRingOf,
  signActivation,
  signLicense,
  type Activation,
  type License,
  type LicenseKeyRing,
  type LicenseSigningKey,
} from '@gym/core';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  gymTarget,
  installCodes,
  LicenseInstallError,
  readServerLicense,
  summarize,
  type StoredCodes,
} from '../src/license.ts';

const MACHINE = '0V5Q-1BD4-TS11-N9TC-9402';
const OTHER_MACHINE = '1VSC-ZG2B-53AP-HZFW-67MW';

const YEARLY: License = {
  licenseId: '5a1c0f6e-3b2d-4c8e-9f10-2a3b4c5d6e7f',
  kid: 'test-server',
  gymId: '0b7d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  gymCode: 'hawler-fit',
  gymName: 'جیمی هەولێر',
  type: 'yearly',
  maxBranches: 2,
  maxDevices: 6,
  features: [],
  issuedOn: '2026-10-29',
  expiresOn: '2027-10-29',
  updatesUntil: null,
};

const ACTIVATION: Activation = {
  activationId: '9c8b7a6f-5e4d-4c3b-8a29-18f7e6d5c4b3',
  kid: 'test-server',
  gymId: YEARLY.gymId,
  machineCode: MACHINE.replaceAll('-', ''),
  issuedOn: '2026-10-29',
};

let key: LicenseSigningKey;
let keys: LicenseKeyRing;
let license: string;
let activation: string;

beforeAll(async () => {
  key = await importLicenseSigningKey((await generateLicenseKey('test-server')).privateJwk);
  keys = keyRingOf(key);
  license = await signLicense(YEARLY, key);
  activation = await signActivation(ACTIVATION, key);
});

async function refused(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof LicenseInstallError) return error.key;
    throw error;
  }
  throw new Error('Not refused');
}

describe('installCodes', () => {
  it('takes a license, then its activation', async () => {
    const first = await installCodes({ license }, null, MACHINE, keys);
    expect(first).toEqual({ license, activation: null });
    expect(await installCodes({ activation }, first, MACHINE, keys)).toEqual({
      license,
      activation,
    });
    expect(
      await installCodes({ license: ` ${license}\n`, activation }, null, MACHINE, keys),
    ).toEqual({
      license,
      activation,
    });
  });

  it('keeps the activation when a renewal comes', async () => {
    const renewal = await signLicense(
      {
        ...YEARLY,
        licenseId: '6b2d1f7e-4c3e-4d9f-8a21-3b4c5d6e7f80',
        issuedOn: '2027-10-01',
        expiresOn: '2028-10-29',
      },
      key,
    );
    expect(
      await installCodes({ license: renewal }, { license, activation }, MACHINE, keys),
    ).toEqual({
      license: renewal,
      activation,
    });
  });

  it('refuses codes that are not signed by a shipped key', async () => {
    const stranger = await importLicenseSigningKey(
      (await generateLicenseKey('test-other')).privateJwk,
    );
    const forged = await signLicense({ ...YEARLY, kid: 'test-other' }, stranger);
    expect(await refused(installCodes({ license: forged }, null, MACHINE, keys))).toBe(
      'license_invalid',
    );
    expect(await refused(installCodes({ license: 'GSL1.x.y' }, null, MACHINE, keys))).toBe(
      'license_invalid',
    );
    expect(await refused(installCodes({ license: activation }, null, MACHINE, keys))).toBe(
      'license_invalid',
    );
  });

  it("refuses another gym's license and an older one", async () => {
    const other = await signLicense(
      { ...YEARLY, gymId: '1c8e2f30-4b5c-4d6e-8f70-8b9c0d1e2f30', gymCode: 'slemani-fit' },
      key,
    );
    const installed = { license, activation };
    expect(await refused(installCodes({ license: other }, installed, MACHINE, keys))).toBe(
      'license_other_gym',
    );
    const older = await signLicense(
      { ...YEARLY, issuedOn: '2026-10-01', expiresOn: '2027-01-01' },
      key,
    );
    expect(await refused(installCodes({ license: older }, installed, MACHINE, keys))).toBe(
      'license_older',
    );
  });

  it('refuses an activation for another PC or gym, or without a license', async () => {
    expect(await refused(installCodes({ license, activation }, null, OTHER_MACHINE, keys))).toBe(
      'activation_other_machine',
    );
    const otherGym = await signActivation(
      { ...ACTIVATION, gymId: '1c8e2f30-4b5c-4d6e-8f70-8b9c0d1e2f30' },
      key,
    );
    expect(
      await refused(installCodes({ license, activation: otherGym }, null, MACHINE, keys)),
    ).toBe('activation_other_gym');
    expect(await refused(installCodes({ activation }, null, MACHINE, keys))).toBe('license_needed');
    expect(await refused(installCodes({ license, activation: license }, null, MACHINE, keys))).toBe(
      'activation_invalid',
    );
    expect(await refused(installCodes({}, null, MACHINE, keys))).toBe('nothing_to_install');
  });
});

describe('readServerLicense and gymTarget', () => {
  it('is activated with both codes on this PC', async () => {
    const server = await readServerLicense({ license, activation }, MACHINE, keys);
    expect(server.kind).toBe('activated');
    expect(gymTarget(server, false)).toEqual({
      gymId: YEARLY.gymId,
      terms: { lastDay: '2027-10-29', maxBranches: 2, maxDevices: 6 },
      readOnly: false,
    });
  });

  it('is read-only without an activation, on another PC, or with the clock set back', async () => {
    const notActivated = await readServerLicense({ license, activation: null }, MACHINE, keys);
    expect(notActivated.kind).toBe('not_activated');
    expect(gymTarget(notActivated, false)?.readOnly).toBe(true);
    const moved = await readServerLicense({ license, activation }, OTHER_MACHINE, keys);
    expect(moved.kind).toBe('wrong_machine');
    expect(gymTarget(moved, false)?.readOnly).toBe(true);
    const activated = await readServerLicense({ license, activation }, MACHINE, keys);
    expect(gymTarget(activated, true)?.readOnly).toBe(true);
  });

  it('has no end for a perpetual license', async () => {
    const perpetual = await signLicense(
      { ...YEARLY, type: 'perpetual', expiresOn: null, updatesUntil: '2028-10-29' },
      key,
    );
    const server = await readServerLicense({ license: perpetual, activation }, MACHINE, keys);
    expect(gymTarget(server, false)?.terms?.lastDay).toBeNull();
  });

  it('makes the gym read-only when an update revoked the key that signed its license', async () => {
    const revoked: LicenseKeyRing = { ...keys, revoked: ['test-server'] };
    const stored: StoredCodes = { license, activation };
    const server = await readServerLicense(stored, MACHINE, revoked);
    expect(server).toEqual({ kind: 'broken', problem: 'revoked_key', gymId: YEARLY.gymId });
    expect(gymTarget(server, false)).toEqual({ gymId: YEARLY.gymId, terms: null, readOnly: true });
  });

  it('has nothing to change before a license', async () => {
    expect(gymTarget(await readServerLicense(null, MACHINE, keys), false)).toBeNull();
  });
});

describe('summarize', () => {
  it('tells the PCs the license and its warnings, never the codes', async () => {
    const server = await readServerLicense({ license, activation }, MACHINE, keys);
    const summary = summarize(server, false, Date.parse('2027-10-20T09:00:00Z'));
    expect(summary).toEqual({
      kind: 'activated',
      gymCode: 'hawler-fit',
      type: 'yearly',
      expiresOn: '2027-10-29',
      updatesUntil: null,
      maxBranches: 2,
      maxDevices: 6,
      state: { kind: 'active', daysLeft: 10, stage: 30 },
      updates: { kind: 'none' },
      clockBehind: false,
    });
    expect(JSON.stringify(summary)).not.toContain('GSL1');
    expect(summarize({ kind: 'none' }, false)).toMatchObject({ kind: 'none', state: null });
  });
});
