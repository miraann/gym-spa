import { readStaffAdminConfig } from './env.ts';
import { StaffAdminError, type StaffAdminErrorKey } from './errors.ts';
import { createStaffAdminHandler } from './handler.ts';
import {
  createStaff,
  deactivateStaff,
  reactivateStaff,
  renameStaff,
  resetPassword,
} from './operations.ts';
import { AuthAdminError, DatabaseError, type CallerPort } from './ports.ts';
import { staffAdminRequest, type CreateStaffRequest } from './requests.ts';
import {
  TEMPORARY_PASSWORD_ALPHABET,
  TEMPORARY_PASSWORD_LENGTH,
  generateTemporaryPassword,
} from './temporary-password.ts';
import {
  BRANCH_ID,
  FakeWorld,
  GYM_CODE,
  GYM_ID,
  ROLE_ID,
  MANAGER_ID,
  TEMPORARY_PASSWORD,
  acceptManagerToken,
  emailExists,
  testTokens,
  unexpectedAlgorithm,
} from './testing.ts';
import { projectTokenVerifier, type TokenVerifier } from './token.ts';

// The staff module's unit tests, written once for both runtimes: Vitest runs them in Node
// (cases.test.ts) and Deno.test in Deno (supabase/functions/staff-admin/cases.test.ts), so the
// code the Edge Function runs is tested where it runs. Plain checks, no test library.

export interface StaffAdminCase {
  readonly name: string;
  readonly run: () => Promise<void>;
}

class CheckFailed extends Error {
  override readonly name = 'CheckFailed';
}

function check(condition: boolean, what: string): asserts condition {
  if (!condition) throw new CheckFailed(what);
}

function equal(actual: unknown, expected: unknown, what: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new CheckFailed(`${what}: expected ${b}, got ${a}`);
}

async function rejectsWith(promise: Promise<unknown>, key: StaffAdminErrorKey): Promise<void> {
  try {
    await promise;
  } catch (error) {
    check(
      error instanceof StaffAdminError,
      `expected StaffAdminError ${key}, got ${String(error)}`,
    );
    equal(error.key, key, 'error key');
    return;
  }
  throw new CheckFailed(`expected ${key}, but it succeeded`);
}

/** No log entry may contain a password. */
function checkLogsClean(world: FakeWorld, ...passwords: string[]): void {
  const logged = JSON.stringify(world.logs);
  for (const password of [TEMPORARY_PASSWORD, ...passwords]) {
    check(!logged.includes(password), 'a password was logged');
  }
}

function newStaff(changes: Partial<CreateStaffRequest> = {}): CreateStaffRequest {
  return {
    action: 'create',
    username: 'ali.karim',
    fullName: 'عەلی کەریم',
    phone: '0750 123 4567',
    roleId: ROLE_ID,
    allBranches: false,
    branchIds: [BRANCH_ID],
    ...changes,
  };
}

const NEW_EMAIL = `ali.karim@${GYM_CODE}.staff.gym-spa.invalid`;
const refused = (key: string) => new DatabaseError(key, '42501', 403);
const crash = () => new Error('connection reset');

function test(name: string, run: () => Promise<void>): StaffAdminCase {
  return { name, run };
}

const createCases: StaffAdminCase[] = [
  test('create: makes the login and the staff rows, and returns the temporary password once', async () => {
    const world = new FakeWorld();
    const result = await createStaff(world.deps, newStaff());

    equal(result.username, 'ali.karim', 'username');
    equal(result.temporaryPassword, TEMPORARY_PASSWORD, 'temporary password');
    const login = world.logins.get(result.staffId);
    check(login !== undefined, 'the login exists');
    equal(login.email, NEW_EMAIL, 'the login address uses the gym code from the database');
    equal(login.password, TEMPORARY_PASSWORD, 'the login has the temporary password');
    equal(login.gymId, GYM_ID, 'the login knows its gym (app_metadata)');
    equal(world.staff.get(result.staffId)?.mustChangePassword, true, 'must change password');
    equal(world.staff.get(result.staffId)?.branchIds, [BRANCH_ID], 'branches');
    equal(
      world.calls,
      ['caller.prepareCreate', 'admin.createLogin', 'caller.createProfile'],
      'check, then login, then staff rows',
    );
  }),

  test('create: all branches sends no branch rows', async () => {
    const world = new FakeWorld();
    const result = await createStaff(world.deps, newStaff({ allBranches: true }));
    equal(world.staff.get(result.staffId)?.branchIds, [], 'no branch rows');
  }),

  test('create: a refused check changes nothing and never calls Auth', async () => {
    const world = new FakeWorld().failNext('prepareCreate', refused('cannot_grant_role'));
    await rejectsWith(createStaff(world.deps, newStaff()), 'cannot_grant_role');
    equal(world.calls, ['caller.prepareCreate'], 'only the check');
    equal(world.logins.size, 0, 'no login');
  }),

  test('create: a refused staff row deletes the new login again', async () => {
    const world = new FakeWorld().failNext('createProfile', refused('no_branch_access'));
    await rejectsWith(createStaff(world.deps, newStaff()), 'no_branch_access');
    equal(world.logins.size, 0, 'the login is gone');
    equal(world.staff.size, 0, 'no staff row');
    equal(world.calls.at(-1), 'admin.deleteLogin', 'undone last');
  }),

  test('create: an unexpected database failure deletes the login and is logged', async () => {
    const world = new FakeWorld().failNext('createProfile', crash());
    await rejectsWith(createStaff(world.deps, newStaff()), 'staff_create_failed');
    equal(world.logins.size, 0, 'the login is gone');
    equal(
      world.logs.map((entry) => entry.event),
      ['unexpected_error'],
      'logged',
    );
    checkLogsClean(world);
  }),

  test('create: when the undo fails too, it is logged for an operator', async () => {
    const world = new FakeWorld()
      .failNext('createProfile', refused('cannot_grant_role'))
      .failNext('deleteLogin', new AuthAdminError(null, 500, 'Auth is down'));
    await rejectsWith(createStaff(world.deps, newStaff()), 'staff_create_failed');
    equal(world.logs.length, 1, 'one entry');
    const entry = world.logs[0];
    check(entry !== undefined, 'an entry');
    equal(entry.event, 'compensation_failed', 'event');
    equal(entry.email, NEW_EMAIL, 'the address left behind');
    check(entry.staffId !== undefined && world.logins.has(entry.staffId), 'names the login left');
    equal(entry.cause?.message, 'cannot_grant_role', 'and why the create failed');
    checkLogsClean(world);
  }),

  test('create: a login left behind at the address is deleted, then the create works', async () => {
    const world = new FakeWorld();
    const orphan = world.addLogin(NEW_EMAIL, true);
    const result = await createStaff(world.deps, newStaff());
    check(!world.logins.has(orphan), 'the old login is gone');
    equal(world.logins.get(result.staffId)?.email, NEW_EMAIL, 'the new login has the address');
    equal(
      world.logs.map((entry) => entry.event),
      ['orphan_login_deleted'],
      'logged',
    );
    equal(world.logs[0]?.staffId, orphan, 'with the deleted id');
    checkLogsClean(world);
  }),

  test('create: a login at the address that may not be deleted makes the username taken', async () => {
    const world = new FakeWorld();
    // E.g. a platform admin, or one made a moment ago: staff_admin_orphan returns null.
    const kept = world.addLogin(NEW_EMAIL, false);
    await rejectsWith(createStaff(world.deps, newStaff()), 'username_taken');
    check(world.logins.has(kept), 'it is never deleted');
    check(!world.calls.includes('admin.deleteLogin'), 'nothing was deleted');
  }),

  test('create: the second try is not repeated when the address is taken again', async () => {
    const world = new FakeWorld();
    world.addLogin(NEW_EMAIL, true);
    world.failNext('createLogin', emailExists(), 2);
    await rejectsWith(createStaff(world.deps, newStaff()), 'username_taken');
    equal(world.calls.filter((call) => call === 'admin.createLogin').length, 2, 'two tries');
  }),

  test('create: an Auth failure creates nothing', async () => {
    const world = new FakeWorld().failNext('createLogin', new AuthAdminError(null, 500, 'down'));
    await rejectsWith(createStaff(world.deps, newStaff()), 'staff_create_failed');
    check(!world.calls.includes('caller.createProfile'), 'no staff rows tried');
    checkLogsClean(world);
  }),

  test('create: an expired session is unauthorized', async () => {
    const world = new FakeWorld().failNext(
      'prepareCreate',
      new DatabaseError('JWT expired', 'PGRST303', 401),
    );
    await rejectsWith(createStaff(world.deps, newStaff()), 'unauthorized');
  }),

  test('create: a username taken at the same moment (unique index) is username_taken', async () => {
    const world = new FakeWorld().failNext(
      'createProfile',
      new DatabaseError('duplicate key value violates unique constraint', '23505', 409),
    );
    await rejectsWith(createStaff(world.deps, newStaff()), 'username_taken');
    equal(world.logins.size, 0, 'the login is gone');
  }),
];

const resetCases: StaffAdminCase[] = [
  test('reset: sets a new temporary password, then marks it must-change', async () => {
    const world = new FakeWorld();
    const id = world.addStaff('reception');
    const result = await resetPassword(world.deps, { action: 'reset_password', staffId: id });
    equal(result, { staffId: id, temporaryPassword: TEMPORARY_PASSWORD }, 'result');
    equal(world.logins.get(id)?.password, TEMPORARY_PASSWORD, 'new password');
    equal(world.staff.get(id)?.mustChangePassword, true, 'must change (set after the password)');
    equal(
      world.calls,
      ['caller.prepareChange', 'admin.setPassword', 'caller.requirePasswordChange'],
      'order',
    );
  }),

  test('reset: a refused check never calls Auth', async () => {
    const world = new FakeWorld().failNext('prepareChange', refused('cannot_manage_staff'));
    const id = world.addStaff('owner');
    await rejectsWith(
      resetPassword(world.deps, { action: 'reset_password', staffId: id }),
      'cannot_manage_staff',
    );
    equal(world.logins.get(id)?.password, 'their-own-password', 'unchanged');
  }),

  test('reset: an Auth failure is reported and nothing else changes', async () => {
    const world = new FakeWorld().failNext('setPassword', new AuthAdminError(null, 500, 'down'));
    const id = world.addStaff('reception');
    await rejectsWith(
      resetPassword(world.deps, { action: 'reset_password', staffId: id }),
      'auth_update_failed',
    );
    check(!world.calls.includes('caller.requirePasswordChange'), 'no flag change');
    checkLogsClean(world);
  }),

  test('reset: when must-change cannot be set, it says so (reset again) and logs no password', async () => {
    const world = new FakeWorld().failNext('requirePasswordChange', crash());
    const id = world.addStaff('reception');
    await rejectsWith(
      resetPassword(world.deps, { action: 'reset_password', staffId: id }),
      'must_change_not_set',
    );
    equal(
      world.logs.map((entry) => entry.event),
      ['must_change_not_set'],
      'logged',
    );
    checkLogsClean(world);
  }),
];

const deactivateCases: StaffAdminCase[] = [
  test('deactivate: the account first (ends data access), then the login is banned', async () => {
    const world = new FakeWorld();
    const id = world.addStaff('reception');
    equal(
      await deactivateStaff(world.deps, { action: 'deactivate', staffId: id }),
      { staffId: id },
      'result',
    );
    equal(world.staff.get(id)?.isActive, false, 'inactive');
    equal(world.logins.get(id)?.banned, true, 'banned');
    equal(world.calls, ['caller.prepareChange', 'caller.setActive', 'admin.setBanned'], 'order');
  }),

  test('deactivate: if the ban fails, the account stays deactivated (safe)', async () => {
    const world = new FakeWorld().failNext('setBanned', new AuthAdminError(null, 500, 'down'));
    const id = world.addStaff('reception');
    await rejectsWith(
      deactivateStaff(world.deps, { action: 'deactivate', staffId: id }),
      'auth_update_failed',
    );
    equal(world.staff.get(id)?.isActive, false, 'still inactive');
    equal(
      world.logs.map((entry) => entry.event),
      ['auth_update_failed'],
      'logged',
    );
  }),

  test('deactivate: repeating it after a failed ban finishes the job', async () => {
    const world = new FakeWorld().failNext('setBanned', new AuthAdminError(null, 500, 'down'));
    const id = world.addStaff('reception');
    await rejectsWith(
      deactivateStaff(world.deps, { action: 'deactivate', staffId: id }),
      'auth_update_failed',
    );
    await deactivateStaff(world.deps, { action: 'deactivate', staffId: id });
    equal(world.logins.get(id)?.banned, true, 'banned');
  }),

  test('deactivate: a refused check changes nothing', async () => {
    const world = new FakeWorld().failNext('prepareChange', refused('cannot_edit_own_account'));
    const id = world.addStaff('owner');
    await rejectsWith(
      deactivateStaff(world.deps, { action: 'deactivate', staffId: id }),
      'cannot_edit_own_account',
    );
    equal(world.staff.get(id)?.isActive, true, 'still active');
    equal(world.logins.get(id)?.banned, false, 'not banned');
  }),

  test('deactivate: a refused account change never bans the login', async () => {
    const world = new FakeWorld().failNext('setActive', refused('cannot_manage_staff'));
    const id = world.addStaff('reception');
    await rejectsWith(
      deactivateStaff(world.deps, { action: 'deactivate', staffId: id }),
      'cannot_manage_staff',
    );
    equal(world.logins.get(id)?.banned, false, 'not banned');
  }),
];

const reactivateCases: StaffAdminCase[] = [
  test('reactivate: unbans the login, then activates the account', async () => {
    const world = new FakeWorld();
    const id = world.addStaff('former', { isActive: false });
    await reactivateStaff(world.deps, { action: 'reactivate', staffId: id });
    equal(world.logins.get(id)?.banned, false, 'unbanned');
    equal(world.staff.get(id)?.isActive, true, 'active');
    equal(world.calls, ['caller.prepareChange', 'admin.setBanned', 'caller.setActive'], 'order');
  }),

  test('reactivate: an Auth failure leaves everything as it was', async () => {
    const world = new FakeWorld().failNext('setBanned', new AuthAdminError(null, 500, 'down'));
    const id = world.addStaff('former', { isActive: false });
    await rejectsWith(
      reactivateStaff(world.deps, { action: 'reactivate', staffId: id }),
      'auth_update_failed',
    );
    equal(world.staff.get(id)?.isActive, false, 'inactive');
    equal(world.logins.get(id)?.banned, true, 'banned');
  }),

  test('reactivate: a refused account change bans the login again', async () => {
    const world = new FakeWorld().failNext('setActive', refused('gym_read_only'));
    const id = world.addStaff('former', { isActive: false });
    await rejectsWith(
      reactivateStaff(world.deps, { action: 'reactivate', staffId: id }),
      'gym_read_only',
    );
    equal(world.logins.get(id)?.banned, true, 'banned again');
    equal(world.staff.get(id)?.isActive, false, 'inactive');
  }),

  test('reactivate: when banning again fails too, it is logged', async () => {
    const world = new FakeWorld().failNext('setActive', refused('gym_read_only'));
    const id = world.addStaff('former', { isActive: false });
    // The unban works; the ban that undoes it fails.
    let calls = 0;
    const deps = {
      ...world.deps,
      admin: {
        ...world.admin,
        setBanned: async (staffId: string, banned: boolean) => {
          calls += 1;
          if (calls === 2) throw new AuthAdminError(null, 500, 'down');
          await world.admin.setBanned(staffId, banned);
        },
      },
    };
    await rejectsWith(
      reactivateStaff(deps, { action: 'reactivate', staffId: id }),
      'gym_read_only',
    );
    equal(
      world.logs.map((entry) => entry.event),
      ['compensation_failed'],
      'logged',
    );
    equal(world.logs[0]?.cause?.message, 'gym_read_only', 'with the first failure');
  }),
];

const RENAMED_EMAIL = `desk.one@${GYM_CODE}.staff.gym-spa.invalid`;

const renameCases: StaffAdminCase[] = [
  test('rename: changes the login address, then the username', async () => {
    const world = new FakeWorld();
    const id = world.addStaff('reception');
    await renameStaff(world.deps, { action: 'rename', staffId: id, username: 'desk.one' });
    equal(world.logins.get(id)?.email, RENAMED_EMAIL, 'new address');
    equal(world.staff.get(id)?.username, 'desk.one', 'new username');
    equal(world.calls, ['caller.prepareChange', 'admin.setEmail', 'caller.setUsername'], 'order');
  }),

  test('rename: the same username changes nothing', async () => {
    const world = new FakeWorld();
    const id = world.addStaff('reception');
    await renameStaff(world.deps, { action: 'rename', staffId: id, username: 'reception' });
    equal(world.calls, ['caller.prepareChange'], 'only the check');
  }),

  test('rename: a refused username change gives the login its old address back', async () => {
    const world = new FakeWorld().failNext('setUsername', refused('cannot_manage_staff'));
    const id = world.addStaff('reception');
    await rejectsWith(
      renameStaff(world.deps, { action: 'rename', staffId: id, username: 'desk.one' }),
      'cannot_manage_staff',
    );
    equal(
      world.logins.get(id)?.email,
      `reception@${GYM_CODE}.staff.gym-spa.invalid`,
      'old address',
    );
    equal(world.staff.get(id)?.username, 'reception', 'old username');
  }),

  test('rename: when giving the old address back fails, it is logged', async () => {
    const world = new FakeWorld().failNext('setUsername', crash());
    const id = world.addStaff('reception');
    let calls = 0;
    const deps = {
      ...world.deps,
      admin: {
        ...world.admin,
        setEmail: async (staffId: string, email: string) => {
          calls += 1;
          if (calls === 2) throw new AuthAdminError(null, 500, 'down');
          await world.admin.setEmail(staffId, email);
        },
      },
    };
    await rejectsWith(
      renameStaff(deps, { action: 'rename', staffId: id, username: 'desk.one' }),
      'staff_update_failed',
    );
    equal(
      world.logs.map((entry) => entry.event),
      ['compensation_failed', 'unexpected_error'],
      'logged',
    );
    equal(world.logs[0]?.email, RENAMED_EMAIL, 'with the address the login kept');
  }),

  test('rename: a login left behind at the new address is deleted first', async () => {
    const world = new FakeWorld();
    const id = world.addStaff('reception');
    const orphan = world.addLogin(RENAMED_EMAIL, true);
    await renameStaff(world.deps, { action: 'rename', staffId: id, username: 'desk.one' });
    check(!world.logins.has(orphan), 'deleted');
    equal(world.staff.get(id)?.username, 'desk.one', 'renamed');
  }),

  test('rename: a new address held by a real login makes the username taken', async () => {
    const world = new FakeWorld();
    const id = world.addStaff('reception');
    const other = world.addStaff('desk.one');
    await rejectsWith(
      renameStaff(world.deps, { action: 'rename', staffId: id, username: 'desk.one' }),
      'username_taken',
    );
    check(world.logins.has(other), 'the other login is kept');
    equal(world.staff.get(id)?.username, 'reception', 'not renamed');
  }),

  test('rename: an Auth failure leaves everything as it was', async () => {
    const world = new FakeWorld().failNext('setEmail', new AuthAdminError(null, 500, 'down'));
    const id = world.addStaff('reception');
    await rejectsWith(
      renameStaff(world.deps, { action: 'rename', staffId: id, username: 'desk.one' }),
      'auth_update_failed',
    );
    equal(world.staff.get(id)?.username, 'reception', 'not renamed');
  }),
];

// The endpoint -------------------------------------------------------------------------------------

function handlerFor(
  world: FakeWorld,
  seen: string[] = [],
  verifyToken: TokenVerifier = acceptManagerToken,
) {
  return createStaffAdminHandler({
    verifyToken,
    admin: world.admin,
    callerFor: (token): CallerPort => {
      seen.push(token);
      return world.caller;
    },
    log: world.deps.log,
    temporaryPassword: world.deps.temporaryPassword,
  });
}

function post(body: unknown, token: string | null = 'manager-token'): Request {
  return new Request('http://localhost/functions/v1/staff-admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function answer(response: Response): Promise<unknown> {
  const body: unknown = await response.json();
  return body;
}

const handlerCases: StaffAdminCase[] = [
  test('endpoint: answers the CORS preflight', async () => {
    const response = await handlerFor(new FakeWorld())(
      new Request('http://localhost/', { method: 'OPTIONS' }),
    );
    equal(response.status, 204, 'status');
    equal(response.headers.get('Access-Control-Allow-Origin'), '*', 'origin');
    check(
      response.headers.get('Access-Control-Allow-Headers')?.includes('authorization') === true,
      'allows the Authorization header',
    );
  }),

  test('endpoint: only POST', async () => {
    const response = await handlerFor(new FakeWorld())(new Request('http://localhost/'));
    equal(response.status, 405, 'status');
    equal(await answer(response), { error: 'method_not_allowed' }, 'body');
  }),

  test('endpoint: no token, no access (and no database call)', async () => {
    const seen: string[] = [];
    const world = new FakeWorld();
    const response = await handlerFor(world, seen)(post(newStaff(), null));
    equal(response.status, 401, 'status');
    equal(await answer(response), { error: 'unauthorized' }, 'body');
    equal(seen.length, 0, 'no client for the request');
    equal(world.calls, [], 'no calls');
  }),

  test('endpoint: a body that is not JSON', async () => {
    const response = await handlerFor(new FakeWorld())(post('{nope'));
    equal(response.status, 400, 'status');
    equal(await answer(response), { error: 'invalid_request' }, 'body');
  }),

  test('endpoint: unknown actions and unknown fields are refused', async () => {
    const world = new FakeWorld();
    for (const body of [
      { action: 'delete', staffId: GYM_ID },
      { ...newStaff(), gymId: GYM_ID },
      { ...newStaff(), username: 'Ali Karim' },
      { action: 'reset_password', staffId: 'not-a-uuid' },
    ]) {
      const response = await handlerFor(world)(post(body));
      equal(response.status, 400, `status for ${JSON.stringify(body)}`);
    }
    equal(world.calls, [], 'nothing reached the ports');
  }),

  test('endpoint: creates with the bearer token and answers once, uncached', async () => {
    const seen: string[] = [];
    const world = new FakeWorld();
    const response = await handlerFor(world, seen)(post(newStaff()));
    equal(response.status, 200, 'status');
    equal(seen, ['manager-token'], "the manager's token");
    equal(response.headers.get('Cache-Control'), 'no-store', 'never cached');
    equal(response.headers.get('Access-Control-Allow-Origin'), '*', 'CORS');
    const body = await answer(response);
    check(typeof body === 'object' && body !== null, 'an object');
    equal((body as Record<string, unknown>).temporaryPassword, TEMPORARY_PASSWORD, 'password');
  }),

  test('endpoint: a refusal is its key and status', async () => {
    const world = new FakeWorld().failNext('prepareCreate', refused('permission_denied'));
    const response = await handlerFor(world)(post(newStaff()));
    equal(response.status, 403, 'status');
    equal(await answer(response), { error: 'permission_denied' }, 'body');
  }),

  test('endpoint: an invalid token is unauthorized', async () => {
    const world = new FakeWorld().failNext(
      'prepareChange',
      new DatabaseError('JWSError JWSInvalidSignature', 'PGRST301', 401),
    );
    const id = world.addStaff('reception');
    const response = await handlerFor(world)(post({ action: 'deactivate', staffId: id }));
    equal(response.status, 401, 'status');
  }),

  test('endpoint: a crash is unexpected, logged, and leaks nothing', async () => {
    const world = new FakeWorld();
    const handler = createStaffAdminHandler({
      verifyToken: acceptManagerToken,
      admin: world.admin,
      callerFor: () => {
        throw new Error('no database');
      },
      log: world.deps.log,
    });
    const response = await handler(post(newStaff()));
    equal(response.status, 500, 'status');
    equal(await answer(response), { error: 'unexpected' }, 'body');
    equal(
      world.logs.map((entry) => entry.event),
      ['unexpected_error'],
      'logged',
    );
  }),

  test('endpoint: all five actions work', async () => {
    const world = new FakeWorld();
    const handler = handlerFor(world);
    const created = await answer(await handler(post(newStaff())));
    const staffId = (created as { staffId: string }).staffId;
    for (const body of [
      { action: 'reset_password', staffId },
      { action: 'deactivate', staffId },
      { action: 'reactivate', staffId },
      { action: 'rename', staffId, username: 'desk.one' },
    ]) {
      const response = await handler(post(body));
      equal(response.status, 200, `status of ${body.action}`);
    }
    equal(world.staff.get(staffId)?.username, 'desk.one', 'renamed at the end');
    checkLogsClean(world);
  }),
];

// The token check, before anything else ------------------------------------------------------------

/** Sends a create with this token through the real verifier; nothing else may happen if refused. */
async function refusedBeforeAnything(token: string, verifyToken: TokenVerifier): Promise<void> {
  const seen: string[] = [];
  const world = new FakeWorld();
  const response = await handlerFor(world, seen, verifyToken)(post(newStaff(), token));
  equal(response.status, 401, 'status');
  equal(await answer(response), { error: 'unauthorized' }, 'body');
  equal(seen, [], 'no database client was made');
  equal(world.calls, [], 'no database or Auth call');
}

const tokenCases: StaffAdminCase[] = [
  test('token: a staff session signed with the project key goes on to the operation', async () => {
    const tokens = await testTokens();
    const token = await tokens.sign();
    const seen: string[] = [];
    const world = new FakeWorld();
    const response = await handlerFor(world, seen, tokens.verifier)(post(newStaff(), token));
    equal(response.status, 200, 'status');
    equal(seen, [token], 'the database calls go with the same token');
    equal(await tokens.verifier(token), { ok: true, userId: MANAGER_ID }, 'the check itself');
  }),

  test('token: a forged token (another key, same key id) is refused before any call', async () => {
    const tokens = await testTokens();
    await refusedBeforeAnything(await tokens.forge(), tokens.verifier);
  }),

  test('token: an expired token is refused before any call', async () => {
    const tokens = await testTokens();
    const past = Math.floor(Date.now() / 1000) - 60;
    const token = await tokens.sign({ iat: past - 3600, exp: past });
    equal(await tokens.verifier(token), { ok: false, reason: 'expired' }, 'the check itself');
    await refusedBeforeAnything(token, tokens.verifier);
  }),

  test('token: an anon token is refused before any call', async () => {
    const tokens = await testTokens();
    const token = await tokens.sign({ role: 'anon' });
    equal(await tokens.verifier(token), { ok: false, reason: 'not_staff' }, 'the check itself');
    await refusedBeforeAnything(token, tokens.verifier);
  }),

  test('token: a service_role token is refused (staff sessions only)', async () => {
    const tokens = await testTokens();
    await refusedBeforeAnything(await tokens.sign({ role: 'service_role' }), tokens.verifier);
  }),

  test('token: a symmetric (HS256) token is refused, whatever it claims', async () => {
    const tokens = await testTokens();
    await refusedBeforeAnything(await tokens.symmetric(), tokens.verifier);
  }),

  test('token: only the expected signature algorithms count', async () => {
    const { verifier, token } = await unexpectedAlgorithm();
    await refusedBeforeAnything(token, verifier);
  }),

  test('token: a token without an expiry is refused', async () => {
    const tokens = await testTokens();
    await refusedBeforeAnything(await tokens.sign({ exp: undefined }), tokens.verifier);
  }),

  test('token: an anonymous sign-in is refused', async () => {
    const tokens = await testTokens();
    await refusedBeforeAnything(await tokens.sign({ is_anonymous: true }), tokens.verifier);
  }),

  test('token: something that is not a token is refused', async () => {
    const tokens = await testTokens();
    await refusedBeforeAnything('not-a-token', tokens.verifier);
    await refusedBeforeAnything('a.b.c', tokens.verifier);
  }),

  test('token: a refused token is answered before the body is even read', async () => {
    const tokens = await testTokens();
    const world = new FakeWorld();
    const response = await handlerFor(
      world,
      [],
      tokens.verifier,
    )(post('{not json', await tokens.forge()));
    equal(response.status, 401, 'unauthorized, not invalid_request');
  }),

  test('token: when the project keys cannot be read, nothing goes ahead', async () => {
    const world = new FakeWorld();
    // Nothing listens on port 9: fetching the keys fails.
    const verifier = projectTokenVerifier('http://127.0.0.1:9');
    const tokens = await testTokens();
    const response = await handlerFor(world, [], verifier)(post(newStaff(), await tokens.sign()));
    equal(response.status, 500, 'status');
    equal(await answer(response), { error: 'unexpected' }, 'body');
    equal(world.calls, [], 'no calls');
    equal(
      world.logs.map((entry) => entry.action),
      ['verify_token'],
      'logged',
    );
  }),
];

// Small pure parts ---------------------------------------------------------------------------------

const partCases: StaffAdminCase[] = [
  test('temporary password: long enough, without look-alikes, letters and digits', async () => {
    await Promise.resolve();
    const seen = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const password = generateTemporaryPassword();
      equal(password.length, TEMPORARY_PASSWORD_LENGTH, 'length');
      check(password.length >= 12, 'at least 12 characters');
      check(/^[a-z2-9]+$/.test(password), 'lowercase letters and digits');
      check(!/[01oli]/.test(password), 'no look-alikes');
      check(/[a-z]/.test(password) && /[2-9]/.test(password), 'a letter and a digit');
      seen.add(password);
    }
    equal(seen.size, 200, 'never the same twice');
    check(!/[01ilo]/.test(TEMPORARY_PASSWORD_ALPHABET), 'alphabet has no look-alikes');
  }),

  test('temporary password: skips bytes that would make some characters likelier', async () => {
    await Promise.resolve();
    // 248..255 must be skipped (248 = 8 × 31); then 0 → "a", 30 → "9", 31 → "a" again.
    const bytes = [255, 248, 0, 30, 31, 33, 60, 61, 62, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const password = generateTemporaryPassword((buffer) => {
      buffer.fill(250);
      buffer.set(bytes.slice(0, buffer.length));
    });
    equal(password, 'a9ac89acdefghj', 'the first usable bytes in order');
  }),

  test('requests: a valid create and a strict schema', async () => {
    await Promise.resolve();
    check(staffAdminRequest.safeParse(newStaff()).success, 'valid');
    check(staffAdminRequest.safeParse(newStaff({ phone: null })).success, 'no phone');
    check(
      !staffAdminRequest.safeParse({ ...newStaff(), password: 'chosen-by-manager' }).success,
      'the manager never sends a password',
    );
    check(
      !staffAdminRequest.safeParse(newStaff({ fullName: ' عەلی' })).success,
      'no leading space',
    );
    check(!staffAdminRequest.safeParse(newStaff({ fullName: '' })).success, 'a name is required');
    check(!staffAdminRequest.safeParse(newStaff({ phone: '07x' })).success, 'phone pattern');
  }),

  test('config: Supabase gives the keys as JSON maps; the old single keys also work', async () => {
    await Promise.resolve();
    const env = (values: Record<string, string>) => (name: string) => values[name];
    equal(
      readStaffAdminConfig(
        env({
          SUPABASE_URL: 'http://kong:8000',
          SUPABASE_SECRET_KEYS: '{"default":"sb_secret_x"}',
          SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_y"}',
          SUPABASE_SERVICE_ROLE_KEY: 'legacy-secret',
          SUPABASE_ANON_KEY: 'legacy-anon',
        }),
      ),
      { url: 'http://kong:8000', secretKey: 'sb_secret_x', publishableKey: 'sb_publishable_y' },
      'new keys first',
    );
    equal(
      readStaffAdminConfig(
        env({
          SUPABASE_URL: 'http://kong:8000',
          SUPABASE_SECRET_KEYS: 'not json',
          SUPABASE_SERVICE_ROLE_KEY: 'legacy-secret',
          SUPABASE_ANON_KEY: 'legacy-anon',
        }),
      ),
      { url: 'http://kong:8000', secretKey: 'legacy-secret', publishableKey: 'legacy-anon' },
      'legacy keys',
    );
    equal(readStaffAdminConfig(env({ SUPABASE_URL: 'http://kong:8000' })), null, 'missing keys');
  }),
];

export const STAFF_ADMIN_CASES: readonly StaffAdminCase[] = [
  ...createCases,
  ...resetCases,
  ...deactivateCases,
  ...reactivateCases,
  ...renameCases,
  ...handlerCases,
  ...tokenCases,
  ...partCases,
];
