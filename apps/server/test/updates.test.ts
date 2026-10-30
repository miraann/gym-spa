import {
  generateLicenseKey,
  importLicenseSigningKey,
  keyRingOf,
  signLicense,
  type License,
} from '@gym/core';
import { describe, expect, it } from 'vitest';
import { updatesBlocked, updatesBlockedMessage } from '../src/updates.ts';

const PERPETUAL: License = {
  licenseId: '5a1c0f6e-3b2d-4c8e-9f10-2a3b4c5d6e7f',
  kid: 'test-updates',
  gymId: '0b7d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  gymCode: 'hawler-fit',
  gymName: 'جیمی هەولێر',
  type: 'perpetual',
  maxBranches: null,
  maxDevices: null,
  features: [],
  issuedOn: '2026-10-29',
  expiresOn: null,
  updatesUntil: '2027-10-29',
};

describe('updatesBlocked', () => {
  it("blocks a build made after a perpetual license's updates ended, and nothing else", async () => {
    const key = await importLicenseSigningKey(
      (await generateLicenseKey('test-updates')).privateJwk,
    );
    const keys = keyRingOf(key);
    const code = await signLicense(PERPETUAL, key);
    expect(await updatesBlocked(code, '2027-10-30', keys)).toEqual({
      updatesUntil: '2027-10-29',
      buildDate: '2027-10-30',
    });
    expect(await updatesBlocked(code, '2027-10-29', keys)).toBeNull();
    expect(await updatesBlocked(code, null, keys)).toBeNull();
    expect(await updatesBlocked(null, '2030-01-01', keys)).toBeNull();
    const yearly = await signLicense(
      { ...PERPETUAL, type: 'yearly', expiresOn: '2027-10-29', updatesUntil: null },
      key,
    );
    expect(await updatesBlocked(yearly, '2030-01-01', keys)).toBeNull();
    // A code that doesn't verify sets no limit here (the license check makes the gym read-only).
    expect(await updatesBlocked(code, '2030-01-01', { publicKeys: {}, revoked: [] })).toBeNull();
  });

  it('explains it in Kurdish first', () => {
    const message = updatesBlockedMessage({ updatesUntil: '2027-10-29', buildDate: '2027-11-02' });
    expect(message.split('\n')[0]).toContain('2027-10-29');
    expect(message).toContain('کلیک گرووپ');
  });
});
