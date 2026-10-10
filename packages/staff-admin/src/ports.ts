// What the staff operations need from the outside, as small interfaces: Supabase clients in the
// Edge Function and gym-server (supabase-ports.ts), fakes in the tests (testing.ts).

/** The login of a new staff member, made with Supabase Auth's admin API. */
export interface NewLogin {
  readonly email: string;
  readonly password: string;
  /** Kept in the login's app_metadata: staff_admin_orphan checks it. */
  readonly gymId: string;
}

/** The secret key's side: Supabase Auth's admin API, and the look-up only the secret key may call. */
export interface AdminPort {
  /** Returns the new login's id (also the staff member's id). */
  createLogin(login: NewLogin): Promise<string>;
  deleteLogin(id: string): Promise<void>;
  setPassword(id: string, password: string): Promise<void>;
  setEmail(id: string, email: string): Promise<void>;
  /** Banned logins can't log in or refresh a session. */
  setBanned(id: string, banned: boolean): Promise<void>;
  /** public.staff_admin_orphan: the id of a login left behind at this address that may be deleted. */
  findOrphanLogin(email: string): Promise<string | null>;
}

/** Supabase Auth refused or failed. code: Auth's error code, e.g. email_exists. */
export class AuthAdminError extends Error {
  override readonly name = 'AuthAdminError';
  constructor(
    readonly code: string | null,
    readonly status: number | null,
    message: string,
  ) {
    super(message);
  }
}

export interface CreateCheck {
  readonly username: string;
  readonly roleId: string;
  readonly allBranches: boolean;
  readonly branchIds: readonly string[];
}

export interface CreatePermit {
  readonly gymId: string;
  readonly gymCode: string;
}

export type ChangeAction = 'reset_password' | 'deactivate' | 'reactivate' | 'rename';

export interface ChangePermit {
  readonly gymCode: string;
  /** The current username. */
  readonly username: string;
  readonly isActive: boolean;
}

export interface NewStaffProfile extends CreateCheck {
  readonly id: string;
  readonly fullName: string;
  readonly phone: string | null;
}

/**
 * The manager's side: every call runs under their own session, so RLS, the guards and the audit
 * log treat it like any other change they make.
 */
export interface CallerPort {
  /** public.staff_admin_prepare_create */
  prepareCreate(check: CreateCheck): Promise<CreatePermit>;
  /** public.staff_admin_prepare_change */
  prepareChange(staffId: string, action: ChangeAction, newUsername?: string): Promise<ChangePermit>;
  /** public.create_staff_profile: the staff rows, all or none. */
  createProfile(profile: NewStaffProfile): Promise<void>;
  setActive(staffId: string, active: boolean): Promise<void>;
  /** must_change_password = true, after a password reset. */
  requirePasswordChange(staffId: string): Promise<void>;
  setUsername(staffId: string, username: string): Promise<void>;
}

/**
 * The database refused or failed. message: the guard's stable key when there is one (e.g.
 * cannot_grant_role); code: SQLSTATE or PostgREST code; status: the HTTP status.
 */
export class DatabaseError extends Error {
  override readonly name = 'DatabaseError';
  constructor(
    message: string,
    readonly code: string | null,
    readonly status: number | null,
  ) {
    super(message);
  }
}

/** Just enough of an error to find out what went wrong, without its payload. */
export interface ErrorSummary {
  readonly name: string;
  readonly message: string;
  readonly code?: string | null;
  readonly status?: number | null;
}

/**
 * Something an operator should know about. Entries never hold a password: they carry ids, the
 * login address, and summaries of errors.
 */
export interface StaffAdminLogEntry {
  readonly event:
    | 'orphan_login_deleted'
    | 'compensation_failed'
    | 'must_change_not_set'
    | 'auth_update_failed'
    | 'unexpected_error';
  readonly action: string;
  readonly staffId?: string;
  readonly email?: string;
  readonly error?: ErrorSummary;
  /** What failed first, when the clean-up after it failed too. */
  readonly cause?: ErrorSummary;
}

export type StaffAdminLog = (entry: StaffAdminLogEntry) => void;

export function summarizeError(error: unknown): ErrorSummary {
  if (error instanceof AuthAdminError || error instanceof DatabaseError) {
    return { name: error.name, message: error.message, code: error.code, status: error.status };
  }
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: typeof error, message: String(error) };
}

/** One JSON line per entry on stderr, where the Edge Function's and gym-server's logs are read. */
export const consoleLog: StaffAdminLog = (entry) => {
  console.error(JSON.stringify({ source: 'staff-admin', ...entry }));
};
