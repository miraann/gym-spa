import {
  licenseDateProblem,
  readActivationCode,
  readLicenseCode,
  staffEmail,
  type License,
} from '@gym/core';
import { AuthAdminError, DatabaseError, type TokenVerifier } from '@gym/staff-admin/server';
import type {
  NewGym,
  RecoveryCodeAnswer,
  SellerAdminLogEntry,
  SellerAdminPort,
  SellerCallerPort,
} from './ports.ts';

// In-memory stand-ins for Supabase Auth and the database, for the seller module's unit tests (Node
// and Deno). They keep just enough of the rules to show what the operations change, and can be told
// to fail.

/** The signed-in platform admin. */
export const ADMIN_ID = 'e0000000-0000-4000-8000-0000000000a1';
export const ADMIN_EMAIL = 'ali@clickgroup.example';
/** What the fake generator returns, so tests can look for it (e.g. in the logs). */
export const TEMPORARY_PASSWORD = 'k7m2p9x4w3h8r6';
/** The gym id the fake id source hands out first. */
export const NEW_GYM_ID = 'e0000000-0000-4000-8000-0000000000f1';
/** The one recovery code the signed-in admin has. */
export const RECOVERY_CODE = 'kkkk-mmmm-nnnn-pppp';
/** The offline gym the fake database knows, and "today" in Baghdad there. */
export const OFFLINE_GYM_ID = 'e0000000-0000-4000-8000-0000000000c1';
export const LICENSE_TODAY = '2026-10-29';
/** A machine code with a good check (packages/core's tests use the same). */
export const MACHINE_CODE = '0V5Q1BD4TS11N9TC9402';

export interface FakeActivation {
  gymId: string;
  machineCode: string;
  code: string;
  active: boolean;
}

export interface FakeLogin {
  email: string;
  password: string;
  banned: boolean;
  twoStep: number;
  /** app_metadata.gym_id (a staff login) */
  gymId: string | null;
  /** app_metadata.platform_admin */
  platformAdmin: boolean;
  /** Old enough to be freed when it has no rows (the database's orphan rules). */
  leftBehind: boolean;
}

export interface FakeAdmin {
  fullName: string;
  isActive: boolean;
  mustChangePassword: boolean;
}

type Method = keyof SellerAdminPort | keyof SellerCallerPort;

const ADMIN_METHODS: Record<keyof SellerAdminPort, true> = {
  createLogin: true,
  deleteLogin: true,
  setPassword: true,
  setEmail: true,
  setBanned: true,
  findOrphanLogin: true,
  createAdminLogin: true,
  findAdminOrphan: true,
  removeTwoStep: true,
};

export function emailExists(): AuthAdminError {
  return new AuthAdminError(
    'email_exists',
    422,
    'A user with this email address has already been registered',
  );
}

export class FakeSellerWorld {
  readonly logins = new Map<string, FakeLogin>();
  readonly admins = new Map<string, FakeAdmin>();
  /** gym code → the gym, as seller_create_gym made it. */
  readonly gyms = new Map<string, NewGym>();
  /** Recovery codes of the signed-in admin that are still unused. */
  readonly recoveryCodes = new Set<string>([RECOVERY_CODE]);
  /** Every port call in order, e.g. "admin.createLogin". */
  readonly calls: string[] = [];
  readonly logs: SellerAdminLogEntry[] = [];
  /** Seller log entries the database wrote. */
  readonly records: string[] = [];
  /** Offline gyms by id: the only gyms with licenses. */
  readonly offlineGyms = new Map([[OFFLINE_GYM_ID, { code: 'hawler-off', name: 'جیمی هەولێر' }]]);
  readonly licenses = new Map<string, { license: License; code: string }>();
  readonly activations = new Map<string, FakeActivation>();
  /** What useRecoveryCode answers when the code is wrong (too_many_attempts after 5). */
  wrongCodeAnswer: RecoveryCodeAnswer = 'wrong_code';
  private readonly failures = new Map<Method, Error[]>();
  private nextId = 1;

  constructor() {
    this.logins.set(ADMIN_ID, {
      email: ADMIN_EMAIL,
      password: 'their-own-password',
      banned: false,
      twoStep: 1,
      gymId: null,
      platformAdmin: true,
      leftBehind: false,
    });
    this.admins.set(ADMIN_ID, { fullName: 'عەلی', isActive: true, mustChangePassword: false });
  }

  /** The next `times` calls of the method throw this error. */
  failNext(method: Method, error: Error, times = 1): this {
    const queue = this.failures.get(method) ?? [];
    for (let index = 0; index < times; index += 1) queue.push(error);
    this.failures.set(method, queue);
    return this;
  }

  newId(): string {
    const id = `e0000000-0000-4000-8000-${String(this.nextId).padStart(12, '0')}`;
    this.nextId += 1;
    return id;
  }

  /** Another platform admin, with a login and a two-step device. */
  addAdmin(email: string, changes: Partial<FakeAdmin> = {}): string {
    const id = this.newId();
    this.logins.set(id, {
      email,
      password: 'their-own-password',
      banned: changes.isActive === false,
      twoStep: 1,
      gymId: null,
      platformAdmin: true,
      leftBehind: false,
    });
    this.admins.set(id, {
      fullName: 'هاوکار',
      isActive: true,
      mustChangePassword: false,
      ...changes,
    });
    return id;
  }

  /** A login without rows: left behind by a create that failed and wasn't undone, or not. */
  addLogin(email: string, changes: Partial<FakeLogin> = {}): string {
    const id = this.newId();
    this.logins.set(id, {
      email,
      password: 'x',
      banned: false,
      twoStep: 0,
      gymId: null,
      platformAdmin: false,
      leftBehind: false,
      ...changes,
    });
    return id;
  }

  loginByEmail(email: string): [string, FakeLogin] | undefined {
    return [...this.logins].find(([, login]) => login.email === email);
  }

  private async call(method: Method): Promise<void> {
    this.calls.push(method in ADMIN_METHODS ? `admin.${method}` : `caller.${method}`);
    await Promise.resolve();
    const error = this.failures.get(method)?.shift();
    if (error !== undefined) throw error;
  }

  private login(id: string): FakeLogin {
    const login = this.logins.get(id);
    if (!login) throw new AuthAdminError('user_not_found', 404, 'User not found');
    return login;
  }

  private offlineGym(gymId: string): { code: string; name: string } {
    const gym = this.offlineGyms.get(gymId);
    if (!gym) throw new DatabaseError('gym_not_found', '22023', 400);
    return gym;
  }

  private checkCanActivate(gymId: string): void {
    if (![...this.licenses.values()].some(({ license }) => license.gymId === gymId)) {
      throw new DatabaseError('no_license', '22023', 400);
    }
    if ([...this.activations.values()].some((a) => a.gymId === gymId && a.active)) {
      throw new DatabaseError('already_activated', '23505', 409);
    }
  }

  private target(userId: string): FakeAdmin {
    if (userId === ADMIN_ID) throw new DatabaseError('cannot_change_own_admin', '42501', 403);
    const admin = this.admins.get(userId);
    if (!admin) throw new DatabaseError('admin_not_found', '22023', 400);
    return admin;
  }

  readonly admin: SellerAdminPort = {
    createLogin: async ({ email, password, gymId }) => {
      await this.call('createLogin');
      if (this.loginByEmail(email)) throw emailExists();
      return this.addLogin(email, { password, gymId });
    },
    deleteLogin: async (id) => {
      await this.call('deleteLogin');
      if (!this.logins.delete(id)) {
        throw new AuthAdminError('user_not_found', 404, 'User not found');
      }
    },
    setPassword: async (id, password) => {
      await this.call('setPassword');
      this.login(id).password = password;
      // app.clear_must_change_password: every password change clears the flag.
      const admin = this.admins.get(id);
      if (admin) admin.mustChangePassword = false;
    },
    setEmail: async (id, email) => {
      await this.call('setEmail');
      this.login(id).email = email;
    },
    setBanned: async (id, banned) => {
      await this.call('setBanned');
      this.login(id).banned = banned;
    },
    findOrphanLogin: async (email) => {
      await this.call('findOrphanLogin');
      const found = this.loginByEmail(email);
      if (!found) return null;
      const [id, login] = found;
      const gymMade = [...this.gyms.values()].some((gym) => gym.ownerId === id);
      return login.leftBehind && !gymMade && !this.admins.has(id) ? id : null;
    },
    createAdminLogin: async ({ email, password }) => {
      await this.call('createAdminLogin');
      if (this.loginByEmail(email)) throw emailExists();
      return this.addLogin(email, { password, platformAdmin: true });
    },
    findAdminOrphan: async (email) => {
      await this.call('findAdminOrphan');
      const found = this.loginByEmail(email);
      if (!found) return null;
      const [id, login] = found;
      return login.leftBehind && login.platformAdmin && !this.admins.has(id) ? id : null;
    },
    removeTwoStep: async (id) => {
      await this.call('removeTwoStep');
      this.login(id).twoStep = 0;
    },
  };

  readonly caller: SellerCallerPort = {
    prepareCreateGym: async (code) => {
      await this.call('prepareCreateGym');
      if (code === 'admin') throw new DatabaseError('reserved_gym_code', '23514', 400);
      if (this.gyms.has(code)) throw new DatabaseError('gym_code_taken', '23505', 409);
    },
    createGym: async (gym) => {
      await this.call('createGym');
      if (this.gyms.has(gym.code)) throw new DatabaseError('gym_code_taken', '23505', 409);
      // login_matches
      if (this.logins.get(gym.ownerId)?.email !== staffEmail(gym.ownerUsername, gym.code)) {
        throw new DatabaseError('staff_login_mismatch', '23514', 400);
      }
      this.gyms.set(gym.code, gym);
      this.records.push(`gym_created ${gym.code}`);
    },
    prepareAddAdmin: async (email) => {
      await this.call('prepareAddAdmin');
      const found = this.loginByEmail(email);
      if (found && this.admins.has(found[0])) throw new DatabaseError('email_taken', '23505', 409);
    },
    addAdmin: async (userId, fullName) => {
      await this.call('addAdmin');
      if (!this.logins.get(userId)?.platformAdmin) {
        throw new DatabaseError('staff_cannot_be_platform_admin', '23514', 400);
      }
      this.admins.set(userId, { fullName, isActive: true, mustChangePassword: true });
      this.records.push(`admin_created ${userId}`);
    },
    prepareAdminChange: async (userId) => {
      await this.call('prepareAdminChange');
      const admin = this.target(userId);
      return { email: this.login(userId).email, isActive: admin.isActive };
    },
    setAdminActive: async (userId, active) => {
      await this.call('setAdminActive');
      const admin = this.target(userId);
      if (admin.isActive === active) return;
      admin.isActive = active;
      this.records.push(`${active ? 'admin_reactivated' : 'admin_deactivated'} ${userId}`);
    },
    recordAdminChange: async (userId, action) => {
      await this.call('recordAdminChange');
      const admin = this.target(userId);
      if (action === 'reset_password') admin.mustChangePassword = true;
      this.records.push(
        `admin_${action === 'reset_password' ? 'password' : 'two_step'}_reset ${userId}`,
      );
    },
    useRecoveryCode: async (code) => {
      await this.call('useRecoveryCode');
      if (this.wrongCodeAnswer === 'too_many_attempts') return 'too_many_attempts';
      if (!this.recoveryCodes.delete(code)) {
        this.records.push('recovery_code_rejected');
        return 'wrong_code';
      }
      this.records.push('recovery_code_used');
      return 'ok';
    },
    prepareLicense: async ({ gymId, type, validUntil }) => {
      await this.call('prepareLicense');
      const gym = this.offlineGym(gymId);
      if (licenseDateProblem(type, LICENSE_TODAY, validUntil) !== null) {
        throw new DatabaseError('invalid_license_date', '22023', 400);
      }
      return { gymCode: gym.code, gymName: gym.name, issuedOn: LICENSE_TODAY };
    },
    issueLicense: async (license, code) => {
      await this.call('issueLicense');
      this.offlineGym(license.gymId);
      // The database compares the code's payload with the fields it stores.
      if (JSON.stringify(readLicenseCode(code)) !== JSON.stringify(license)) {
        throw new DatabaseError('license_code_mismatch', '22023', 400);
      }
      this.licenses.set(license.licenseId, { license, code });
      this.records.push(`license_issued ${license.licenseId}`);
    },
    prepareActivation: async (gymId, machineCode) => {
      await this.call('prepareActivation');
      this.offlineGym(gymId);
      this.checkCanActivate(gymId);
      return { machineCode, issuedOn: LICENSE_TODAY };
    },
    issueActivation: async (activation, code) => {
      await this.call('issueActivation');
      this.checkCanActivate(activation.gymId);
      if (JSON.stringify(readActivationCode(code)) !== JSON.stringify(activation)) {
        throw new DatabaseError('license_code_mismatch', '22023', 400);
      }
      this.activations.set(activation.activationId, {
        gymId: activation.gymId,
        machineCode: activation.machineCode,
        code,
        active: true,
      });
      this.records.push(`activation_issued ${activation.activationId}`);
    },
  };

  readonly deps = {
    admin: this.admin,
    caller: this.caller,
    log: (entry: SellerAdminLogEntry) => {
      this.logs.push(entry);
    },
    callerId: ADMIN_ID,
    temporaryPassword: () => TEMPORARY_PASSWORD,
    newId: () => NEW_GYM_ID,
  };
}

/**
 * For handler tests: 'aal2-token' is the admin after two-step login, 'aal1-token' after the
 * password only; anything else is refused.
 */
export const acceptAdminTokens: TokenVerifier = (token) =>
  Promise.resolve(
    token === 'aal2-token'
      ? { ok: true, userId: ADMIN_ID, aal: 'aal2' }
      : token === 'aal1-token'
        ? { ok: true, userId: ADMIN_ID, aal: 'aal1' }
        : { ok: false, reason: 'invalid' },
  );
