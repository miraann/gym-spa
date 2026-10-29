import { describe, expect, it } from 'vitest';
import {
  LICENSE_KID_PATTERN,
  LicenseKeyError,
  MACHINE_CODE_ALPHABET,
  formatMachineCode,
  generateLicenseKey,
  importLicenseSigningKey,
  isTestLicenseKid,
  keyRingOf,
  licenseDateProblem,
  licenseState,
  licenseUpdates,
  machineCodeFrom,
  normalizeMachineCode,
  readActivationCode,
  readLicenseCode,
  signActivation,
  signLicense,
  verifyActivationCode,
  verifyLicenseCode,
  type Activation,
  type License,
  type LicenseSigningKey,
} from './license.ts';
import { LICENSE_PUBLIC_KEYS, REVOKED_LICENSE_KIDS } from './license-keys.ts';
import { databaseTestSql } from './sql-functions.test-helper.ts';

/**
 * The machine code cases of supabase/tests/550-licenses.test.sql, which runs them through
 * app.normalize_machine_code(): one per line, as ('raw', 'expected' or null).
 */
function sharedMachineCodeCases(): { raw: string; expected: string | null }[] {
  const sql = databaseTestSql('550-licenses.test.sql');
  const block = /insert into machine_code_cases \(raw, expected\) values\n([\s\S]*?);\n/.exec(sql);
  const lines = block?.[1]?.split('\n').filter((line) => line.trim() !== '') ?? [];
  return lines.map((line) => {
    const match = /^\s*\('((?:[^']|'')*)', (?:'([0-9A-Z]+)'|null)\),?$/.exec(line);
    if (!match) throw new Error(`Unreadable machine code case: ${line}`);
    return { raw: (match[1] ?? '').replaceAll("''", "'"), expected: match[2] ?? null };
  });
}

const YEARLY: License = {
  licenseId: '5a1c0f6e-3b2d-4c8e-9f10-2a3b4c5d6e7f',
  kid: 'test-unit',
  gymId: '0b7d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  gymCode: 'hawler-fit',
  gymName: 'جیمی هەولێر',
  type: 'yearly',
  maxBranches: 2,
  maxDevices: null,
  features: [],
  issuedOn: '2026-10-29',
  expiresOn: '2027-10-29',
  updatesUntil: null,
};

const PERPETUAL: License = {
  ...YEARLY,
  type: 'perpetual',
  expiresOn: null,
  updatesUntil: '2028-10-29',
};

const MACHINE = '0V5Q1BD4TS11N9TC9402';

const ACTIVATION: Activation = {
  activationId: '9c8b7a6f-5e4d-4c3b-8a29-18f7e6d5c4b3',
  kid: 'test-unit',
  gymId: YEARLY.gymId,
  machineCode: MACHINE,
  issuedOn: '2026-10-29',
};

async function testKey(kid = 'test-unit'): Promise<LicenseSigningKey> {
  const { privateJwk } = await generateLicenseKey(kid);
  return importLicenseSigningKey(privateJwk);
}

/** Changes one character of a code's payload, keeping it valid base64url. */
function tamper(code: string): string {
  const [prefix, payload = '', signature] = code.split('.');
  const middle = Math.floor(payload.length / 2);
  const swapped = payload[middle] === 'A' ? 'B' : 'A';
  return [prefix, payload.slice(0, middle) + swapped + payload.slice(middle + 1), signature].join(
    '.',
  );
}

describe('license codes', () => {
  it('signs a yearly license that verifies with the key and reads back the same', async () => {
    const key = await testKey();
    const code = await signLicense(YEARLY, key);
    expect(code).toMatch(/^GSL1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{86}$/);
    expect(code.length).toBeLessThan(450);
    expect(await verifyLicenseCode(code, keyRingOf(key))).toEqual({ ok: true, value: YEARLY });
    expect(readLicenseCode(code)).toEqual(YEARLY);
  });

  it('signs a perpetual license', async () => {
    const key = await testKey();
    const code = await signLicense(PERPETUAL, key);
    expect(await verifyLicenseCode(code, keyRingOf(key))).toEqual({ ok: true, value: PERPETUAL });
  });

  it('accepts a code with spaces or a line end around it (pasted or read from a file)', async () => {
    const key = await testKey();
    const code = await signLicense(YEARLY, key);
    expect((await verifyLicenseCode(`  ${code}\r\n`, keyRingOf(key))).ok).toBe(true);
  });

  it('refuses a changed payload, another key, a revoked key and a test key with the shipped keys', async () => {
    const key = await testKey();
    const other = await testKey();
    const code = await signLicense(YEARLY, key);
    const tampered = await verifyLicenseCode(tamper(code), keyRingOf(key));
    expect(tampered.ok).toBe(false);
    expect(await verifyLicenseCode(code, keyRingOf(other))).toEqual({
      ok: false,
      problem: 'signature',
    });
    expect(
      await verifyLicenseCode(code, {
        publicKeys: { [key.kid]: key.publicKey },
        revoked: [key.kid],
      }),
    ).toEqual({ ok: false, problem: 'revoked_key' });
    expect(await verifyLicenseCode(code)).toEqual({ ok: false, problem: 'unknown_key' });
  });

  it('never takes a license for an activation or the other way round', async () => {
    const key = await testKey();
    const license = await signLicense(YEARLY, key);
    const activation = await signActivation(ACTIVATION, key);
    expect(await verifyActivationCode(license, keyRingOf(key))).toEqual({
      ok: false,
      problem: 'format',
    });
    expect(await verifyLicenseCode(activation, keyRingOf(key))).toEqual({
      ok: false,
      problem: 'format',
    });
    // Its payload under the other prefix.
    const relabelled = `GSL1.${activation.split('.').slice(1).join('.')}`;
    expect((await verifyLicenseCode(relabelled, keyRingOf(key))).ok).toBe(false);
  });

  it('refuses payloads with extra or missing fields even when signed', async () => {
    const key = await testKey();
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const signed = async (payload: unknown) => {
      const input = `GSL1.${encode(payload)}`;
      const signature = await key.sign(new TextEncoder().encode(input));
      return `${input}.${Buffer.from(signature).toString('base64url')}`;
    };
    const good = {
      v: 1,
      lid: YEARLY.licenseId,
      kid: key.kid,
      gid: YEARLY.gymId,
      gc: YEARLY.gymCode,
      gn: YEARLY.gymName,
      t: 'yearly',
      mb: 2,
      md: null,
      f: [],
      iat: '2026-10-29',
      exp: '2027-10-29',
    };
    expect((await verifyLicenseCode(await signed(good), keyRingOf(key))).ok).toBe(true);
    for (const payload of [
      { ...good, extra: true },
      { ...good, upd: '2028-01-01' },
      { ...good, v: 2 },
      { ...good, exp: null },
      { ...good, exp: '2027-02-30' },
      { ...good, mb: 0 },
      { ...good, mb: 1.5 },
      { ...good, gc: 'Hawler' },
      { ...good, gn: ' جیم' },
      { ...good, f: ['spa', 'spa'] },
      { ...good, t: 'monthly' },
    ]) {
      expect(await verifyLicenseCode(await signed(payload), keyRingOf(key))).toEqual({
        ok: false,
        problem: 'format',
      });
    }
  });

  it('refuses malformed codes without throwing', async () => {
    for (const code of [
      '',
      'GSL1',
      'GSL1..',
      'GSL1.e30.AAAA',
      'GSL2.e30.' + 'A'.repeat(86),
      'GSL1.e30=.' + 'A'.repeat(86),
      'GSL1.!!!.' + 'A'.repeat(86),
      'GSL1.' + 'A'.repeat(3000) + '.' + 'A'.repeat(86),
    ]) {
      expect(await verifyLicenseCode(code)).toEqual({ ok: false, problem: 'format' });
      expect(readLicenseCode(code)).toBeNull();
    }
  });

  it('signs and verifies an activation', async () => {
    const key = await testKey();
    const code = await signActivation(ACTIVATION, key);
    expect(code).toMatch(/^GSA1\./);
    expect(await verifyActivationCode(code, keyRingOf(key))).toEqual({
      ok: true,
      value: ACTIVATION,
    });
    expect(readActivationCode(code)).toEqual(ACTIVATION);
    expect((await verifyActivationCode(tamper(code), keyRingOf(key))).ok).toBe(false);
  });

  it('never signs invalid fields or with another kid', async () => {
    const key = await testKey();
    expect(() => signLicense({ ...YEARLY, expiresOn: null }, key)).toThrow();
    expect(() => signLicense({ ...YEARLY, kid: 'test-other' }, key)).toThrow();
    expect(() => signActivation({ ...ACTIVATION, machineCode: 'ABCD' }, key)).toThrow();
  });
});

describe('importLicenseSigningKey', () => {
  it('loads a test key whatever the shipped keys are', async () => {
    const { privateJwk, publicKey } = await generateLicenseKey('test-local');
    const key = await importLicenseSigningKey(privateJwk);
    expect(key.kid).toBe('test-local');
    expect(key.publicKey).toBe(publicKey);
  });

  it('loads a real key only when its public half is the shipped one', async () => {
    const { privateJwk, publicKey } = await generateLicenseKey('2026-1');
    await expect(importLicenseSigningKey(privateJwk)).rejects.toEqual(
      new LicenseKeyError('not_shipped'),
    );
    const other = await generateLicenseKey('2026-1');
    await expect(
      importLicenseSigningKey(privateJwk, {
        publicKeys: { '2026-1': other.publicKey },
        revoked: [],
      }),
    ).rejects.toEqual(new LicenseKeyError('not_shipped'));
    const key = await importLicenseSigningKey(privateJwk, {
      publicKeys: { '2026-1': publicKey },
      revoked: [],
    });
    expect(key.kid).toBe('2026-1');
  });

  it('refuses a revoked kid, even a test one', async () => {
    const { privateJwk } = await generateLicenseKey('test-gone');
    await expect(
      importLicenseSigningKey(privateJwk, { publicKeys: {}, revoked: ['test-gone'] }),
    ).rejects.toEqual(new LicenseKeyError('revoked'));
  });

  it('refuses text that is not an Ed25519 private key with a kid, and halves that do not match', async () => {
    const a = JSON.parse((await generateLicenseKey('test-a')).privateJwk) as Record<string, string>;
    const b = JSON.parse((await generateLicenseKey('test-a')).privateJwk) as Record<string, string>;
    for (const text of [
      '',
      'not json',
      '[]',
      JSON.stringify({ ...a, crv: 'X25519' }),
      JSON.stringify({ ...a, kty: 'EC' }),
      JSON.stringify({ ...a, kid: 'Bad Kid' }),
      JSON.stringify({ ...a, kid: undefined }),
      JSON.stringify({ ...a, d: undefined }),
      JSON.stringify({ ...a, d: 'AAAA' }),
      JSON.stringify({ ...a, x: b.x }),
    ]) {
      await expect(importLicenseSigningKey(text)).rejects.toEqual(new LicenseKeyError('invalid'));
    }
  });

  it('never puts any part of the key in its error', async () => {
    const { privateJwk } = await generateLicenseKey('2026-9');
    const { d, x } = JSON.parse(privateJwk) as { d: string; x: string };
    const error: unknown = await importLicenseSigningKey(privateJwk).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(LicenseKeyError);
    expect(String(error)).not.toContain(d);
    expect(String(error)).not.toContain(x);
  });
});

describe('the shipped keys', () => {
  it('are raw 32-byte public keys under valid kids, never test keys, never revoked', () => {
    for (const [kid, key] of Object.entries(LICENSE_PUBLIC_KEYS)) {
      expect(kid).toMatch(LICENSE_KID_PATTERN);
      expect(isTestLicenseKid(kid)).toBe(false);
      expect(REVOKED_LICENSE_KIDS).not.toContain(kid);
      expect(Buffer.from(key, 'base64url')).toHaveLength(32);
      expect(Buffer.from(key, 'base64url').toString('base64url')).toBe(key);
    }
  });

  it('revoked kids are valid kids', () => {
    for (const kid of REVOKED_LICENSE_KIDS) expect(kid).toMatch(LICENSE_KID_PATTERN);
  });
});

describe('licenseDateProblem', () => {
  it('a yearly license ends after its issue and at most 2 years later', () => {
    expect(licenseDateProblem('yearly', '2026-10-29', '2026-10-29')).toBe('too_soon');
    expect(licenseDateProblem('yearly', '2026-10-29', '2026-10-30')).toBeNull();
    expect(licenseDateProblem('yearly', '2026-10-29', '2028-10-29')).toBeNull();
    expect(licenseDateProblem('yearly', '2026-10-29', '2028-10-30')).toBe('too_far');
    expect(licenseDateProblem('yearly', '2026-10-29', '2062-10-29')).toBe('too_far');
  });

  it('perpetual updates run at most 5 years', () => {
    expect(licenseDateProblem('perpetual', '2026-10-29', '2031-10-29')).toBeNull();
    expect(licenseDateProblem('perpetual', '2026-10-29', '2031-10-30')).toBe('too_far');
  });

  it('refuses dates that do not exist', () => {
    expect(licenseDateProblem('yearly', '2026-10-29', '2027-02-29')).toBe('invalid_date');
    expect(licenseDateProblem('yearly', '2026-10-29', '27-10-29')).toBe('invalid_date');
  });
});

/** A moment in Baghdad (UTC+3): 'YYYY-MM-DDTHH:MM'. */
function baghdad(local: string): Date {
  return new Date(`${local}:00+03:00`);
}

describe('licenseState', () => {
  const license = { type: 'yearly', expiresOn: '2027-10-29' } as const;

  it('counts down with the 30/7/1-day warnings', () => {
    expect(licenseState(license, baghdad('2027-09-01T12:00'))).toEqual({
      kind: 'active',
      daysLeft: 59,
      stage: null,
    });
    expect(licenseState(license, baghdad('2027-09-30T00:00'))).toEqual({
      kind: 'active',
      daysLeft: 30,
      stage: 30,
    });
    expect(licenseState(license, baghdad('2027-10-23T09:00'))).toMatchObject({
      daysLeft: 7,
      stage: 7,
    });
    expect(licenseState(license, baghdad('2027-10-29T23:59'))).toEqual({
      kind: 'active',
      daysLeft: 1,
      stage: 1,
    });
  });

  it('then 30 days of grace, then expired, in Baghdad days', () => {
    expect(licenseState(license, baghdad('2027-10-30T00:00'))).toEqual({
      kind: 'grace',
      daysLeft: 30,
      readOnlyOn: '2027-11-29',
    });
    expect(licenseState(license, baghdad('2027-11-28T23:59'))).toMatchObject({
      kind: 'grace',
      daysLeft: 1,
    });
    expect(licenseState(license, baghdad('2027-11-29T00:00'))).toEqual({ kind: 'expired' });
    // 21:00 UTC is already the next day in Baghdad.
    expect(licenseState(license, new Date('2027-10-29T21:00:00Z')).kind).toBe('grace');
  });

  it('a perpetual license never ends', () => {
    expect(
      licenseState({ type: 'perpetual', expiresOn: null }, baghdad('2099-01-01T00:00')),
    ).toEqual({ kind: 'active', daysLeft: null, stage: null });
  });
});

describe('licenseUpdates', () => {
  const license = { type: 'perpetual', updatesUntil: '2028-10-29' } as const;

  it('warns 30, 7 and 1 day before the updates end, then says they ended', () => {
    expect(licenseUpdates(license, baghdad('2028-01-01T00:00'))).toEqual({ kind: 'none' });
    expect(licenseUpdates(license, baghdad('2028-10-01T00:00'))).toEqual({
      kind: 'ending',
      daysLeft: 29,
      stage: 30,
    });
    expect(licenseUpdates(license, baghdad('2028-10-29T22:00'))).toEqual({
      kind: 'ending',
      daysLeft: 1,
      stage: 1,
    });
    expect(licenseUpdates(license, baghdad('2028-10-30T00:00'))).toEqual({ kind: 'ended' });
  });

  it('says nothing for a yearly license', () => {
    expect(licenseUpdates({ type: 'yearly', updatesUntil: null })).toEqual({ kind: 'none' });
  });
});

describe('normalizeMachineCode: the same cases as the database (550-licenses)', () => {
  const cases = sharedMachineCodeCases();

  it('reads the shared cases', () => {
    expect(cases.length).toBeGreaterThanOrEqual(15);
  });

  it.each(cases)('$raw → $expected', ({ raw, expected }) => {
    expect(normalizeMachineCode(raw)).toBe(expected);
  });
});

describe('machine codes', () => {
  it('come from the machine id and the motherboard serial, the same every time', async () => {
    const code = await machineCodeFrom('4c4c4544-0042-3510-8052-b4c04f4e4d32', 'PF2ABCDE');
    expect(code).toBe(MACHINE);
    expect(await machineCodeFrom(' 4C4C4544-0042-3510-8052-B4C04F4E4D32 ', 'pf2abcde ')).toBe(
      MACHINE,
    );
    expect(await machineCodeFrom('4c4c4544-0042-3510-8052-b4c04f4e4d32', 'PF2ABCDF')).not.toBe(
      MACHINE,
    );
    expect(normalizeMachineCode(code)).toBe(code);
  });

  it('are shown in groups of four', () => {
    expect(formatMachineCode(MACHINE)).toBe('0V5Q-1BD4-TS11-N9TC-9402');
  });

  it('forgive how people type them', () => {
    for (const typed of [
      '0V5Q-1BD4-TS11-N9TC-9402',
      '0v5q-1bd4-ts11-n9tc-9402',
      ' 0V5Q 1BD4 TS11 N9TC 9402 ',
      'OV5Q-IBD4-TSlL-N9TC-94O2',
      '٠V5Q-١BD٤-TS١١-N٩TC-٩٤٠٢',
      '۰V5Q-۱BD۴-TS۱۱-N۹TC-۹۴۰۲',
    ]) {
      expect(normalizeMachineCode(typed)).toBe(MACHINE);
    }
  });

  it('catch every single wrong character and every swap of two neighbours', () => {
    for (let index = 0; index < MACHINE.length; index += 1) {
      for (const character of MACHINE_CODE_ALPHABET) {
        if (character === MACHINE[index]) continue;
        const typo = MACHINE.slice(0, index) + character + MACHINE.slice(index + 1);
        expect(normalizeMachineCode(typo)).toBeNull();
      }
      const next = MACHINE[index + 1];
      if (next !== undefined && next !== MACHINE[index]) {
        const swapped =
          MACHINE.slice(0, index) + next + (MACHINE[index] ?? '') + MACHINE.slice(index + 2);
        expect(normalizeMachineCode(swapped)).toBeNull();
      }
    }
  });

  it('refuse the wrong length and letters outside the alphabet', () => {
    expect(normalizeMachineCode('')).toBeNull();
    expect(normalizeMachineCode(MACHINE.slice(1))).toBeNull();
    expect(normalizeMachineCode(`${MACHINE}0`)).toBeNull();
    expect(normalizeMachineCode(MACHINE.replace('V', 'U'))).toBeNull();
    expect(normalizeMachineCode('0V5Q_1BD4_TS11_N9TC_9402')).toBeNull();
  });
});
