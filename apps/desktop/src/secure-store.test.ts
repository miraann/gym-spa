import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSecureStore, type Cipher } from './secure-store';

// Stands in for DPAPI: reversible, but never the plain text.
const fakeCipher = (available = true): Cipher => ({
  isEncryptionAvailable: () => available,
  encryptString: (value) => Buffer.from(`enc:${Buffer.from(value).toString('base64')}`),
  decryptString: (encrypted) =>
    Buffer.from(encrypted.toString().replace(/^enc:/, ''), 'base64').toString(),
});

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(path.join(tmpdir(), 'gym-secure-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe('createSecureStore', () => {
  it('keeps values encrypted on disk and reads them back', async () => {
    const store = createSecureStore(folder, fakeCipher());
    await store.set('auth.staff-1', 'سڕ secret');
    expect(await store.get('auth.staff-1')).toBe('سڕ secret');
    const onDisk = await readFile(path.join(folder, 'auth.staff-1.bin'), 'utf8');
    expect(onDisk).not.toContain('secret');
    expect(await readdir(folder)).toEqual(['auth.staff-1.bin']);
  });

  it('returns null for a missing key and deletes quietly', async () => {
    const store = createSecureStore(folder, fakeCipher());
    expect(await store.get('missing')).toBeNull();
    await store.set('accounts', '[]');
    await store.delete('accounts');
    await store.delete('accounts');
    expect(await store.get('accounts')).toBeNull();
  });

  it.each(['../escape', 'A', '', 'a/b', 'a\\b', 'x'.repeat(101), 42])(
    'refuses the key %j',
    async (key) => {
      const store = createSecureStore(folder, fakeCipher());
      await expect(store.set(key, 'value')).rejects.toThrow('key');
      await expect(store.get(key)).rejects.toThrow('key');
    },
  );

  it('refuses values that are not text or too large', async () => {
    const store = createSecureStore(folder, fakeCipher());
    await expect(store.set('accounts', 42)).rejects.toThrow('value');
    await expect(store.set('accounts', 'x'.repeat(256 * 1024 + 1))).rejects.toThrow('value');
  });

  it('never stores plain text when encryption is unavailable', async () => {
    const store = createSecureStore(folder, fakeCipher(false));
    await expect(store.set('accounts', '[]')).rejects.toThrow('Encryption');
    expect(await readdir(folder)).toEqual([]);
  });
});
