import type { SecureStorage } from '@gym/platform';
import { describe, expect, it } from 'vitest';
import {
  AccountStore,
  authStorageKey,
  canUseBranch,
  parseAccounts,
  passwordReasonAfterCheck,
  pinBlocker,
  staffStorageKey,
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
    roleKey: 'receptionist',
    permissions: ['members.view'],
    branchIds: ['branch-1'],
    preferredLanguage: null,
    navTabs: null,
    mustChangePassword: false,
    hasPin: true,
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
    expect(pinBlocker(account({ hasPin: false }))).toBe('setup');
    expect(pinBlocker(account({ mustChangePassword: true }))).toBe('setup');
    expect(pinBlocker(account({ passwordRequired: 'pin_reset' }))).toBe('pin_reset');
    expect(pinBlocker(account({ passwordRequired: 'locked_out' }))).toBe('locked_out');
  });
});

describe('passwordReasonAfterCheck', () => {
  const fine = { hasPin: true, pinLocked: false };

  it('follows a lockout or a removed PIN on the server', () => {
    expect(passwordReasonAfterCheck(account(), { hasPin: true, pinLocked: true })).toBe(
      'locked_out',
    );
    expect(passwordReasonAfterCheck(account(), { hasPin: false, pinLocked: false })).toBe(
      'pin_reset',
    );
  });

  it('clears them once the server is fine again (password login or new PIN elsewhere)', () => {
    expect(passwordReasonAfterCheck(account({ passwordRequired: 'locked_out' }), fine)).toBeNull();
    expect(
      passwordReasonAfterCheck(account({ hasPin: false, passwordRequired: 'pin_reset' }), fine),
    ).toBeNull();
  });

  it('keeps a removed PIN removed', () => {
    expect(
      passwordReasonAfterCheck(account({ hasPin: false, passwordRequired: 'pin_reset' }), {
        hasPin: false,
        pinLocked: false,
      }),
    ).toBe('pin_reset');
  });

  it('keeps reasons only a password login on this device clears', () => {
    for (const reason of ['session_ended', 'inactive', 'setup'] as const) {
      expect(passwordReasonAfterCheck(account({ passwordRequired: reason }), fine)).toBe(reason);
    }
    expect(passwordReasonAfterCheck(account(), fine)).toBeNull();
  });

  it('does not ask a staff member without a PIN for a reset', () => {
    expect(
      passwordReasonAfterCheck(account({ hasPin: false }), { hasPin: false, pinLocked: false }),
    ).toBeNull();
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

describe('parseAccounts', () => {
  it('reads what the store wrote', () => {
    expect(parseAccounts(JSON.stringify([account()]))).toEqual([account()]);
  });

  it('skips broken entries and never throws', () => {
    expect(parseAccounts('not json')).toEqual([]);
    expect(parseAccounts('{"a":1}')).toEqual([]);
    expect(parseAccounts(JSON.stringify([{ staffId: 1 }, account()]))).toEqual([account()]);
  });

  it('drops unknown values', () => {
    const [parsed] = parseAccounts(
      JSON.stringify([{ ...account(), preferredLanguage: 'fr', passwordRequired: 'x' }]),
    );
    expect(parsed?.preferredLanguage).toBeNull();
    expect(parsed?.passwordRequired).toBeNull();
  });

  it('keeps chosen tabs, and drops invalid ones (back to the role defaults)', () => {
    const tabs = ['home', 'settings', 'checkin', 'lockers'] as const;
    expect(parseAccounts(JSON.stringify([account({ navTabs: tabs })]))[0]?.navTabs).toEqual(tabs);
    const [broken] = parseAccounts(
      JSON.stringify([{ ...account(), navTabs: ['home', 'home', 'nowhere'] }]),
    );
    expect(broken?.navTabs).toBeNull();
  });

  it('reads accounts saved before the role key and tabs were kept', () => {
    const saved = { ...account(), roleKey: undefined, navTabs: undefined };
    const [parsed] = parseAccounts(JSON.stringify([saved]));
    expect(parsed?.roleKey).toBeNull();
    expect(parsed?.navTabs).toBeNull();
  });

  it('reads accounts saved when the device kept the PIN hash', () => {
    const saved = {
      ...account(),
      hasPin: undefined,
      pin: { algorithm: 'pbkdf2-sha256' },
      pinAttempts: { failures: 1 },
    };
    expect(parseAccounts(JSON.stringify([saved]))).toEqual([account()]);
    expect(parseAccounts(JSON.stringify([{ ...saved, pin: null }]))[0]?.hasPin).toBe(false);
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
