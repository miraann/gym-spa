import {
  isValidGymCode,
  isValidUsername,
  normalizeGymCode,
  normalizeUsername,
  staffEmail,
  type NavItemKey,
} from '@gym/core';
import type { Language } from '@gym/i18n';
import type { SecureStorage } from '@gym/platform';
import { createAppClient, type AppSupabaseClient, type BackendConfig } from '@/lib/backend';
import { logError } from '@/lib/logger';
import { setPreference } from '@/lib/preferences';
import {
  AccountStore,
  canUseBranch,
  passwordReasonAfterCheck,
  pinBlocker,
  staffStorageKey,
  type DeviceAccount,
  type PasswordReason,
} from './accounts';
import { DEVICE_GYM_KEY, parseDeviceGym, type DeviceGym } from './device-gym';
import {
  AuthFlowError,
  changePassword,
  checkPin,
  clearPinLockout,
  fetchBranches,
  fetchGym,
  fetchProfile,
  setPin,
  toAuthError,
  usableSession,
  type BranchChoice,
  type PinCheck,
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
  | { readonly kind: 'password_required'; readonly reason: PasswordReason }
  /** Click Group locked the gym; no password helps. */
  | { readonly kind: 'gym_locked' }
  /** The server couldn't be reached, so the PIN can't be checked. */
  | { readonly kind: 'network' };

export interface AuthState {
  /** False until the accounts have been read from secure storage. */
  readonly ready: boolean;
  /** Startup failed (e.g. secure storage can't be read): the app shows an error instead. */
  readonly failed: boolean;
  readonly accounts: readonly DeviceAccount[];
  /** The staff member using the app; null while locked. */
  readonly activeId: string | null;
  /** The branch this device works in, null until chosen. */
  readonly branchId: string | null;
  /** The gym this device works for, null until the first login. */
  readonly gym: DeviceGym | null;
}

/** Secure storage keys of this install. */
const DEVICE_ID_KEY = 'device.id';
const BRANCH_KEY = 'device.branch_id';

/**
 * Login, PIN unlock, lock and logout on this device. Several staff members can be logged in on one
 * device; one of them uses the app at a time (after their PIN), and every request runs under that
 * staff member's own session.
 */
export class AuthController {
  private readonly store: AccountStore;
  private readonly clients = new Map<string, AppSupabaseClient>();
  private deviceId = '';
  private state: AuthState = {
    ready: false,
    failed: false,
    accounts: [],
    activeId: null,
    branchId: null,
    gym: null,
  };
  private readonly listeners = new Set<() => void>();
  /** The gym code from a `?gym=` link the app was opened with (web only). */
  private gymLink: string | null = null;

  constructor(
    private readonly config: BackendConfig | null,
    private readonly storage: SecureStorage,
  ) {
    this.store = new AccountStore(storage);
    this.store.subscribe(() => {
      this.setState({ accounts: this.store.list() });
    });
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

  /** The active staff member's client: requests from the app run under their own session. */
  get activeClient(): AppSupabaseClient | undefined {
    return this.state.activeId && this.config ? this.clientFor(this.state.activeId) : undefined;
  }

  /** The gym code of the `?gym=` link the app was opened with, to fill in on the login screen. */
  get linkedGymCode(): string | null {
    return this.gymLink;
  }

  /**
   * Reads the device's staff accounts and gym. A `?gym=` link for another gym takes over only while
   * nobody is logged in on the device; otherwise the device stays with its gym.
   */
  async init(gymLink: string | null = null): Promise<void> {
    let branchId: string | null;
    let gym: DeviceGym | null;
    try {
      this.deviceId = await this.ensureDeviceId();
      branchId = await this.storage.get(BRANCH_KEY);
      gym = parseDeviceGym(await this.storage.get(DEVICE_GYM_KEY));
      await this.store.load();
    } catch (error) {
      this.setState({ failed: true });
      throw error;
    }
    this.gymLink = gymLink;
    // Always starts locked: a reload or restart asks for a PIN again.
    this.setState({ ready: true, branchId, gym });
    if (gymLink && gym && gym.code !== gymLink && this.store.list().length === 0) {
      await this.forgetGym();
    }
  }

  /** This install's id, made on first launch. It goes with every request (X-Device-Id). */
  private async ensureDeviceId(): Promise<string> {
    const existing = await this.storage.get(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    await this.storage.set(DEVICE_ID_KEY, id);
    return id;
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

  /**
   * Logs in with username and password; returns what the staff member must do next. The gym code
   * is the device's gym once it has one; before that (the first login) it is what was typed. A
   * wrong gym code, username or password are the same error, so nobody learns which gyms or
   * usernames exist.
   */
  async passwordLogin(
    gymCodeInput: string | null,
    usernameInput: string,
    password: string,
  ): Promise<AuthStep> {
    if (!this.config) throw new AuthFlowError('not_configured');
    const gymCode = this.state.gym?.code ?? normalizeGymCode(gymCodeInput ?? '');
    const username = normalizeUsername(usernameInput);
    if (!isValidGymCode(gymCode) || !isValidUsername(username)) {
      throw new AuthFlowError('invalid_credentials');
    }

    // Sign in on a throwaway client first: the staff id (and so their own client) is known after.
    const login = createAppClient(this.config, {
      storageKey: `gym-login-${crypto.randomUUID()}`,
      deviceId: this.deviceId,
    });
    const signIn = await login.auth
      .signInWithPassword({ email: staffEmail(username, gymCode), password })
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
      const gym = await fetchGym(client);
      if (gym?.access === 'locked') throw new AuthFlowError('gym_locked');
      // A password login ends a PIN lockout.
      await clearPinLockout(client);
      const profile = await fetchProfile(client, staffId);
      if (!profile || !gym) throw new AuthFlowError('account_inactive');
      const branches = await fetchBranches(client);
      const { branchId } = this.state;
      const canUseBranch = branchId
        ? branches.some((branch) => branch.id === branchId)
        : branches.length > 0;
      if (!canUseBranch) throw new AuthFlowError('no_branch_access');

      const existing = this.store.get(staffId);
      await this.store.save({
        ...accountFromProfile(profile, branches, existing),
        passwordRequired: null,
      });
      // From now on the login screen asks only for username and password.
      await this.rememberGym(gym);
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

  /** Saves a new PIN on the server, so it works on the staff member's other devices too. */
  async setPin(staffId: string, pin: string): Promise<AuthStep> {
    try {
      await setPin(this.clientFor(staffId), pin);
    } catch (error) {
      throw toAuthError(error);
    }
    await this.store.update(staffId, (account) => ({
      ...account,
      hasPin: true,
      passwordRequired: null,
    }));
    return this.nextStep(staffId);
  }

  /** Sets the branch this device works in. Changing it later is the devices screen (step 1e). */
  async chooseBranch(staffId: string, branchId: string): Promise<AuthStep> {
    await this.storage.set(BRANCH_KEY, branchId);
    this.setState({ branchId });
    return this.nextStep(staffId);
  }

  private async nextStep(
    staffId: string,
    knownBranches?: readonly BranchChoice[],
  ): Promise<AuthStep> {
    const account = this.store.get(staffId);
    if (!account) throw new AuthFlowError('unexpected');
    if (account.mustChangePassword) return { kind: 'change_password', staffId };
    if (!account.hasPin) return { kind: 'set_pin', staffId };
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

  /** Asks the server to check the PIN; it counts wrong tries for every device. */
  async unlock(staffId: string, pin: string): Promise<UnlockResult> {
    const account = this.store.get(staffId);
    const { branchId } = this.state;
    if (!account) return { kind: 'password_required', reason: 'session_ended' };
    // The first login stopped before a branch was chosen: the password login asks for it.
    if (!branchId) {
      await this.markPasswordRequired(staffId, 'setup');
      return { kind: 'password_required', reason: 'setup' };
    }
    // Checked first, so it never uses up a PIN try. A password login refuses them too.
    if (!canUseBranch(account, branchId)) return { kind: 'no_branch_access' };
    const blocker = pinBlocker(account);
    if (blocker) return { kind: 'password_required', reason: blocker };

    const client = this.clientFor(staffId);
    const session = await usableSession(client);
    if (session === 'unavailable') return { kind: 'network' };
    if (session === 'ended') {
      await this.markPasswordRequired(staffId, 'session_ended');
      return { kind: 'password_required', reason: 'session_ended' };
    }

    let check: PinCheck;
    try {
      check = await checkPin(client, pin, branchId);
    } catch (error) {
      const authError = toAuthError(error);
      if (authError.key === 'network') return { kind: 'network' };
      throw authError;
    }

    switch (check.result) {
      case 'ok':
        await this.activate(staffId);
        void this.refreshFromServer(staffId);
        return { kind: 'unlocked' };
      case 'wrong_pin':
        return { kind: 'wrong_pin', triesLeft: check.triesLeft };
      case 'locked_out':
        await this.markPasswordRequired(staffId, 'locked_out');
        return { kind: 'password_required', reason: 'locked_out' };
      case 'no_pin':
        await this.store.update(staffId, (current) => ({ ...current, hasPin: false }));
        await this.markPasswordRequired(staffId, 'pin_reset');
        return { kind: 'password_required', reason: 'pin_reset' };
      case 'inactive':
        await this.markPasswordRequired(staffId, 'inactive');
        return { kind: 'password_required', reason: 'inactive' };
      case 'gym_locked':
        await this.updateGymAccess('locked');
        return { kind: 'gym_locked' };
      case 'no_branch_access':
        // Their access changed since the last check: this device's copy forgets the branch.
        await this.store.update(staffId, (current) => ({
          ...current,
          branchIds: current.branchIds.filter((id) => id !== branchId),
        }));
        return { kind: 'no_branch_access' };
    }
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
  }

  /** Locks the app (idle, or to let someone else in). */
  lock(): void {
    if (this.state.activeId) this.setState({ activeId: null });
  }

  /** Removes a staff member's session from this device only. */
  async logout(staffId: string): Promise<void> {
    // Ends this device's session on the server too. Without a connection, it simply expires.
    await this.clients
      .get(staffId)
      ?.auth.signOut({ scope: 'local' })
      .catch(() => undefined);
    await this.store.remove(staffId);
    await this.forgetClient(staffId);
    if (this.state.activeId === staffId) this.setState({ activeId: null });
  }

  private async forgetClient(staffId: string): Promise<void> {
    const client = this.clients.get(staffId);
    this.clients.delete(staffId);
    await client?.removeAllChannels();
  }

  // Server checks ---------------------------------------------------------------------------------

  /**
   * Brings a staff member's cached details up to date: name, role and permissions, and their PIN.
   * A PIN removed by a manager, a lockout or a deactivated account takes effect here. Does nothing
   * while the server can't be reached.
   */
  async refreshFromServer(staffId: string): Promise<void> {
    if (!this.store.get(staffId)) return;
    try {
      const client = this.clientFor(staffId);
      const session = await usableSession(client);
      if (session === 'ended') {
        await this.markPasswordRequired(staffId, 'session_ended');
        return;
      }
      if (session === 'unavailable') return;
      const gym = await fetchGym(client);
      if (gym) await this.rememberGym(gym);
      if (gym?.access === 'locked') {
        // Nobody of a locked gym uses the app: it locks at once, and the PIN says why.
        if (this.state.activeId === staffId) this.lock();
        return;
      }
      const profile = await fetchProfile(client, staffId);
      if (!profile) {
        await this.markPasswordRequired(staffId, 'inactive');
        return;
      }
      const branches = await fetchBranches(client);
      const updated = await this.store.update(staffId, (account) => ({
        ...accountFromProfile(profile, branches, account),
        passwordRequired: passwordReasonAfterCheck(account, profile),
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

  // The device's gym -----------------------------------------------------------------------------

  /** Keeps the gym (and its latest state) on the device. */
  private async rememberGym(gym: DeviceGym): Promise<void> {
    const current = this.state.gym;
    if (current && JSON.stringify(current) === JSON.stringify(gym)) return;
    await this.storage.set(DEVICE_GYM_KEY, JSON.stringify(gym));
    this.setState({ gym });
  }

  private async updateGymAccess(access: DeviceGym['access']): Promise<void> {
    const { gym } = this.state;
    if (gym) await this.rememberGym({ ...gym, access });
  }

  /**
   * "Use another gym": forgets the device's gym and its branch, so the next login asks for a gym
   * code again. Only while nobody is logged in on the device: they all belong to its gym.
   */
  async forgetGym(): Promise<void> {
    if (this.store.list().length > 0) return;
    await this.storage.delete(DEVICE_GYM_KEY);
    await this.storage.delete(BRANCH_KEY);
    this.setState({ gym: null, branchId: null });
  }

  private async markPasswordRequired(staffId: string, reason: PasswordReason): Promise<void> {
    const account = this.store.get(staffId);
    if (!account || account.passwordRequired === reason) return;
    await this.store.update(staffId, (current) => ({ ...current, passwordRequired: reason }));
    // A deactivated staff member stops at once.
    if (reason === 'inactive' && this.state.activeId === staffId) this.lock();
  }

  // Preferences -----------------------------------------------------------------------------------

  /** Remembers the active staff member's language on their profile, for their other devices. */
  async saveLanguage(language: Language): Promise<void> {
    const staffId = this.state.activeId;
    if (!staffId) return;
    await this.store.update(staffId, (account) => ({ ...account, preferredLanguage: language }));
    const { error } = await this.clientFor(staffId)
      .from('staff_users')
      .update({ preferred_language: language })
      .eq('id', staffId);
    if (error) throw toAuthError(error);
  }

  /**
   * Saves the active staff member's own phone tabs on their profile (null: back to their role's),
   * so they follow them to every device. The server first: tabs change only once it agrees.
   */
  async saveNavTabs(tabs: readonly NavItemKey[] | null): Promise<void> {
    const staffId = this.state.activeId;
    if (!staffId) return;
    const { error } = await this.clientFor(staffId)
      .from('staff_users')
      .update({ nav_tabs: tabs ? [...tabs] : null })
      .eq('id', staffId);
    if (error) throw toAuthError(error);
    await this.store.update(staffId, (account) => ({ ...account, navTabs: tabs }));
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
    roleKey: profile.roleKey,
    permissions: profile.permissions,
    branchIds: branches.map((branch) => branch.id),
    preferredLanguage: profile.preferredLanguage,
    navTabs: profile.navTabs,
    mustChangePassword: profile.mustChangePassword,
    hasPin: profile.hasPin,
    passwordRequired: existing?.passwordRequired ?? null,
    lastActiveAt: existing?.lastActiveAt ?? new Date().toISOString(),
  };
}
