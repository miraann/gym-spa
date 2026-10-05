// Creates the first Super Admin account of a Supabase project. Everyone else is added from the app.
//
//   pnpm bootstrap:admin            local Supabase (start it first with `pnpm db:start`)
//   pnpm bootstrap:admin --remote   the project in supabase/.env.local (SUPABASE_URL, SUPABASE_SECRET_KEY)
//
// Asks for the username, full name and password. For automation, pass --username and --full-name,
// and the password in BOOTSTRAP_ADMIN_PASSWORD. The secret key is used only here, on this
// computer: it never goes into the app or into git.
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { isValidUsername, normalizeUsername, staffEmail } from '@gym/core';
import type { Database } from '@gym/db';

const MIN_PASSWORD_LENGTH = 8;

const { values: args } = parseArgs({
  options: {
    remote: { type: 'boolean', default: false },
    username: { type: 'string' },
    'full-name': { type: 'string' },
  },
});

function fail(message: string): never {
  console.error(`\n✖ ${message}`);
  process.exit(1);
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
  return new Promise((resolve) => {
    let value = '';
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          stdout.write('\n');
          process.exit(130);
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

async function askDetails(): Promise<{ username: string; fullName: string; password: string }> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const username = normalizeUsername(args.username ?? (await prompt.question('Username: ')));
  const fullName = (args['full-name'] ?? (await prompt.question('Full name: '))).trim();
  prompt.close();

  if (!isValidUsername(username)) {
    fail('A username is 3-32 characters: a-z first, then a-z, 0-9, ".", "_" or "-".');
  }
  if (fullName.length < 1 || fullName.length > 100) {
    fail('The full name must be 1-100 characters.');
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
  return { username, fullName, password };
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

  const { username, fullName, password } = await askDetails();

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

await main();
