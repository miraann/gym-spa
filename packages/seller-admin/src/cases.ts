import {
  LicenseKeyError,
  generateLicenseKey,
  importLicenseSigningKey,
  keyRingOf,
  readLicenseCode,
  staffEmail,
  verifyActivationCode,
  verifyLicenseCode,
  type LicenseSigningKey,
} from '@gym/core';
import { AuthAdminError, DatabaseError, type TokenVerifier } from '@gym/staff-admin/server';
import { SellerAdminError, type SellerAdminErrorKey } from './errors.ts';
import { createSellerAdminHandler } from './handler.ts';
import {
  addAdmin,
  createGym,
  deactivateAdmin,
  issueActivation,
  issueLicense,
  reactivateAdmin,
  resetAdminPassword,
  resetAdminTwoStep,
  useRecoveryCode,
} from './operations.ts';
import type { SellerCallerPort } from './ports.ts';
import {
  createGymRequest,
  sellerAdminRequest,
  type CreateGymRequest,
  type IssueLicenseRequest,
} from './requests.ts';
import {
  ADMIN_ID,
  FakeSellerWorld,
  LICENSE_TODAY,
  MACHINE_CODE,
  NEW_GYM_ID,
  OFFLINE_GYM_ID,
  RECOVERY_CODE,
  TEMPORARY_PASSWORD,
  acceptAdminTokens,
} from './testing.ts';

// The seller module's unit tests, written once for both runtimes: Vitest runs them in Node
// (cases.test.ts) and Deno.test in Deno (supabase/functions/seller-admin/cases.test.ts), so the
// code the Edge Function runs is tested where it runs. Plain checks, no test library.

export interface SellerAdminCase {
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

async function rejectsWith(promise: Promise<unknown>, key: SellerAdminErrorKey): Promise<void> {
  try {
    await promise;
  } catch (error) {
    check(
      error instanceof SellerAdminError,
      `expected SellerAdminError ${key}, got ${String(error)}`,
    );
    equal(error.key, key, 'error key');
    return;
  }
  throw new CheckFailed(`expected ${key}, but it succeeded`);
}

/** No log entry may contain a password or a recovery code. */
function checkLogsClean(world: FakeSellerWorld): void {
  const logged = JSON.stringify(world.logs);
  check(!logged.includes(TEMPORARY_PASSWORD), 'a password was logged');
  check(!logged.includes(RECOVERY_CODE), 'a recovery code was logged');
}

function test(name: string, run: () => Promise<void>): SellerAdminCase {
  return { name: `seller-admin: ${name}`, run };
}

const OWNER_EMAIL = staffEmail('boss', 'new-gym');

function newGym(changes: Partial<CreateGymRequest> = {}): CreateGymRequest {
  return {
    action: 'create_gym',
    code: 'new-gym',
    nameCkb: 'جیمی نوێ',
    nameEn: 'New Gym',
    firstBranchName: 'لقی سەرەکی',
    paidUntil: '2026-12-31T21:00:00.000Z',
    owner: { username: 'boss', fullName: 'خاوەنی نوێ', phone: '0750 123 4567' },
    ...changes,
  };
}

// Creating a gym ----------------------------------------------------------------------------------

const createGymCases: SellerAdminCase[] = [
  test('create gym: the Owner login first, then the gym with its Owner in one call', async () => {
    const world = new FakeSellerWorld();
    const result = await createGym(world.deps, newGym());
    equal(
      world.calls,
      ['caller.prepareCreateGym', 'admin.createLogin', 'caller.createGym'],
      'the order of the steps',
    );
    const [ownerId, login] = world.loginByEmail(OWNER_EMAIL) ?? [];
    check(ownerId !== undefined && login !== undefined, 'the Owner has a login');
    equal(login.gymId, NEW_GYM_ID, 'the login says which gym it was made for');
    equal(login.password, TEMPORARY_PASSWORD, 'with the temporary password');
    equal(
      result,
      {
        gymId: NEW_GYM_ID,
        code: 'new-gym',
        ownerId,
        ownerUsername: 'boss',
        temporaryPassword: TEMPORARY_PASSWORD,
      },
      'the answer, with the temporary password once',
    );
    equal(world.gyms.get('new-gym')?.ownerPhone, '0750 123 4567', 'the gym and its Owner');
    equal(world.gyms.get('new-gym')?.paidUntil, '2026-12-31T21:00:00.000Z', 'its subscription end');
  }),

  test('create gym: a refused check (a reserved code) makes nothing at all', async () => {
    const world = new FakeSellerWorld();
    await rejectsWith(createGym(world.deps, newGym({ code: 'admin' })), 'reserved_gym_code');
    equal(world.calls, ['caller.prepareCreateGym'], 'no Auth call');
  }),

  test('create gym: when the gym rows fail, the Owner login is deleted again', async () => {
    const world = new FakeSellerWorld().failNext(
      'createGym',
      new DatabaseError('gym_code_taken', '23505', 409),
    );
    await rejectsWith(createGym(world.deps, newGym()), 'gym_code_taken');
    equal(world.loginByEmail(OWNER_EMAIL), undefined, 'no login left behind');
    equal(world.gyms.size, 0, 'no gym');
    equal(world.calls.at(-1), 'admin.deleteLogin', 'the undo');
  }),

  test('create gym: a unique violation from a race is "code taken"', async () => {
    const world = new FakeSellerWorld().failNext(
      'createGym',
      new DatabaseError(
        'duplicate key value violates unique constraint "gyms_code_key"',
        '23505',
        409,
      ),
    );
    await rejectsWith(createGym(world.deps, newGym()), 'gym_code_taken');
  }),

  test('create gym: when the undo fails too, it says so and logs it without the password', async () => {
    const world = new FakeSellerWorld()
      .failNext('createGym', new DatabaseError('connection lost', null, 503))
      .failNext('deleteLogin', new AuthAdminError('unexpected_failure', 500, 'Auth is down'));
    await rejectsWith(createGym(world.deps, newGym()), 'gym_create_failed');
    equal(
      world.logs.map((entry) => entry.event),
      ['compensation_failed'],
      'logged for an operator',
    );
    equal(world.logs[0]?.gymId, NEW_GYM_ID, 'with the gym id');
    checkLogsClean(world);
  }),

  test('create gym: an unexpected database error is logged and nothing is left', async () => {
    const world = new FakeSellerWorld().failNext(
      'createGym',
      new DatabaseError('something odd', 'XX000', 500),
    );
    await rejectsWith(createGym(world.deps, newGym()), 'gym_create_failed');
    equal(world.loginByEmail(OWNER_EMAIL), undefined, 'the login was deleted');
    equal(
      world.logs.map((entry) => entry.event),
      ['unexpected_error'],
      'logged',
    );
    checkLogsClean(world);
  }),

  test('create gym: an Owner login left behind by a gym never made is freed first', async () => {
    const world = new FakeSellerWorld();
    const old = world.addLogin(OWNER_EMAIL, {
      gymId: 'e0000000-0000-4000-8000-0000000000ee',
      leftBehind: true,
    });
    await createGym(world.deps, newGym());
    check(!world.logins.has(old), 'the old login is gone');
    check(world.gyms.has('new-gym'), 'the gym was made');
    equal(
      world.logs.map((entry) => entry.event),
      ['orphan_login_deleted'],
      'logged',
    );
    equal(world.logs[0]?.userId, old, 'which login');
  }),

  test('create gym: an address the database won\'t free is "code taken", and nothing changes', async () => {
    const world = new FakeSellerWorld();
    const holder = world.addLogin(OWNER_EMAIL, { leftBehind: false });
    await rejectsWith(createGym(world.deps, newGym()), 'gym_code_taken');
    check(world.logins.has(holder), 'the holder is untouched');
    equal(world.gyms.size, 0, 'no gym');
  }),

  test('create gym: a session that is no platform admin is refused before Auth', async () => {
    const world = new FakeSellerWorld().failNext(
      'prepareCreateGym',
      new DatabaseError('not_platform_admin', '42501', 403),
    );
    await rejectsWith(createGym(world.deps, newGym()), 'not_platform_admin');
    equal(world.calls, ['caller.prepareCreateGym'], 'no Auth call');
  }),
];

// Platform admins ---------------------------------------------------------------------------------

const adminCases: SellerAdminCase[] = [
  test('add admin: a platform admin login, then the account; temporary password once', async () => {
    const world = new FakeSellerWorld();
    const result = await addAdmin(world.deps, {
      action: 'add_admin',
      email: 'sara@clickgroup.example',
      fullName: 'سارا',
    });
    const [id, login] = world.loginByEmail('sara@clickgroup.example') ?? [];
    check(id !== undefined && login !== undefined, 'the login exists');
    check(login.platformAdmin, 'marked as made for a platform admin');
    equal(world.admins.get(id)?.mustChangePassword, true, 'they choose their own password');
    equal(
      result,
      { userId: id, email: 'sara@clickgroup.example', temporaryPassword: TEMPORARY_PASSWORD },
      'answer',
    );
    equal(
      world.calls,
      ['caller.prepareAddAdmin', 'admin.createAdminLogin', 'caller.addAdmin'],
      'the order of the steps',
    );
  }),

  test('add admin: when the account fails, the login is deleted again', async () => {
    const world = new FakeSellerWorld().failNext(
      'addAdmin',
      new DatabaseError('invalid_request', '22023', 400),
    );
    await rejectsWith(
      addAdmin(world.deps, {
        action: 'add_admin',
        email: 'sara@clickgroup.example',
        fullName: 'سارا',
      }),
      'invalid_request',
    );
    equal(world.loginByEmail('sara@clickgroup.example'), undefined, 'no login left behind');
  }),

  test('add admin: a login left behind by an add is freed; any other is "email taken"', async () => {
    const world = new FakeSellerWorld();
    world.addLogin('lost@clickgroup.example', { platformAdmin: true, leftBehind: true });
    await addAdmin(world.deps, {
      action: 'add_admin',
      email: 'lost@clickgroup.example',
      fullName: 'نوێ',
    });
    equal(
      world.logs.map((entry) => entry.event),
      ['orphan_login_deleted'],
      'freed and logged',
    );

    const other = new FakeSellerWorld();
    other.addLogin('someone@clickgroup.example', { platformAdmin: false, leftBehind: true });
    await rejectsWith(
      addAdmin(other.deps, {
        action: 'add_admin',
        email: 'someone@clickgroup.example',
        fullName: 'نوێ',
      }),
      'email_taken',
    );
  }),

  test('deactivate admin: the account first, then the ban', async () => {
    const world = new FakeSellerWorld();
    const sara = world.addAdmin('sara@clickgroup.example');
    await deactivateAdmin(world.deps, { action: 'deactivate_admin', userId: sara });
    equal(world.calls, ['caller.setAdminActive', 'admin.setBanned'], 'the order');
    equal(world.admins.get(sara)?.isActive, false, 'inactive');
    equal(world.logins.get(sara)?.banned, true, 'banned');
  }),

  test('deactivate admin: a failed ban leaves the account deactivated; doing it again finishes', async () => {
    const world = new FakeSellerWorld().failNext(
      'setBanned',
      new AuthAdminError('unexpected_failure', 500, 'Auth is down'),
    );
    const sara = world.addAdmin('sara@clickgroup.example');
    await rejectsWith(
      deactivateAdmin(world.deps, { action: 'deactivate_admin', userId: sara }),
      'auth_update_failed',
    );
    equal(world.admins.get(sara)?.isActive, false, 'access already ended');
    await deactivateAdmin(world.deps, { action: 'deactivate_admin', userId: sara });
    equal(world.logins.get(sara)?.banned, true, 'banned the second time');
  }),

  test('deactivate admin: nobody deactivates themself, and Auth is never asked', async () => {
    const world = new FakeSellerWorld();
    await rejectsWith(
      deactivateAdmin(world.deps, { action: 'deactivate_admin', userId: ADMIN_ID }),
      'cannot_change_own_admin',
    );
    equal(world.calls, ['caller.setAdminActive'], 'no Auth call');
  }),

  test('reactivate admin: unban, then the account; a failed account change bans again', async () => {
    const world = new FakeSellerWorld();
    const sara = world.addAdmin('sara@clickgroup.example', { isActive: false });
    await reactivateAdmin(world.deps, { action: 'reactivate_admin', userId: sara });
    equal(world.admins.get(sara)?.isActive, true, 'active');
    equal(world.logins.get(sara)?.banned, false, 'unbanned');

    const failing = new FakeSellerWorld().failNext(
      'setAdminActive',
      new DatabaseError('last_platform_admin', '42501', 403),
    );
    const omar = failing.addAdmin('omar@clickgroup.example', { isActive: false });
    await rejectsWith(
      reactivateAdmin(failing.deps, { action: 'reactivate_admin', userId: omar }),
      'last_platform_admin',
    );
    equal(failing.logins.get(omar)?.banned, true, 'banned again');
  }),

  test('reset two-step: removes the device, then records it (which voids the codes)', async () => {
    const world = new FakeSellerWorld();
    const sara = world.addAdmin('sara@clickgroup.example');
    await resetAdminTwoStep(world.deps, { action: 'reset_admin_two_step', userId: sara });
    equal(world.logins.get(sara)?.twoStep, 0, 'no two-step device');
    equal(
      world.calls,
      ['caller.prepareAdminChange', 'admin.removeTwoStep', 'caller.recordAdminChange'],
      'the order',
    );
    equal(world.records, [`admin_two_step_reset ${sara}`], 'recorded');
  }),

  test('reset two-step: a failed record is reported and logged; doing it again finishes', async () => {
    const world = new FakeSellerWorld().failNext(
      'recordAdminChange',
      new DatabaseError('connection lost', null, 503),
    );
    const sara = world.addAdmin('sara@clickgroup.example');
    await rejectsWith(
      resetAdminTwoStep(world.deps, { action: 'reset_admin_two_step', userId: sara }),
      'record_failed',
    );
    equal(
      world.logs.map((entry) => entry.event),
      ['record_failed'],
      'logged',
    );
    await resetAdminTwoStep(world.deps, { action: 'reset_admin_two_step', userId: sara });
    equal(world.records, [`admin_two_step_reset ${sara}`], 'recorded the second time');
  }),

  test('reset two-step: never your own (the database refuses before Auth)', async () => {
    const world = new FakeSellerWorld();
    await rejectsWith(
      resetAdminTwoStep(world.deps, { action: 'reset_admin_two_step', userId: ADMIN_ID }),
      'cannot_change_own_admin',
    );
    equal(world.logins.get(ADMIN_ID)?.twoStep, 1, 'still has the device');
  }),

  test('reset password: a temporary password once, and they must choose their own', async () => {
    const world = new FakeSellerWorld();
    const sara = world.addAdmin('sara@clickgroup.example');
    const result = await resetAdminPassword(world.deps, {
      action: 'reset_admin_password',
      userId: sara,
    });
    equal(result, { userId: sara, temporaryPassword: TEMPORARY_PASSWORD }, 'answer');
    equal(world.logins.get(sara)?.password, TEMPORARY_PASSWORD, 'the new password');
    equal(world.admins.get(sara)?.mustChangePassword, true, 'must change it again');
  }),

  test('reset password: when the record fails, it says so and logs no password', async () => {
    const world = new FakeSellerWorld().failNext(
      'recordAdminChange',
      new DatabaseError('connection lost', null, 503),
    );
    const sara = world.addAdmin('sara@clickgroup.example');
    await rejectsWith(
      resetAdminPassword(world.deps, { action: 'reset_admin_password', userId: sara }),
      'record_failed',
    );
    checkLogsClean(world);
  }),
];

// Recovery codes ----------------------------------------------------------------------------------

const recoveryCases: SellerAdminCase[] = [
  test("recovery code: a right one removes the signed-in admin's own lost device", async () => {
    const world = new FakeSellerWorld();
    const sara = world.addAdmin('sara@clickgroup.example');
    const result = await useRecoveryCode(world.deps, {
      action: 'use_recovery_code',
      code: RECOVERY_CODE,
    });
    equal(result, { result: 'ok' }, 'answer');
    equal(world.logins.get(ADMIN_ID)?.twoStep, 0, 'their device is gone');
    equal(world.logins.get(sara)?.twoStep, 1, "nobody else's");
  }),

  test('recovery code: a wrong one changes nothing in Auth', async () => {
    const world = new FakeSellerWorld();
    await rejectsWith(
      useRecoveryCode(world.deps, { action: 'use_recovery_code', code: 'aaaa-bbbb-cccc-dddd' }),
      'wrong_code',
    );
    equal(world.calls, ['caller.useRecoveryCode'], 'no Auth call');
    equal(world.logins.get(ADMIN_ID)?.twoStep, 1, 'still has the device');
  }),

  test('recovery code: after too many wrong ones, even the right one is refused', async () => {
    const world = new FakeSellerWorld();
    world.wrongCodeAnswer = 'too_many_attempts';
    await rejectsWith(
      useRecoveryCode(world.deps, { action: 'use_recovery_code', code: RECOVERY_CODE }),
      'too_many_attempts',
    );
    equal(world.logins.get(ADMIN_ID)?.twoStep, 1, 'still has the device');
  }),

  test('recovery code: if Auth fails after the code was used, it says so and logs no code', async () => {
    const world = new FakeSellerWorld().failNext(
      'removeTwoStep',
      new AuthAdminError('unexpected_failure', 500, 'Auth is down'),
    );
    await rejectsWith(
      useRecoveryCode(world.deps, { action: 'use_recovery_code', code: RECOVERY_CODE }),
      'auth_update_failed',
    );
    equal(
      world.logs.map((entry) => entry.event),
      ['auth_update_failed'],
      'logged',
    );
    checkLogsClean(world);
  }),
];

// The endpoint --------------------------------------------------------------------------------------

interface Answer {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly headers: Headers;
}

function handlerFor(
  world: FakeSellerWorld,
  seen: string[],
  verifyToken: TokenVerifier = acceptAdminTokens,
) {
  return createSellerAdminHandler({
    admin: world.admin,
    verifyToken,
    callerFor: (token): SellerCallerPort => {
      seen.push(token);
      return world.caller;
    },
    log: world.deps.log,
    temporaryPassword: world.deps.temporaryPassword,
    newId: world.deps.newId,
  });
}

function post(body: unknown, token: string | null): Request {
  return new Request('http://localhost/functions/v1/seller-admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function answer(response: Response): Promise<Answer> {
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
    headers: response.headers,
  };
}

function newLicense(changes: Partial<IssueLicenseRequest> = {}): IssueLicenseRequest {
  return {
    action: 'issue_license',
    gymId: OFFLINE_GYM_ID,
    type: 'yearly',
    maxBranches: 2,
    maxDevices: null,
    validUntil: '2027-10-29',
    ...changes,
  };
}

const ACTIVATE = {
  action: 'issue_activation',
  gymId: OFFLINE_GYM_ID,
  machineCode: MACHINE_CODE,
} as const;

/** A throwaway key, and its private JWK text (to check it never reaches a log). */
async function testKey(): Promise<{ key: LicenseSigningKey; privateJwk: string }> {
  const { privateJwk } = await generateLicenseKey('test-cases');
  return { key: await importLicenseSigningKey(privateJwk), privateJwk };
}

/** The world's dependencies with this key; `loads` counts how often it is loaded. */
function withKey(world: FakeSellerWorld, key: LicenseSigningKey, loads: string[] = []) {
  return {
    ...world.deps,
    licenseKey: () => {
      loads.push('key');
      return Promise.resolve(key);
    },
  };
}

/** Fresh ids for an operation that makes several things. */
function countingIds(): () => string {
  let next = 0;
  return () => `e0000000-0000-4000-8000-0000000001${String((next += 1)).padStart(2, '0')}`;
}

const licenseCases: SellerAdminCase[] = [
  test('license: checked, signed, checked again and stored before it is answered', async () => {
    const world = new FakeSellerWorld();
    const { key } = await testKey();
    const result = await issueLicense(withKey(world, key), newLicense());
    equal(result.licenseId, NEW_GYM_ID, 'the new license id');
    const checked = await verifyLicenseCode(result.code, keyRingOf(key));
    equal(
      checked.ok ? checked.value : checked.problem,
      {
        licenseId: NEW_GYM_ID,
        kid: 'test-cases',
        gymId: OFFLINE_GYM_ID,
        gymCode: 'hawler-off',
        gymName: 'جیمی هەولێر',
        type: 'yearly',
        maxBranches: 2,
        maxDevices: null,
        features: [],
        issuedOn: LICENSE_TODAY,
        expiresOn: '2027-10-29',
        updatesUntil: null,
      },
      'the code verifies and carries the gym as the database answered it',
    );
    equal(world.calls, ['caller.prepareLicense', 'caller.issueLicense'], 'calls');
    equal(world.licenses.get(NEW_GYM_ID)?.code, result.code, 'stored as answered');
    equal(world.records, [`license_issued ${NEW_GYM_ID}`], 'logged');
  }),

  test('license: a perpetual one carries its updates date', async () => {
    const world = new FakeSellerWorld();
    const result = await issueLicense(
      withKey(world, (await testKey()).key),
      newLicense({ type: 'perpetual', validUntil: '2028-10-29', maxBranches: null }),
    );
    const license = readLicenseCode(result.code);
    equal(
      [license?.type, license?.expiresOn, license?.updatesUntil, license?.maxBranches],
      ['perpetual', null, '2028-10-29', null],
      'perpetual',
    );
  }),

  test('license: the database refuses before the key is ever loaded', async () => {
    const refused: [IssueLicenseRequest, SellerAdminErrorKey][] = [
      [newLicense({ gymId: NEW_GYM_ID }), 'gym_not_found'],
      [newLicense({ validUntil: '2030-01-01' }), 'invalid_license_date'],
      [newLicense({ validUntil: LICENSE_TODAY }), 'invalid_license_date'],
    ];
    const { key } = await testKey();
    for (const [request, expected] of refused) {
      const world = new FakeSellerWorld();
      const loads: string[] = [];
      await rejectsWith(issueLicense(withKey(world, key, loads), request), expected);
      equal([loads, world.calls], [[], ['caller.prepareLicense']], `${expected}: no signing`);
    }
  }),

  test('license: without a signing key nothing is issued, and the rest still works', async () => {
    const world = new FakeSellerWorld();
    await rejectsWith(issueLicense(world.deps, newLicense()), 'license_key_missing');
    equal(world.licenses.size, 0, 'nothing stored');
    await createGym(world.deps, newGym());
    check(world.gyms.has('new-gym'), 'creating a gym still works');
  }),

  test('license: a key that can not be used is logged with its reason, never the key', async () => {
    const world = new FakeSellerWorld();
    const { privateJwk } = await testKey();
    const deps = {
      ...world.deps,
      licenseKey: () => Promise.reject(new LicenseKeyError('not_shipped')),
    };
    await rejectsWith(issueLicense(deps, newLicense()), 'license_key_missing');
    equal(
      world.logs.map((entry) => [entry.event, entry.keyProblem]),
      [['license_key_unusable', 'not_shipped']],
      'logged with its reason',
    );
    const { d } = JSON.parse(privateJwk) as { d: string };
    check(!JSON.stringify(world.logs).includes(d), 'no part of a key is logged');
  }),

  test('license: a code the database does not store is never answered', async () => {
    const world = new FakeSellerWorld().failNext(
      'issueLicense',
      new DatabaseError('license_code_mismatch', '22023', 400),
    );
    await rejectsWith(
      issueLicense(withKey(world, (await testKey()).key), newLicense()),
      'unexpected',
    );
    equal(world.licenses.size, 0, 'nothing stored');
    equal(
      world.logs.map((entry) => entry.event),
      ['unexpected_error'],
      'logged for an operator',
    );
  }),
];

const activationCases: SellerAdminCase[] = [
  test('activation: the machine code as read (lowercase, O for 0) is signed normalized', async () => {
    const world = new FakeSellerWorld();
    const { key } = await testKey();
    const deps = { ...withKey(world, key), newId: countingIds() };
    await issueLicense(deps, newLicense());
    const result = await issueActivation(deps, {
      ...ACTIVATE,
      machineCode: 'ov5q-1bd4-ts11-n9tc-94o2',
    });
    const checked = await verifyActivationCode(result.code, keyRingOf(key));
    equal(
      checked.ok
        ? [checked.value.gymId, checked.value.machineCode, checked.value.issuedOn]
        : checked.problem,
      [OFFLINE_GYM_ID, MACHINE_CODE, LICENSE_TODAY],
      'the activation names the gym and the PC',
    );
    equal(world.activations.get(result.activationId)?.code, result.code, 'stored');
  }),

  test('activation: a mistyped machine code is refused before anything is called', async () => {
    const world = new FakeSellerWorld();
    await rejectsWith(
      issueActivation(withKey(world, (await testKey()).key), {
        ...ACTIVATE,
        machineCode: '0V5Q-1BD4-TS11-N9TC-9403',
      }),
      'invalid_machine_code',
    );
    equal(world.calls, [], 'nothing called');
  }),

  test('activation: no license yet, or a PC already active, is refused before signing', async () => {
    const world = new FakeSellerWorld();
    const { key } = await testKey();
    const loads: string[] = [];
    await rejectsWith(issueActivation(withKey(world, key, loads), ACTIVATE), 'no_license');
    equal(loads, [], 'the key is not loaded');
    const deps = { ...withKey(world, key), newId: countingIds() };
    await issueLicense(deps, newLicense());
    await issueActivation(deps, ACTIVATE);
    await rejectsWith(issueActivation(deps, ACTIVATE), 'already_activated');
    equal(world.activations.size, 1, 'one server PC');
  }),
];

const EVERY_ACTION = [
  newGym(),
  { action: 'add_admin', email: 'sara@clickgroup.example', fullName: 'سارا' },
  { action: 'deactivate_admin', userId: 'e0000000-0000-4000-8000-0000000000b2' },
  { action: 'reactivate_admin', userId: 'e0000000-0000-4000-8000-0000000000b2' },
  { action: 'reset_admin_two_step', userId: 'e0000000-0000-4000-8000-0000000000b2' },
  { action: 'reset_admin_password', userId: 'e0000000-0000-4000-8000-0000000000b2' },
  { action: 'use_recovery_code', code: RECOVERY_CODE },
  newLicense(),
  ACTIVATE,
];

const handlerCases: SellerAdminCase[] = [
  test('endpoint: a two-step session creates a gym; the answer is never cached', async () => {
    const world = new FakeSellerWorld();
    const seen: string[] = [];
    const response = await answer(await handlerFor(world, seen)(post(newGym(), 'aal2-token')));
    equal(response.status, 200, 'status');
    equal(response.body.temporaryPassword, TEMPORARY_PASSWORD, 'the password, once');
    equal(response.headers.get('Cache-Control'), 'no-store', 'not cached');
    equal(seen, ['aal2-token'], 'the database calls go with the same token');
  }),

  test('endpoint: no token, or one that fails the check, is 401 before anything', async () => {
    for (const token of [null, 'forged-token']) {
      const world = new FakeSellerWorld();
      const seen: string[] = [];
      const response = await answer(await handlerFor(world, seen)(post(newGym(), token)));
      equal(
        [response.status, response.body.error],
        [401, 'unauthorized'],
        `token ${String(token)}`,
      );
      equal([seen, world.calls], [[], []], 'no database or Auth call');
    }
  }),

  test('endpoint: before the second login step, every action but the recovery code is refused', async () => {
    for (const body of EVERY_ACTION) {
      const world = new FakeSellerWorld();
      const seen: string[] = [];
      const response = await answer(await handlerFor(world, seen)(post(body, 'aal1-token')));
      if (body.action === 'use_recovery_code') {
        equal(response.status, 200, 'a recovery code works after the password alone');
      } else {
        equal([response.status, response.body.error], [403, 'mfa_required'], body.action);
        equal([seen, world.calls], [[], []], `${body.action}: no database or Auth call`);
      }
    }
  }),

  test("endpoint: a request it doesn't know is invalid_request", async () => {
    for (const body of [
      'not json',
      { action: 'delete_gym', gymId: NEW_GYM_ID },
      { ...newGym(), extra: true },
      newGym({ code: 'New Gym' }),
      newGym({ paidUntil: '2026-12-31' }),
      { action: 'add_admin', email: 'Sara@ClickGroup.example', fullName: 'سارا' },
      { action: 'add_admin', email: 'boss@demo.staff.gym-spa.invalid', fullName: 'سارا' },
      newLicense({ validUntil: '29/10/2027' }),
      newLicense({ maxBranches: 0 }),
      { ...newLicense(), type: 'monthly' },
      { ...newLicense(), features: ['spa'] },
      { ...ACTIVATE, machineCode: '' },
    ]) {
      const world = new FakeSellerWorld();
      const response = await answer(await handlerFor(world, [])(post(body, 'aal2-token')));
      equal([response.status, response.body.error], [400, 'invalid_request'], JSON.stringify(body));
      equal(world.calls, [], 'nothing called');
    }
  }),

  test('endpoint: a browser may call it (CORS), only with POST', async () => {
    const serve = handlerFor(new FakeSellerWorld(), []);
    const preflight = await serve(new Request('http://localhost/', { method: 'OPTIONS' }));
    equal(preflight.status, 204, 'preflight');
    check(
      preflight.headers.get('Access-Control-Allow-Origin') === '*',
      'any origin (bearer tokens)',
    );
    const get = await answer(await serve(new Request('http://localhost/', { method: 'GET' })));
    equal([get.status, get.body.error], [405, 'method_not_allowed'], 'GET');
  }),

  test("endpoint: when the project's keys can't be read, nothing goes ahead", async () => {
    const world = new FakeSellerWorld();
    const unavailable: TokenVerifier = () => Promise.reject(new Error('network down'));
    const response = await answer(
      await handlerFor(world, [], unavailable)(post(newGym(), 'aal2-token')),
    );
    equal([response.status, response.body.error], [500, 'unexpected'], 'answer');
    equal(
      world.logs.map((entry) => entry.event),
      ['unexpected_error'],
      'logged',
    );
    equal(world.calls, [], 'nothing called');
  }),

  test('endpoint: errors are stable keys, never details', async () => {
    const world = new FakeSellerWorld().failNext(
      'prepareCreateGym',
      new DatabaseError('mfa_required', '42501', 403),
    );
    const response = await answer(await handlerFor(world, [])(post(newGym(), 'aal2-token')));
    equal(response.body, { error: 'mfa_required' }, 'only the key');
  }),
];

const requestCases: SellerAdminCase[] = [
  test("requests: a gym's subscription end is a time with its offset, or null on purpose", () => {
    check(createGymRequest.safeParse(newGym({ paidUntil: null })).success, 'no end');
    check(
      createGymRequest.safeParse(newGym({ paidUntil: '2026-12-31T23:59:59+03:00' })).success,
      'Baghdad time',
    );
    check(
      !sellerAdminRequest.safeParse({ ...newGym(), paidUntil: undefined }).success,
      'must be given',
    );
    return Promise.resolve();
  }),
];

export const SELLER_ADMIN_CASES: readonly SellerAdminCase[] = [
  ...createGymCases,
  ...adminCases,
  ...recoveryCases,
  ...licenseCases,
  ...activationCases,
  ...handlerCases,
  ...requestCases,
];
