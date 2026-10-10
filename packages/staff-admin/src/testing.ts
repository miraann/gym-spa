import { staffEmail } from '@gym/core';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload } from 'jose';
import {
  AuthAdminError,
  DatabaseError,
  type AdminPort,
  type CallerPort,
  type StaffAdminLogEntry,
} from './ports.ts';
import { jwksTokenVerifier, type TokenVerifier } from './token.ts';

// In-memory stand-ins for Supabase Auth and the database, for the unit tests (Node and Deno). They
// keep just enough rules to show what the operations change, and can be told to fail.

export const GYM_ID = 'a0000000-0000-4000-8000-000000000001';
export const GYM_CODE = 'hawler-fit';
export const ROLE_ID = 'a0000000-0000-4000-8000-0000000000a1';
export const BRANCH_ID = 'a0000000-0000-4000-8000-0000000000b1';
/** What the fake generator returns, so tests can look for it (e.g. in the logs). */
export const TEMPORARY_PASSWORD = 'k7m2p9x4w3h8r6';

export interface FakeLogin {
  email: string;
  password: string;
  banned: boolean;
  gymId: string | null;
  /** Old enough and made by the staff module: staff_admin_orphan may pick it when it has no staff row. */
  leftBehind: boolean;
}

export interface FakeStaff {
  username: string;
  fullName: string;
  isActive: boolean;
  mustChangePassword: boolean;
  allBranches: boolean;
  branchIds: string[];
}

type Method = keyof AdminPort | keyof CallerPort;

export class FakeWorld {
  readonly logins = new Map<string, FakeLogin>();
  readonly staff = new Map<string, FakeStaff>();
  /** Every port call in order, e.g. "admin.createLogin". */
  readonly calls: string[] = [];
  readonly logs: StaffAdminLogEntry[] = [];
  private readonly failures = new Map<Method, Error[]>();
  private nextId = 1;

  /** The next `times` calls of the method throw this error. */
  failNext(method: Method, error: Error, times = 1): this {
    const queue = this.failures.get(method) ?? [];
    for (let index = 0; index < times; index += 1) queue.push(error);
    this.failures.set(method, queue);
    return this;
  }

  newId(): string {
    const id = `c0000000-0000-4000-8000-${String(this.nextId).padStart(12, '0')}`;
    this.nextId += 1;
    return id;
  }

  /** An existing staff member with a login, as the database would have them. */
  addStaff(username: string, changes: Partial<FakeStaff> = {}): string {
    const id = this.newId();
    this.logins.set(id, {
      email: staffEmail(username, GYM_CODE),
      password: 'their-own-password',
      banned: changes.isActive === false,
      gymId: GYM_ID,
      leftBehind: false,
    });
    this.staff.set(id, {
      username,
      fullName: 'کارمەند',
      isActive: true,
      mustChangePassword: false,
      allBranches: false,
      branchIds: [BRANCH_ID],
      ...changes,
    });
    return id;
  }

  /** A login without a staff row (a create that failed and wasn't undone, or a platform admin). */
  addLogin(email: string, leftBehind: boolean): string {
    const id = this.newId();
    this.logins.set(id, { email, password: 'x', banned: false, gymId: GYM_ID, leftBehind });
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

  readonly admin: AdminPort = {
    createLogin: async ({ email, password, gymId }) => {
      await this.call('createLogin');
      if (this.loginByEmail(email)) throw emailExists();
      const id = this.newId();
      this.logins.set(id, { email, password, banned: false, gymId, leftBehind: false });
      return id;
    },
    deleteLogin: async (id) => {
      await this.call('deleteLogin');
      if (!this.logins.delete(id))
        throw new AuthAdminError('user_not_found', 404, 'User not found');
    },
    setPassword: async (id, password) => {
      await this.call('setPassword');
      this.login(id).password = password;
      // app.clear_must_change_password: every password change clears the flag.
      const staff = this.staff.get(id);
      if (staff) staff.mustChangePassword = false;
    },
    setEmail: async (id, email) => {
      await this.call('setEmail');
      const holder = this.loginByEmail(email);
      if (holder && holder[0] !== id) throw emailExists();
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
      return login.leftBehind && !this.staff.has(id) ? id : null;
    },
  };

  readonly caller: CallerPort = {
    prepareCreate: async ({ username }) => {
      await this.call('prepareCreate');
      if ([...this.staff.values()].some((staff) => staff.username === username)) {
        throw new DatabaseError('username_taken', '23505', 409);
      }
      return { gymId: GYM_ID, gymCode: GYM_CODE };
    },
    prepareChange: async (staffId) => {
      await this.call('prepareChange');
      const staff = this.staff.get(staffId);
      if (!staff) throw new DatabaseError('cannot_manage_staff', '42501', 403);
      return { gymCode: GYM_CODE, username: staff.username, isActive: staff.isActive };
    },
    createProfile: async (profile) => {
      await this.call('createProfile');
      // login_matches
      if (this.logins.get(profile.id)?.email !== staffEmail(profile.username, GYM_CODE)) {
        throw new DatabaseError('staff_login_mismatch', '23514', 400);
      }
      this.staff.set(profile.id, {
        username: profile.username,
        fullName: profile.fullName,
        isActive: true,
        mustChangePassword: true,
        allBranches: profile.allBranches,
        branchIds: [...profile.branchIds],
      });
    },
    setActive: async (staffId, active) => {
      await this.call('setActive');
      this.member(staffId).isActive = active;
    },
    requirePasswordChange: async (staffId) => {
      await this.call('requirePasswordChange');
      this.member(staffId).mustChangePassword = true;
    },
    setUsername: async (staffId, username) => {
      await this.call('setUsername');
      if (this.logins.get(staffId)?.email !== staffEmail(username, GYM_CODE)) {
        throw new DatabaseError('staff_login_mismatch', '23514', 400);
      }
      this.member(staffId).username = username;
    },
  };

  private login(id: string): FakeLogin {
    const login = this.logins.get(id);
    if (!login) throw new AuthAdminError('user_not_found', 404, 'User not found');
    return login;
  }

  private member(id: string): FakeStaff {
    const staff = this.staff.get(id);
    if (!staff) throw new DatabaseError('cannot_manage_staff', null, 200);
    return staff;
  }

  readonly deps = {
    admin: this.admin,
    caller: this.caller,
    log: (entry: StaffAdminLogEntry) => {
      this.logs.push(entry);
    },
    temporaryPassword: () => TEMPORARY_PASSWORD,
  };
}

const ADMIN_METHODS: Record<keyof AdminPort, true> = {
  createLogin: true,
  deleteLogin: true,
  setPassword: true,
  setEmail: true,
  setBanned: true,
  findOrphanLogin: true,
};

export function emailExists(): AuthAdminError {
  return new AuthAdminError(
    'email_exists',
    422,
    'A user with this email address has already been registered',
  );
}

// Tokens ------------------------------------------------------------------------------------------

export const MANAGER_ID = 'a0000000-0000-4000-8000-0000000000c1';

/** For tests about what comes after the token check: only 'manager-token' passes. */
export const acceptManagerToken: TokenVerifier = (token) =>
  Promise.resolve(
    token === 'manager-token' ? { ok: true, userId: MANAGER_ID } : { ok: false, reason: 'invalid' },
  );

const PROJECT_KID = 'project-key';
/** Supabase's local legacy JWT secret: the kind of key the anon and service_role keys use. */
const SYMMETRIC_SECRET = new TextEncoder().encode(
  'super-secret-jwt-token-with-at-least-32-characters-long',
);

export interface TestTokens {
  /** Checks tokens against the test project's published key, as the real verifier does. */
  readonly verifier: TokenVerifier;
  /** A token signed with the project's key; claims add to or replace a valid staff session. */
  readonly sign: (claims?: JWTPayload) => Promise<string>;
  /** The same token, signed with another key under the project's key id. */
  readonly forge: (claims?: JWTPayload) => Promise<string>;
  /** Signed with a shared secret (HS256), like the legacy anon and service_role keys. */
  readonly symmetric: (claims?: JWTPayload) => Promise<string>;
}

/** A test project with its own ES256 key (like Supabase's), and an attacker's key. */
export async function testTokens(): Promise<TestTokens> {
  const project = await generateKeyPair('ES256', { extractable: true });
  const attacker = await generateKeyPair('ES256');
  const publicKey = {
    ...(await exportJWK(project.publicKey)),
    kid: PROJECT_KID,
    alg: 'ES256',
    use: 'sig',
  };
  const now = Math.floor(Date.now() / 1000);
  const session = (claims: JWTPayload): JWTPayload => ({
    sub: MANAGER_ID,
    role: 'authenticated',
    aud: 'authenticated',
    iat: now,
    exp: now + 3600,
    ...claims,
  });
  const build = (claims: JWTPayload, alg: string) =>
    new SignJWT(session(claims)).setProtectedHeader({ alg, kid: PROJECT_KID, typ: 'JWT' });

  return {
    verifier: jwksTokenVerifier(createLocalJWKSet({ keys: [publicKey] })),
    sign: (claims = {}) => build(claims, 'ES256').sign(project.privateKey),
    forge: (claims = {}) => build(claims, 'ES256').sign(attacker.privateKey),
    symmetric: (claims = {}) => build(claims, 'HS256').sign(SYMMETRIC_SECRET),
  };
}

/**
 * A key set with a key for an algorithm the module doesn't expect (ES384), and a token signed with
 * it: only the algorithm list keeps it out.
 */
export async function unexpectedAlgorithm(): Promise<{ verifier: TokenVerifier; token: string }> {
  const pair = await generateKeyPair('ES384', { extractable: true });
  const publicKey = {
    ...(await exportJWK(pair.publicKey)),
    kid: 'other-key',
    alg: 'ES384',
    use: 'sig',
  };
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ role: 'authenticated', aud: 'authenticated' })
    .setProtectedHeader({ alg: 'ES384', kid: 'other-key', typ: 'JWT' })
    .setSubject(MANAGER_ID)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(pair.privateKey);
  return { verifier: jwksTokenVerifier(createLocalJWKSet({ keys: [publicKey] })), token };
}
