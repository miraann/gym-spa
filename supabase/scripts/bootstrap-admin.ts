// Creates the first Owner (خاوەن) of a gym. Everyone else is added from the app.
// A gym that doesn't exist yet is created first, with its built-in roles and its first branch (B1),
// so the Owner can log in. Until the seller panel exists (step MT-3), this is how gyms are made.
//
//   pnpm bootstrap:admin --gym demo            local Supabase (start it first with `pnpm db:start`)
//   pnpm bootstrap:admin --gym demo --remote   the project in supabase/.env.local
//
// Asks for what isn't given: the gym code; for a new gym its Kurdish name and the first branch's
// name; the username, full name and password. For automation, pass --gym, --gym-name,
// --branch-name, --username and --full-name, and the password in BOOTSTRAP_ADMIN_PASSWORD.
import { createInterface, type Interface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import {
  OWNER_ROLE,
  isReservedGymCode,
  isValidGymCode,
  isValidUsername,
  normalizeGymCode,
  normalizeUsername,
  staffEmail,
} from '@gym/core';
import type { Database } from '@gym/db';
import type { SupabaseClient } from '@supabase/supabase-js';
import { connect, fail, readHidden, run } from './script-support';

const MIN_PASSWORD_LENGTH = 8;
/** The first branch's code; it is printed in receipt numbers and never changes. */
const FIRST_BRANCH_CODE = 'B1';
/** "Main branch"; renamed later in the app. */
const DEFAULT_BRANCH_NAME = 'لقی سەرەکی';

const { values: args } = parseArgs({
  options: {
    remote: { type: 'boolean', default: false },
    gym: { type: 'string' },
    'gym-name': { type: 'string' },
    'branch-name': { type: 'string' },
    username: { type: 'string' },
    'full-name': { type: 'string' },
  },
});

function checkName(name: string, what: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 100) fail(`${what} must be 1-100 characters.`);
  return trimmed;
}

async function askGymCode(prompt: Interface): Promise<string> {
  const code = normalizeGymCode(args.gym ?? (await prompt.question('Gym code: ')));
  if (isReservedGymCode(code)) fail(`"${code}" is reserved and can't be a gym code.`);
  if (!isValidGymCode(code)) {
    fail(
      'A gym code is 3-20 characters: a-z first, then a-z or 0-9, with single "-" between them.',
    );
  }
  return code;
}

interface NewGym {
  readonly name: string;
  readonly branchName: string;
}

/** The details of a gym that doesn't exist yet; null when the user doesn't want it created. */
async function askNewGym(prompt: Interface, code: string): Promise<NewGym | null> {
  if (args['gym-name'] === undefined) {
    console.log(
      `\nThere is no gym "${code}" yet. A gym code can never change later: it is part of every staff login.`,
    );
    const answer = await prompt.question(`Create the gym "${code}"? (y/N) `);
    if (answer.trim().toLowerCase() !== 'y') return null;
  }
  const name = checkName(
    args['gym-name'] ?? (await prompt.question("The gym's name in Kurdish: ")),
    "The gym's name",
  );
  const branchAnswer =
    args['branch-name'] ??
    (await prompt.question(`First branch name in Kurdish (Enter for "${DEFAULT_BRANCH_NAME}"): `));
  const branchName = checkName(branchAnswer.trim() || DEFAULT_BRANCH_NAME, 'The branch name');
  return { name, branchName };
}

async function askPassword(): Promise<string> {
  let password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (password === undefined) {
    password = await readHidden(
      `Password (at least ${MIN_PASSWORD_LENGTH} characters): `,
      'BOOTSTRAP_ADMIN_PASSWORD',
    );
    if ((await readHidden('Password again: ', 'BOOTSTRAP_ADMIN_PASSWORD')) !== password) {
      fail('The passwords do not match.');
    }
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  return password;
}

/** The id of the gym's own Owner role (every gym has its own copy of the built-in roles). */
async function ownerRoleId(supabase: SupabaseClient<Database>, gymId: string): Promise<string> {
  const { data, error } = await supabase
    .from('roles')
    .select('id')
    .eq('gym_id', gymId)
    .eq('key', OWNER_ROLE)
    .single();
  if (error) fail(`Could not find the gym's Owner role: ${error.message}`);
  return data.id;
}

async function main() {
  const supabase = connect(args.remote);
  const prompt = createInterface({ input: process.stdin, output: process.stdout });

  let gymCode: string;
  let gymId: string | null;
  let newGym: NewGym | null = null;
  let username: string;
  let fullName: string;
  try {
    gymCode = await askGymCode(prompt);
    const { data: gym, error: gymError } = await supabase
      .from('gyms')
      .select('id')
      .eq('code', gymCode)
      .maybeSingle();
    if (gymError)
      fail(`Could not read the gyms (are the migrations applied?): ${gymError.message}`);
    gymId = gym?.id ?? null;

    if (gymId === null) {
      newGym = await askNewGym(prompt, gymCode);
      if (newGym === null) fail('Nothing was created.');
    } else {
      const { count, error: countError } = await supabase
        .from('staff_users')
        .select('id', { count: 'exact', head: true })
        .eq('role_id', await ownerRoleId(supabase, gymId))
        .eq('is_active', true)
        .is('deleted_at', null);
      if (countError) fail(`Could not read the staff accounts: ${countError.message}`);
      if (count !== 0)
        fail(`The gym "${gymCode}" already has an Owner. Add other staff from the app.`);
    }

    username = normalizeUsername(args.username ?? (await prompt.question('Username: ')));
    if (!isValidUsername(username)) {
      fail('A username is 3-32 characters: a-z first, then a-z, 0-9, ".", "_" or "-".');
    }
    fullName = checkName(
      args['full-name'] ?? (await prompt.question('Full name: ')),
      'The full name',
    );
  } finally {
    prompt.close();
  }
  const password = await askPassword();

  if (newGym !== null) {
    const { data: created, error: createError } = await supabase.rpc('create_gym', {
      p_code: gymCode,
      p_name_ckb: newGym.name,
      p_first_branch_name: newGym.branchName,
    });
    if (createError) fail(`Could not create the gym: ${createError.message}`);
    gymId = created.id;
    console.log(
      `✔ Gym "${gymCode}" created, with branch ${FIRST_BRANCH_CODE} "${newGym.branchName}".`,
    );
  }
  if (gymId === null) fail('The gym is missing.');

  // A gym without a branch (none should exist, but the Owner couldn't log in): B1 first. The new
  // Owner (all branches) gets access to it as soon as they are created.
  const { count: branchCount, error: branchCountError } = await supabase
    .from('branches')
    .select('id', { count: 'exact', head: true })
    .eq('gym_id', gymId);
  if (branchCountError) fail(`Could not read the branches: ${branchCountError.message}`);
  if (branchCount === 0) {
    const { error: branchError } = await supabase
      .from('branches')
      .insert({ gym_id: gymId, code: FIRST_BRANCH_CODE, name_ckb: DEFAULT_BRANCH_NAME });
    if (branchError) fail(`Could not create the first branch: ${branchError.message}`);
    console.log(`✔ Branch ${FIRST_BRANCH_CODE} "${DEFAULT_BRANCH_NAME}" created.`);
  }

  const ownerRole = await ownerRoleId(supabase, gymId);

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: staffEmail(username, gymCode),
    password,
    email_confirm: true,
  });
  if (createError) fail(`Could not create the login: ${createError.message}`);

  const { error: staffError } = await supabase.from('staff_users').insert({
    id: created.user.id,
    gym_id: gymId,
    username,
    full_name: fullName,
    role_id: ownerRole,
    all_branches: true,
    // They chose this password themselves.
    must_change_password: false,
  });
  if (staffError) {
    // Don't leave a login without a staff account behind.
    await supabase.auth.admin.deleteUser(created.user.id);
    fail(`Could not create the staff account: ${staffError.message}`);
  }

  console.log(
    `\n✔ Owner "${username}" created. Log in to the app with gym code "${gymCode}", this username and password.`,
  );
}

await run(main);
