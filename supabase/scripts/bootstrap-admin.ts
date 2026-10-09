// Creates the first Super Admin account of a Supabase project. Everyone else is added from the app.
// A new project (no branches yet) also gets its first branch, B1, so the admin can log in.
//
//   pnpm bootstrap:admin            local Supabase (start it first with `pnpm db:start`)
//   pnpm bootstrap:admin --remote   the project in supabase/.env.local (SUPABASE_URL, SUPABASE_SECRET_KEY)
//
// Asks for the username, full name and password (and the first branch's Kurdish name). For
// automation, pass --username, --full-name and --branch-name, and the password in
// BOOTSTRAP_ADMIN_PASSWORD. The secret key is used only here, on this
// computer: it never goes into the app or into git.
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { isValidUsername, normalizeUsername, staffEmail } from '@gym/core';
import type { Database } from '@gym/db';

const MIN_PASSWORD_LENGTH = 8;
/** The first branch's code; it is printed in receipt numbers and never changes. */
const FIRST_BRANCH_CODE = 'B1';
/** "Main branch"; renamed later in the app. */
const DEFAULT_BRANCH_NAME = 'لقی سەرەکی';

const { values: args } = parseArgs({
  options: {
    remote: { type: 'boolean', default: false },
    username: { type: 'string' },
    'full-name': { type: 'string' },
    'branch-name': { type: 'string' },
  },
});

/**
 * Stops the script with a message. Thrown instead of process.exit(): exiting while a fetch
 * connection is still open crashes Node on Windows (libuv assertion UV_HANDLE_CLOSING).
 */
class BootstrapError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
  }
}

function fail(message: string): never {
  throw new BootstrapError(message);
}

function connection(): { url: string; secretKey: string } {
  if (args.remote) {
    try {
      process.loadEnvFile('.env.local');
    } catch {
      // Not there: the variables may come from the environment instead.
    }
    const url = process.env.SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (!url || !secretKey) {
      fail(
        'Set SUPABASE_URL and SUPABASE_SECRET_KEY in supabase/.env.local (see supabase/.env.example).',
      );
    }
    return { url, secretKey };
  }

  let status: Record<string, string | undefined>;
  try {
    const output = execSync('supabase status --output json --workdir ..', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    status = JSON.parse(output) as Record<string, string | undefined>;
  } catch {
    fail('Local Supabase is not running. Start it with `pnpm db:start`.');
  }
  const url = status.API_URL;
  const secretKey = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
  if (!url || !secretKey) {
    fail('`supabase status` did not show the API URL and secret key.');
  }
  return { url, secretKey };
}

/** Reads a line without showing what is typed. */
function readHidden(question: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) {
    fail('Run this in a terminal, or pass the password in BOOTSTRAP_ADMIN_PASSWORD.');
  }
  return new Promise((resolve, reject) => {
    let value = '';
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n' || char === '\u0003') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          if (char === '\u0003') reject(new BootstrapError('Cancelled.', 130));
          else resolve(value);
          return;
        }
        value = char === '\u007f' || char === '\b' ? value.slice(0, -1) : value + char;
      }
    };
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    stdin.on('data', onData);
  });
}

interface Details {
  readonly username: string;
  readonly fullName: string;
  readonly password: string;
  /** null: the project has branches already. */
  readonly branchName: string | null;
}

async function askDetails(needsBranch: boolean): Promise<Details> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const username = normalizeUsername(args.username ?? (await prompt.question('Username: ')));
  const fullName = (args['full-name'] ?? (await prompt.question('Full name: '))).trim();
  let branchName: string | null = null;
  if (needsBranch) {
    const answer =
      args['branch-name'] ??
      (await prompt.question(
        `First branch name in Kurdish (Enter for "${DEFAULT_BRANCH_NAME}"): `,
      ));
    branchName = answer.trim() || DEFAULT_BRANCH_NAME;
  }
  prompt.close();

  if (!isValidUsername(username)) {
    fail('A username is 3-32 characters: a-z first, then a-z, 0-9, ".", "_" or "-".');
  }
  if (fullName.length < 1 || fullName.length > 100) {
    fail('The full name must be 1-100 characters.');
  }
  if (branchName !== null && branchName.length > 100) {
    fail('The branch name must be at most 100 characters.');
  }

  let password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (password === undefined) {
    password = await readHidden(`Password (at least ${MIN_PASSWORD_LENGTH} characters): `);
    if ((await readHidden('Password again: ')) !== password) {
      fail('The passwords do not match.');
    }
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  return { username, fullName, password, branchName };
}

async function main() {
  const { url, secretKey } = connection();
  console.log(`Supabase: ${url}`);
  const supabase = createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: superAdminRole, error: roleError } = await supabase
    .from('roles')
    .select('id')
    .eq('key', 'super_admin')
    .single();
  if (roleError) {
    fail(`Could not read the roles (are the migrations applied?): ${roleError.message}`);
  }

  const { count, error: countError } = await supabase
    .from('staff_users')
    .select('id', { count: 'exact', head: true })
    .eq('role_id', superAdminRole.id)
    .eq('is_active', true)
    .is('deleted_at', null);
  if (countError) {
    fail(`Could not read the staff accounts: ${countError.message}`);
  }
  if (count !== 0) {
    fail('This project already has a Super Admin. Add other staff from the app.');
  }

  const { count: branchCount, error: branchCountError } = await supabase
    .from('branches')
    .select('id', { count: 'exact', head: true });
  if (branchCountError) {
    fail(`Could not read the branches: ${branchCountError.message}`);
  }

  const { username, fullName, password, branchName } = await askDetails(branchCount === 0);

  // The branch first: the new admin (all branches) gets access to it as soon as they are created.
  // If creating the admin fails after this, running the script again keeps the branch.
  if (branchName !== null) {
    const { error: branchError } = await supabase
      .from('branches')
      .insert({ code: FIRST_BRANCH_CODE, name_ckb: branchName });
    if (branchError) {
      fail(`Could not create the first branch: ${branchError.message}`);
    }
    console.log(`✔ Branch ${FIRST_BRANCH_CODE} "${branchName}" created.`);
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: staffEmail(username),
    password,
    email_confirm: true,
  });
  if (createError) {
    fail(`Could not create the login: ${createError.message}`);
  }

  const { error: staffError } = await supabase.from('staff_users').insert({
    id: created.user.id,
    username,
    full_name: fullName,
    role_id: superAdminRole.id,
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
    `\n✔ Super Admin "${username}" created. Log in to the app with this username and password.`,
  );
}

try {
  await main();
} catch (error) {
  if (!(error instanceof BootstrapError)) throw error;
  console.error(`\n✖ ${error.message}`);
  process.exitCode = error.exitCode;
}
