import {
  parseNavTabs,
  parseTextSize,
  parseThemePreference,
  type NavItemKey,
  type TextSize,
  type ThemePreference,
} from '@gym/core';
import { isLanguage, type Language } from '@gym/i18n';
import type { SecureStorage } from '@gym/platform';
import { SECURE_KEY_PATTERN } from '@gym/platform/desktop-bridge';

/**
 * Why a staff member's PIN doesn't open the app right now; a password login fixes each.
 *   - locked_out: too many wrong PINs (the server counts them, on every device).
 *   - pin_reset: a manager removed their PIN.
 *   - session_ended: their login on this device ended (signed out elsewhere, password changed).
 *   - inactive: their account was deactivated.
 *   - setup: their first login on this device didn't finish (password change or PIN).
 */
export type PasswordReason = 'locked_out' | 'pin_reset' | 'session_ended' | 'inactive' | 'setup';

/**
 * A staff member who has logged in on this device, kept encrypted in secure storage. Their PIN is
 * never kept here: the server checks it.
 */
export interface DeviceAccount {
  readonly staffId: string;
  readonly username: string;
  readonly fullName: string;
  readonly roleId: string;
  /** The built-in role's key (receptionist, ...); null for a custom role. Picks the default tabs. */
  readonly roleKey: string | null;
  /** From the last check with the server; only for showing and hiding things. */
  readonly permissions: readonly string[];
  /** The branches they could access at the last check; they work only in these. */
  readonly branchIds: readonly string[];
  /** Access to every branch (gym-wide settings like the gym's look need it). */
  readonly allBranches: boolean;
  readonly preferredLanguage: Language | null;
  /** Their own 4 phone tabs; null: their role's defaults. */
  readonly navTabs: readonly NavItemKey[] | null;
  /** Their own look; null: not chosen, the device keeps what it has. */
  readonly themePreference: ThemePreference | null;
  readonly textSize: TextSize | null;
  readonly mustChangePassword: boolean;
  /** They have set a PIN (and a manager hasn't removed it). */
  readonly hasPin: boolean;
  /** Set when only a password login unlocks this staff member. */
  readonly passwordRequired: PasswordReason | null;
  /** ISO time; the lock screen lists the most recent first. */
  readonly lastActiveAt: string;
}

const ACCOUNTS_KEY = 'accounts';

function parseAccount(value: unknown): DeviceAccount | null {
  if (typeof value !== 'object' || value === null) return null;
  const record: Partial<Record<keyof DeviceAccount | 'pin', unknown>> = value;
  const { staffId, username, fullName, roleId, permissions, lastActiveAt } = record;
  if (
    typeof staffId !== 'string' ||
    typeof username !== 'string' ||
    typeof fullName !== 'string' ||
    typeof roleId !== 'string' ||
    typeof lastActiveAt !== 'string' ||
    !Array.isArray(permissions)
  ) {
    return null;
  }
  const reasons: readonly PasswordReason[] = [
    'locked_out',
    'pin_reset',
    'session_ended',
    'inactive',
    'setup',
  ];
  return {
    staffId,
    username,
    fullName,
    roleId,
    permissions: permissions.filter((key): key is string => typeof key === 'string'),
    // Saved before branch access was cached: no branch until the next online check.
    branchIds: Array.isArray(record.branchIds)
      ? record.branchIds.filter((id): id is string => typeof id === 'string')
      : [],
    // Saved by earlier versions without these: the defaults until the next online check.
    roleKey: typeof record.roleKey === 'string' ? record.roleKey : null,
    preferredLanguage: isLanguage(record.preferredLanguage) ? record.preferredLanguage : null,
    navTabs: parseNavTabs(record.navTabs),
    allBranches: record.allBranches === true,
    themePreference: parseThemePreference(record.themePreference),
    textSize: parseTextSize(record.textSize),
    mustChangePassword: record.mustChangePassword === true,
    // Saved by earlier versions, which kept the PIN hash itself on the device.
    hasPin: record.hasPin === true || (typeof record.pin === 'object' && record.pin !== null),
    passwordRequired: reasons.find((reason) => reason === record.passwordRequired) ?? null,
    lastActiveAt,
  };
}

export function parseAccounts(json: string | null): DeviceAccount[] {
  if (!json) return [];
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  return value.map(parseAccount).filter((account) => account !== null);
}

/** Whether the PIN can open the app for this staff member (otherwise: why not). */
export function pinBlocker(account: DeviceAccount): PasswordReason | null {
  if (account.passwordRequired) return account.passwordRequired;
  if (!account.hasPin || account.mustChangePassword) return 'setup';
  return null;
}

/**
 * Why only a password login opens the app for this staff member, after a check with the server.
 * The PIN's own states (locked, removed) follow the server, so a password login or a new PIN on
 * another device counts here too. The other reasons need a password login on this device.
 */
export function passwordReasonAfterCheck(
  account: DeviceAccount,
  server: { readonly hasPin: boolean; readonly pinLocked: boolean },
): PasswordReason | null {
  if (server.pinLocked) return 'locked_out';
  if (!server.hasPin && (account.hasPin || account.passwordRequired === 'pin_reset')) {
    return 'pin_reset';
  }
  const reason = account.passwordRequired;
  if (reason === 'locked_out' || reason === 'pin_reset') return null;
  return reason;
}

/**
 * Whether the staff member may log in or unlock on a device working in this branch. Without a
 * branch yet (first login), the login itself asks them to choose one of theirs.
 */
export function canUseBranch(account: DeviceAccount, branchId: string | null): boolean {
  return branchId === null || account.branchIds.includes(branchId);
}

/** Most recently active first. */
export function sortAccounts(accounts: readonly DeviceAccount[]): DeviceAccount[] {
  return [...accounts].sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
}

/** The supabase-js storageKey of a staff member's client: one per staff, so their sessions never mix. */
export function staffStorageKey(staffId: string): string {
  return `gym-staff-${staffId}`;
}

/** A Supabase Auth storage entry of one staff member, as a secure storage key. */
export function authStorageKey(staffId: string, key: string): string {
  // supabase-js keys start with the staff member's storageKey: keep only what follows.
  const prefix = staffStorageKey(staffId);
  const rest = key.startsWith(prefix) ? key.slice(prefix.length) : `.${key}`;
  const name = `auth.${staffId}${rest}`.toLowerCase().replace(/[^a-z0-9._-]/g, '_');
  if (!SECURE_KEY_PATTERN.test(name)) throw new Error('Auth storage key too long');
  return name;
}

/** Where Supabase Auth keeps one staff member's session (the storage API supabase-js expects). */
export interface AuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * The staff members who have logged in on this device. Every change is written to secure storage
 * at once. Supabase sessions are kept under their own keys, read and written by supabase-js
 * through authStorage(), so a token refreshed in another tab is seen here too.
 */
export class AccountStore {
  private accounts: readonly DeviceAccount[] = [];
  private readonly listeners = new Set<() => void>();
  /** Writes run one after another, so a slow write never overwrites a newer one. */
  private writing: Promise<void> = Promise.resolve();
  /** Auth keys written per staff member, so logging out can remove them all. */
  private readonly authKeys = new Map<string, Set<string>>();

  constructor(private readonly storage: SecureStorage) {}

  async load(): Promise<void> {
    this.accounts = sortAccounts(parseAccounts(await this.storage.get(ACCOUNTS_KEY)));
    this.emit();
  }

  list(): readonly DeviceAccount[] {
    return this.accounts;
  }

  get(staffId: string): DeviceAccount | undefined {
    return this.accounts.find((account) => account.staffId === staffId);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Adds or replaces the account. */
  async save(account: DeviceAccount): Promise<void> {
    const others = this.accounts.filter((each) => each.staffId !== account.staffId);
    await this.write(sortAccounts([...others, account]));
  }

  /** Changes the account if it is still on this device. */
  async update(
    staffId: string,
    change: (account: DeviceAccount) => DeviceAccount,
  ): Promise<DeviceAccount | undefined> {
    const current = this.get(staffId);
    if (!current) return undefined;
    const updated = change(current);
    await this.save(updated);
    return updated;
  }

  /** Forgets the staff member on this device: their account and their session. */
  async remove(staffId: string): Promise<void> {
    await this.write(this.accounts.filter((account) => account.staffId !== staffId));
    const storageKey = staffStorageKey(staffId);
    const keys = new Set([
      ...(this.authKeys.get(staffId) ?? []),
      // What supabase-js writes, also in earlier runs of the app.
      ...[storageKey, `${storageKey}-user`, `${storageKey}-code-verifier`].map((key) =>
        authStorageKey(staffId, key),
      ),
    ]);
    await Promise.all([...keys].map((key) => this.storage.delete(key)));
    this.authKeys.delete(staffId);
  }

  authStorage(staffId: string): AuthStorage {
    const remember = (key: string): string => {
      const name = authStorageKey(staffId, key);
      const keys = this.authKeys.get(staffId) ?? new Set<string>();
      keys.add(name);
      this.authKeys.set(staffId, keys);
      return name;
    };
    return {
      getItem: (key) => this.storage.get(remember(key)),
      setItem: (key, value) => this.storage.set(remember(key), value),
      removeItem: (key) => this.storage.delete(remember(key)),
    };
  }

  private write(accounts: readonly DeviceAccount[]): Promise<void> {
    this.accounts = accounts;
    this.emit();
    const json = JSON.stringify(accounts);
    const written = this.writing
      .catch(() => undefined)
      .then(() => this.storage.set(ACCOUNTS_KEY, json));
    this.writing = written;
    return written;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
