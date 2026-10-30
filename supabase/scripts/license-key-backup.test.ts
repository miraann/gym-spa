import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { generateLicenseKey, importLicenseSigningKey, keyRingOf } from '@gym/core';
import { describe, expect, it } from 'vitest';
import {
  BackupError,
  decryptBackup,
  encryptBackup,
  parseBackup,
  secretDigestMatches,
  secretsApi,
  withPublicKey,
  type Fetch,
} from './license-key-backup';

const PASSWORD = 'four random words here';

async function testKey() {
  const { privateJwk, publicKey } = await generateLicenseKey('2026-1');
  return { privateJwk, publicKey, d: (JSON.parse(privateJwk) as { d: string }).d };
}

describe('the encrypted backup', () => {
  it('opens again with the password, and never holds the private key in clear', async () => {
    const { privateJwk, publicKey, d } = await testKey();
    const text = JSON.stringify(encryptBackup(privateJwk, { kid: '2026-1', publicKey }, PASSWORD));
    expect(text).not.toContain(d);
    expect(text).not.toContain(PASSWORD);
    const backup = parseBackup(text);
    expect(backup).toMatchObject({ kid: '2026-1', publicKey, kdf: { name: 'scrypt', N: 2 ** 17 } });
    const opened = decryptBackup(backup, PASSWORD);
    expect(opened).toBe(privateJwk);
    // What comes back is a working key whose public half is the one the file names.
    await expect(
      importLicenseSigningKey(opened, keyRingOf({ kid: '2026-1', publicKey })),
    ).resolves.toMatchObject({ kid: '2026-1' });
  });

  it('a wrong password and a changed file are refused alike', async () => {
    const { privateJwk, publicKey } = await testKey();
    const backup = encryptBackup(privateJwk, { kid: '2026-1', publicKey }, PASSWORD);
    expect(() => decryptBackup(backup, 'four random words HERE')).toThrow(BackupError);
    // The clear fields are bound to the encrypted key: another kid or public key is refused.
    expect(() => decryptBackup({ ...backup, kid: '2026-2' }, PASSWORD)).toThrow(BackupError);
    expect(() => decryptBackup({ ...backup, publicKey: 'A'.repeat(43) }, PASSWORD)).toThrow(
      BackupError,
    );
    const data = Buffer.from(backup.data, 'base64');
    data[0] = (data[0] ?? 0) ^ 1;
    expect(() => decryptBackup({ ...backup, data: data.toString('base64') }, PASSWORD)).toThrow(
      'Wrong password, or the file was changed.',
    );
  });

  it('two backups of the same key share no salt or nonce', async () => {
    const { privateJwk, publicKey } = await testKey();
    const a = encryptBackup(privateJwk, { kid: '2026-1', publicKey }, PASSWORD);
    const b = encryptBackup(privateJwk, { kid: '2026-1', publicKey }, PASSWORD);
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
    expect(a.data).not.toBe(b.data);
  });

  it('refuses files that are not backups', () => {
    for (const text of ['', 'not json', '{}', JSON.stringify({ format: 'other', version: 1 })]) {
      expect(() => parseBackup(text)).toThrow('This is not a license key backup file.');
    }
  });
});

describe('the Supabase secrets API', () => {
  const REF = 'abcdefghijklmnopqrst';

  function recorder(answers: Response[]) {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const fetcher: Fetch = (url, init) => {
      calls.push({ url, init });
      const answer = answers.shift();
      return answer ? Promise.resolve(answer) : Promise.reject(new Error('no answer'));
    };
    return { calls, fetcher };
  }

  it('sets the secret in the request body (never in a URL), with the token as a header', async () => {
    const { calls, fetcher } = recorder([new Response(null, { status: 201 })]);
    await secretsApi(REF, 'sbp_token', fetcher).set('LICENSE_SIGNING_KEY', '{"d":"secret"}');
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe(`https://api.supabase.com/v1/projects/${REF}/secrets`);
    expect(call?.url).not.toContain('secret"');
    expect(call?.init?.method).toBe('POST');
    expect(call?.init?.body).toBe(
      '[{"name":"LICENSE_SIGNING_KEY","value":"{\\"d\\":\\"secret\\"}"}]',
    );
    expect(call?.init?.headers).toMatchObject({ Authorization: 'Bearer sbp_token' });
  });

  it('a refusal says the status only: never the token or the value', async () => {
    const { fetcher } = recorder([new Response('{"message":"bad"}', { status: 401 })]);
    const error: unknown = await secretsApi(REF, 'sbp_token', fetcher)
      .set('LICENSE_SIGNING_KEY', 'the-value')
      .catch((caught: unknown) => caught);
    expect(String(error)).toContain('HTTP 401');
    expect(String(error)).not.toContain('sbp_token');
    expect(String(error)).not.toContain('the-value');
  });

  it('lists names with their digests', async () => {
    const { fetcher } = recorder([
      Response.json([{ name: 'LICENSE_SIGNING_KEY', value: 'ab'.repeat(32) }, { name: 'OTHER' }]),
    ]);
    expect(await secretsApi(REF, 'sbp_token', fetcher).list()).toEqual([
      { name: 'LICENSE_SIGNING_KEY', value: 'ab'.repeat(32) },
      { name: 'OTHER' },
    ]);
  });

  it('refuses anything that is not a project ref', () => {
    expect(() => secretsApi('../../evil', 'sbp_token')).toThrow('That is not a project ref.');
  });

  it('compares the digest Supabase shows with the value sent', () => {
    const digest = createHash('sha256').update('value').digest('hex');
    expect(secretDigestMatches(digest, 'value')).toBe('yes');
    expect(secretDigestMatches(digest.toUpperCase(), 'value')).toBe('yes');
    expect(secretDigestMatches(digest, 'other')).toBe('no');
    expect(secretDigestMatches(undefined, 'value')).toBe('unknown');
    expect(secretDigestMatches('not-a-digest', 'value')).toBe('unknown');
  });
});

describe('the public key in packages/core', () => {
  const source = readFileSync(
    new URL('../../packages/core/src/license-keys.ts', import.meta.url),
    'utf8',
  );
  const KEYS = /(LICENSE_PUBLIC_KEYS: Readonly<Record<string, string>> = )\{[\s\S]*?\};/;
  // The file as it was before any key, so these tests don't depend on the keys shipped since.
  const empty = source.replace(KEYS, '$1{};');

  it('is added to LICENSE_PUBLIC_KEYS and nothing else changes', () => {
    const once = withPublicKey(empty, '2091-1', 'PUBLIC_ONE');
    expect(once).toContain(
      "export const LICENSE_PUBLIC_KEYS: Readonly<Record<string, string>> = {\n  '2091-1': 'PUBLIC_ONE',\n};",
    );
    const twice = withPublicKey(once, '2092-1', 'PUBLIC_TWO');
    expect(twice).toContain("  '2091-1': 'PUBLIC_ONE',\n  '2092-1': 'PUBLIC_TWO',\n};");
    expect(twice.replace(KEYS, '$1{};')).toBe(empty);
  });

  it('keeps the keys already shipped', () => {
    const shipped = KEYS.exec(source)?.[0] ?? '';
    const added = withPublicKey(source, '2091-1', 'PUBLIC_ONE');
    expect(added).toContain(shipped.replace(/\n\};$/, "\n  '2091-1': 'PUBLIC_ONE',\n};"));
  });

  it('never adds a kid twice', () => {
    expect(() => withPublicKey(withPublicKey(empty, '2091-1', 'A'), '2091-1', 'B')).toThrow(
      'already there',
    );
  });
});
