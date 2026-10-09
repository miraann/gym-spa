import {
  hashPin,
  isValidUsername,
  normalizePin,
  normalizeUsername,
  pinTriesLeft,
  resolveSetting,
  staffEmail,
  verifyPin,
  type SettingKey,
  type SettingRow,
} from '@gym/core';
import { writeMetadata } from '@gym/db';
import type { Language } from '@gym/i18n';
import type { SecureStorage } from '@gym/platform';
import type { CommonPowerSyncDatabase } from '@powersync/common';
import { createAppClient, type AppSupabaseClient, type BackendConfig } from '@/lib/backend';
import { ensureDeviceId } from '@/lib/local-database';
import { logError } from '@/lib/logger';
import { setPreference } from '@/lib/preferences';
import { SyncConnection, pendingByAuthor, usableSession } from '@/lib/sync-connection';
import {
  AccountStore,
  canUseBranch,
  pinBlocker,
  staffStorageKey,
  withAttemptsCleared,
  withWrongPin,
  type DeviceAccount,
  type PasswordReason,
} from './accounts';
import {
  AuthFlowError,
  changePassword,
  fetchBranches,
  fetchProfile,
  savePin,
  toAuthError,
  type BranchChoice,
  type StaffProfile,
} from './staff-api';

/** What comes after each step of a password login. */
export type AuthStep =
  | { readonly kind: 'change_password'; readonly staffId: string }
  | { readonly kind: 'set_pin'; readonly staffId: string }
  | {
      readonly kind: 'choose_branch';
      readonly staffId: string;
      readonly branches: readonly BranchChoice[];
    }
  | { readonly kind: 'done' };

export type UnlockResult =
  | { readonly kind: 'unlocked' }
  | { readonly kind: 'wrong_pin'; readonly triesLeft: number }
  | { readonly kind: 'no_branch_access' }
  | { readonly kind: 'password_required'; readonly reason: PasswordReason };

export type LogoutResult =
  { readonly kind: 'logged_out' } | { readonly kind: 'pending_changes'; readonly count: number };

export interface AuthState {
  /** False until the accounts have been read from secure storage. */
  readonly ready: boolean;
  /** Startup failed (e.g. secure storage can't be read): the app shows an error instead. */
  readonly failed: boolean;
  readonly accounts: readonly DeviceAccount[];
  /** The staff member using the app; null while locked. */
  readonly activeId: string | null;
  /** The branch this device works in (local_kv), null until chosen. */
  readonly branchId: string | null;
  /** Whose token the device syncs with (the last one unlocked), null when nobody can. */
  readonly syncingAs: string | null;
}

const BRANCH_KEY = 'branch_id';
/** These can't sync until their owner logs in with their password again. */
const ENDED: readonly (PasswordReason | null)[] = ['session_ended', 'inactive'];

/**
 * Login, PIN unlock, lock and logout on this device. Several staff members can be logged in on one
 * device; one of them uses the app at a time (after their PIN), and each one's changes upload
 * under their own session.
 */
export class AuthController {
  private readonly store: AccountStore;
  private readonly clients = new Map<string, AppSupabaseClient>();
  private readonly sync: SyncConnection | null;
  private deviceId = '';
  private state: AuthState = {
    ready: false,
    failed: false,
    accounts: [],
    activeId: null,
    branchId: null,
    syncingAs: null,
  };
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly db: CommonPowerSyncDatabase,
    private readonly config: BackendConfig | null,
    storage: SecureStorage,
  ) {
    this.store = new AccountStore(storage);
    this.store.subscribe(() => {
      this.setState({ accounts: this.store.list() });
    });
    this.sync = config
      ? new SyncConnection(db, config.powersyncUrl, {
          client: (staffId) => (this.store.get(staffId) ? this.clientFor(staffId) : undefined),
          sessionEnded: (staffId) => this.markPasswordRequired(staffId, 'session_ended'),
        })
      : null;
  }

  // State -----------------------------------------------------------------------------------------

  getState = (): AuthState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private setState(change: Partial<AuthState>): void {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }

  get activeAccount(): DeviceAccount | undefined {
    return this.state.activeId ? this.store.get(this.state.activeId) : undefined;
  }

  get configured(): boolean {
    return this.config !== null;
  }

  async init(): Promise<void> {
    try {
      this.deviceId = await ensureDeviceId(this.db);
      await this.store.load();
    } catch (error) {
      this.setState({ failed: true });
      throw error;
    }
    const branch = await this.db.getOptional<{ value: string }>(
      'SELECT value FROM local_kv WHERE id = ?',
      [BRANCH_KEY],
    );
    const branchId = branch?.value ?? null;
    // Always starts locked: a reload or restart asks for a PIN again.
    this.setState({ ready: true, branchId });
    await this.sync?.setBranch(branchId);
    await this.updateSyncIdentity();
  }

  private clientFor(staffId: string): AppSupabaseClient {
    const existing = this.clients.get(staffId);
    if (existing) return existing;
    if (!this.config) throw new AuthFlowError('not_configured');
    const client = createAppClient(this.config, {
      storageKey: staffStorageKey(staffId),
      storage: this.store.authStorage(staffId),
      deviceId: this.deviceId,
    });
    this.clients.set(staffId, client);
    return client;
  }

  // Password login --------------------------------------------------------------------------------

  /** Logs in online with username and password; returns what the staff member must do next. */
  async passwordLogin(usernameInput: string, password: string): Promise<AuthStep> {
    if (!this.config) throw new AuthFlowError('not_configured');
    const username = normalizeUsername(usernameInput);
    if (!isValidUsername(username)) throw new AuthFlowError('invalid_credentials');

    // Sign in on a throwaway client first: the staff id (and so their own client) is known after.
    const login = createAppClient(this.config, {
      storageKey: `gym-login-${crypto.randomUUID()}`,
      deviceId: this.deviceId,
    });
    const signIn = await login.auth
      .signInWithPassword({ email: staffEmail(username), password })
      .catch((error: unknown) => {
        throw toAuthError(error);
      });
    if (signIn.error) throw toAuthError(signIn.error);
    const { session, user } = signIn.data;
    const staffId = user.id;

    const client = this.clientFor(staffId);
    const stored = await client.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    if (stored.error) throw toAuthError(stored.error);

    try {
      const profile = await fetchProfile(client, staffId);
      if (!profile) throw new AuthFlowError('account_inactive');
      const branches = await fetchBranches(client);
      const { branchId } = this.state;
      const canUseBranch = branchId
        ? branches.some((branch) => branch.id === branchId)
        : branches.length > 0;
      if (!canUseBranch) throw new AuthFlowError('no_branch_access');

      const existing = this.store.get(staffId);
      await this.store.save(
        withAttemptsCleared({
          ...accountFromProfile(profile, branches, existing),
          passwordRequired: null,
        }),
      );
      return await this.nextStep(staffId, branches);
    } catch (error) {
      if (!this.store.get(staffId)) await this.forgetClient(staffId);
      throw toAuthError(error);
    }
  }

  /** The forced password change after an administrator set (or reset) the password. */
  async changePassword(staffId: string, password: string): Promise<AuthStep> {
    const client = this.clientFor(staffId);
    await changePassword(client, password);
    await this.refreshFromServer(staffId);
    // The server clears must_change_password; don't ask twice if its answer was lost.
    await this.store.update(staffId, (account) => ({ ...account, mustChangePassword: false }));
    return this.nextStep(staffId);
  }

  /** Saves a new PIN (on the server, so it works on the staff member's other devices too). */
  async setPin(staffId: string, pin: string): Promise<AuthStep> {
    const hashed = await hashPin(normalizePin(pin));
    try {
      await savePin(this.clientFor(staffId), staffId, hashed);
    } catch (error) {
      throw toAuthError(error);
    }
    await this.store.update(staffId, (account) =>
      withAttemptsCleared({ ...account, pin: hashed, passwordRequired: null }),
    );
    return this.nextStep(staffId);
  }

  /** Sets the branch this device works in. Changing it later is the devices screen (step 1e). */
  async chooseBranch(staffId: string, branchId: string): Promise<AuthStep> {
    await this.db.execute('INSERT OR REPLACE INTO local_kv (id, value) VALUES (?, ?)', [
      BRANCH_KEY,
      branchId,
    ]);
    this.setState({ branchId });
    await this.sync?.setBranch(branchId);
    return this.nextStep(staffId);
  }

  private async nextStep(
    staffId: string,
    knownBranches?: readonly BranchChoice[],
  ): Promise<AuthStep> {
    const account = this.store.get(staffId);
    if (!account) throw new AuthFlowError('unexpected');
    if (account.mustChangePassword) return { kind: 'change_password', staffId };
    if (!account.pin) return { kind: 'set_pin', staffId };
    if (!this.state.branchId) {
      const branches = knownBranches ?? (await fetchBranches(this.clientFor(staffId)));
      const [only] = branches;
      if (branches.length === 1 && only) return this.chooseBranch(staffId, only.id);
      return { kind: 'choose_branch', staffId, branches };
    }
    await this.activate(staffId);
    return { kind: 'done' };
  }

  // PIN, lock and logout --------------------------------------------------------------------------

  async unlock(staffId: string, pinInput: string): Promise<UnlockResult> {
    const account = this.store.get(staffId);
    if (!account) return { kind: 'password_required', reason: 'session_ended' };
    // Checked first, so it never uses up a PIN try. A password login refuses them too.
    if (!canUseBranch(account, this.state.branchId)) return { kind: 'no_branch_access' };
    const blocker = pinBlocker(account);
    if (blocker || !account.pin) return { kind: 'password_required', reason: blocker ?? 'setup' };

    if (await verifyPin(normalizePin(pinInput), account.pin)) {
      await this.store.save(withAttemptsCleared(account));
      await this.activate(staffId);
      void this.refreshFromServer(staffId);
      return { kind: 'unlocked' };
    }

    const maxAttempts = await this.setting('security.pin_max_attempts');
    const updated = withWrongPin(account, maxAttempts);
    await this.store.save(updated);
    if (updated.pinAttempts.lockedOut) return { kind: 'password_required', reason: 'locked_out' };
    return { kind: 'wrong_pin', triesLeft: pinTriesLeft(updated.pinAttempts, maxAttempts) };
  }

  private async activate(staffId: string): Promise<void> {
    const account = await this.store.update(staffId, (current) => ({
      ...current,
      passwordRequired: null,
      lastActiveAt: new Date().toISOString(),
    }));
    // Language order: the staff member's own choice, otherwise the device's current language.
    if (account?.preferredLanguage) setPreference('language', account.preferredLanguage);
    this.setState({ activeId: staffId });
    // Never waits for the network: (re)connecting to the sync service happens in the background.
    void this.updateSyncIdentity();
  }

  /** Locks the app (idle, or to let someone else in). Sync carries on in the background. */
  lock(): void {
    if (this.state.activeId) this.setState({ activeId: null });
  }

  /**
   * Removes a staff member's session and PIN from this device only; the device's data stays.
   * Refused while they have unsent changes, which need their session to upload.
   */
  async logout(staffId: string): Promise<LogoutResult> {
    const pending = (await pendingByAuthor(this.db)).get(staffId) ?? 0;
    if (pending > 0) return { kind: 'pending_changes', count: pending };
    // Ends this device's session on the server too, when online. Offline, it simply expires.
    await this.clients
      .get(staffId)
      ?.auth.signOut({ scope: 'local' })
      .catch(() => undefined);
    await this.store.remove(staffId);
    await this.forgetClient(staffId);
    if (this.state.activeId === staffId) this.setState({ activeId: null });
    await this.updateSyncIdentity();
    return { kind: 'logged_out' };
  }

  private async forgetClient(staffId: string): Promise<void> {
    const client = this.clients.get(staffId);
    this.clients.delete(staffId);
    await client?.removeAllChannels();
  }

  // Online checks ---------------------------------------------------------------------------------

  /**
   * Brings a staff member's cached details up to date: name, role and permissions, and their PIN.
   * A PIN removed by a manager, or a deactivated account, takes effect here. Does nothing offline.
   */
  async refreshFromServer(staffId: string): Promise<void> {
    if (!this.store.get(staffId)) return;
    try {
      const client = this.clientFor(staffId);
      const session = await usableSession(client);
      if (session.kind === 'ended') {
        await this.markPasswordRequired(staffId, 'session_ended');
        return;
      }
      if (session.kind === 'unavailable') return;
      const profile = await fetchProfile(client, staffId);
      if (!profile) {
        await this.markPasswordRequired(staffId, 'inactive');
        return;
      }
      const branches = await fetchBranches(client);
      const updated = await this.store.update(staffId, (account) => ({
        ...accountFromProfile(profile, branches, account),
        passwordRequired:
          account.pin && !profile.pin && account.passwordRequired === null
            ? 'pin_reset'
            : account.passwordRequired,
      }));
      // Access to this device's branch was taken away: they stop at once, like a deactivation.
      if (
        updated &&
        this.state.activeId === staffId &&
        !canUseBranch(updated, this.state.branchId)
      ) {
        this.lock();
      }
    } catch (error) {
      // Network trouble: the next check tries again.
      if (!(error instanceof AuthFlowError && error.key === 'network')) {
        logError(error, { area: 'auth', action: 'refresh' });
      }
    }
  }

  async refreshAll(): Promise<void> {
    for (const account of this.store.list()) await this.refreshFromServer(account.staffId);
  }

  private async markPasswordRequired(staffId: string, reason: PasswordReason): Promise<void> {
    const account = this.store.get(staffId);
    if (!account || account.passwordRequired === reason) return;
    await this.store.update(staffId, (current) => ({ ...current, passwordRequired: reason }));
    // A deactivated staff member stops at once; others keep working locally until they lock.
    if (reason === 'inactive' && this.state.activeId === staffId) this.lock();
    // Not from inside the sync service's own callbacks.
    setTimeout(() => void this.updateSyncIdentity(), 0);
  }

  /** Syncs as the active staff member, else the most recent one whose login still works. */
  private async updateSyncIdentity(): Promise<void> {
    if (!this.sync) return;
    const usable = (staffId: string | null) => {
      const account = staffId ? this.store.get(staffId) : undefined;
      return account && !ENDED.includes(account.passwordRequired) ? account.staffId : null;
    };
    const identity =
      usable(this.state.activeId) ??
      usable(this.sync.syncingAs) ??
      this.store.list().find((account) => !ENDED.includes(account.passwordRequired))?.staffId ??
      null;
    this.setState({ syncingAs: identity });
    await this.sync.setIdentity(identity);
  }

  /** "Sync now". */
  async syncNow(): Promise<void> {
    await this.sync?.reconnect();
  }

  // Settings and preferences ----------------------------------------------------------------------

  /** A setting for this device's branch, from the local database (synced settings). */
  async setting(key: SettingKey): Promise<number> {
    const rows = await this.db.getAll<SettingRow>(
      'SELECT branch_id, key, value FROM settings WHERE key = ?',
      [key],
    );
    return resolveSetting(key, rows, this.state.branchId);
  }

  /** Remembers the active staff member's language on their profile (synced to their devices). */
  async saveLanguage(language: Language): Promise<void> {
    const staffId = this.state.activeId;
    if (!staffId) return;
    await this.store.update(staffId, (account) => ({ ...account, preferredLanguage: language }));
    await this.db.execute(
      `UPDATE staff_users SET preferred_language = ?, _metadata = ?
        WHERE id = ? AND preferred_language IS NOT ?`,
      [language, writeMetadata(staffId), staffId, language],
    );
  }

  async close(): Promise<void> {
    await this.sync?.close();
  }
}

function accountFromProfile(
  profile: StaffProfile,
  branches: readonly BranchChoice[],
  existing?: DeviceAccount,
): DeviceAccount {
  return {
    staffId: profile.staffId,
    username: profile.username,
    fullName: profile.fullName,
    roleId: profile.roleId,
    permissions: profile.permissions,
    branchIds: branches.map((branch) => branch.id),
    preferredLanguage: profile.preferredLanguage,
    mustChangePassword: profile.mustChangePassword,
    pin: profile.pin,
    pinAttempts: existing?.pinAttempts ?? { failures: 0, lockedOut: false },
    passwordRequired: existing?.passwordRequired ?? null,
    lastActiveAt: existing?.lastActiveAt ?? new Date().toISOString(),
  };
}
