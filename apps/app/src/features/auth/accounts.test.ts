import type { SecureStorage } from '@gym/platform';
import { describe, expect, it } from 'vitest';
import {
  AccountStore,
  authStorageKey,
  canUseBranch,
  parseAccounts,
  pinBlocker,
  staffStorageKey,
  withAttemptsCleared,
  withWrongPin,
  type DeviceAccount,
} from './accounts';

const STAFF_ID = '6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f';

function memoryStorage(): SecureStorage & { readonly items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    get: (key) => Promise.resolve(items.get(key) ?? null),
    set: (key, value) => {
      items.set(key, value);
      return Promise.resolve();
    },
    delete: (key) => {
      items.delete(key);
      return Promise.resolve();
    },
  };
}

function account(overrides: Partial<DeviceAccount> = {}): DeviceAccount {
  return {
    staffId: STAFF_ID,
    username: 'reception1',
    fullName: 'ئاراس کەریم',
    roleId: 'role-1',
    permissions: ['members.view'],
    branchIds: ['branch-1'],
    preferredLanguage: null,
    mustChangePassword: false,
    pin: { algorithm: 'pbkdf2-sha256', iterations: 600_000, salt: 'c2FsdA==', hash: 'aGFzaA==' },
    pinAttempts: { failures: 0, lockedOut: false },
    passwordRequired: null,
    lastActiveAt: '2026-10-07T08:00:00.000Z',
    ...overrides,
  };
}

describe('pinBlocker', () => {
  it('lets a set-up account unlock with its PIN', () => {
    expect(pinBlocker(account())).toBeNull();
  });

  it('asks for the password when the PIN cannot be used', () => {
    expect(pinBlocker(account({ pin: null }))).toBe('setup');
    expect(pinBlocker(account({ mustChangePassword: true }))).toBe('setup');
    expect(pinBlocker(account({ passwordRequired: 'pin_reset' }))).toBe('pin_reset');
    expect(pinBlocker(account({ pinAttempts: { failures: 5, lockedOut: true } }))).toBe(
      'locked_out',
    );
  });
});

describe('canUseBranch', () => {
  it('lets staff in only on a device working in one of their branches', () => {
    expect(canUseBranch(account(), 'branch-1')).toBe(true);
    expect(canUseBranch(account(), 'branch-2')).toBe(false);
    expect(canUseBranch(account({ branchIds: [] }), 'branch-1')).toBe(false);
  });

  it('allows the first login before the device has a branch', () => {
    expect(canUseBranch(account({ branchIds: [] }), null)).toBe(true);
  });
});

describe('wrong PINs', () => {
  it('locks out on the last allowed try, and a right PIN clears the count', () => {
    let current = account();
    for (let index = 0; index < 4; index += 1) current = withWrongPin(current, 5);
    expect(pinBlocker(current)).toBeNull();
    expect(withAttemptsCleared(current).pinAttempts.failures).toBe(0);

    current = withWrongPin(current, 5);
    expect(current.passwordRequired).toBe('locked_out');
    expect(pinBlocker(current)).toBe('locked_out');
  });
});

describe('parseAccounts', () => {
  it('reads what the store wrote', () => {
    expect(parseAccounts(JSON.stringify([account()]))).toEqual([account()]);
  });

  it('skips broken entries and never throws', () => {
    expect(parseAccounts('not json')).toEqual([]);
    expect(parseAccounts('{"a":1}')).toEqual([]);
    expect(parseAccounts(JSON.stringify([{ staffId: 1 }, account()]))).toEqual([account()]);
  });

  it('drops a cached PIN it cannot check, and unknown values', () => {
    const [parsed] = parseAccounts(
      JSON.stringify([
        { ...account(), pin: { algorithm: 'md5' }, preferredLanguage: 'fr', passwordRequired: 'x' },
      ]),
    );
    expect(parsed?.pin).toBeNull();
    expect(parsed?.preferredLanguage).toBeNull();
    expect(parsed?.passwordRequired).toBeNull();
  });

  it('gives an account saved without branches no branch until the next online check', () => {
    // JSON leaves out undefined values: the key is missing, as in older saves.
    const [parsed] = parseAccounts(JSON.stringify([{ ...account(), branchIds: undefined }]));
    expect(parsed?.branchIds).toEqual([]);
    expect(parsed && canUseBranch(parsed, 'branch-1')).toBe(false);
  });
});

describe('AccountStore', () => {
  it('saves to secure storage and loads it again, most recent first', async () => {
    const storage = memoryStorage();
    const store = new AccountStore(storage);
    await store.save(account());
    await store.save(
      account({ staffId: 'other', username: 'desk2', lastActiveAt: '2026-10-07T09:00:00.000Z' }),
    );

    const reloaded = new AccountStore(storage);
    await reloaded.load();
    expect(reloaded.list().map((each) => each.username)).toEqual(['desk2', 'reception1']);
  });

  it("keeps each staff member's session under their own keys, and removes it on logout", async () => {
    const storage = memoryStorage();
    const store = new AccountStore(storage);
    await store.save(account());
    const auth = store.authStorage(STAFF_ID);
    const storageKey = staffStorageKey(STAFF_ID);
    await auth.setItem(storageKey, '{"access_token":"a"}');
    await auth.setItem(`${storageKey}-user`, '{"id":"u"}');
    expect(await auth.getItem(storageKey)).toBe('{"access_token":"a"}');

    // A later run of the app (nothing remembered in memory) still removes every key.
    const later = new AccountStore(storage);
    await later.load();
    await later.remove(STAFF_ID);
    expect([...storage.items.keys()]).toEqual(['accounts']);
    expect(later.list()).toEqual([]);
  });

  it('tells listeners about changes', async () => {
    const store = new AccountStore(memoryStorage());
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    await store.save(account());
    await store.update(STAFF_ID, (current) => ({ ...current, fullName: 'ئاراس' }));
    expect(calls).toBe(2);
    expect(store.get(STAFF_ID)?.fullName).toBe('ئاراس');
  });

  it('keeps writing after one write failed', async () => {
    const storage = memoryStorage();
    let fail = true;
    const flaky: SecureStorage = {
      ...storage,
      set: (key, value) => {
        if (fail) {
          fail = false;
          return Promise.reject(new Error('disk full'));
        }
        return storage.set(key, value);
      },
    };
    const store = new AccountStore(flaky);
    await expect(store.save(account())).rejects.toThrow('disk full');
    await store.save(account({ fullName: 'دووەم' }));
    expect(parseAccounts(storage.items.get('accounts') ?? null)[0]?.fullName).toBe('دووەم');
  });
});

describe('authStorageKey', () => {
  it('makes short keys the secure stores accept', () => {
    const storageKey = staffStorageKey(STAFF_ID);
    expect(authStorageKey(STAFF_ID, storageKey)).toBe(`auth.${STAFF_ID}`);
    expect(authStorageKey(STAFF_ID, `${storageKey}-code-verifier`)).toBe(
      `auth.${STAFF_ID}-code-verifier`,
    );
    expect(authStorageKey(STAFF_ID, 'Other Key')).toBe(`auth.${STAFF_ID}.other_key`);
  });
});
