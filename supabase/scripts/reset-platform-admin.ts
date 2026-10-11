// The last resort of the recovery procedure (README → Seller panel → Recovery procedure): a
// platform admin lost their two-step device, no other platform admin can reset it, and they have
// no recovery code left. Run on Click Group's own PC, with the project's secret key:
//
//   pnpm platform-admin:reset-2fa --email ali@clickgroup.site               local
//   pnpm platform-admin:reset-2fa --email ali@clickgroup.site --remote      the project in supabase/.env.local
//   ... --password                                                           also a new temporary password
//
// Removes the admin's two-step devices (TOTP factors) and voids their recovery codes; at their next
// login they set up a new device. With --password, they also get a temporary password, printed
// here once, which they replace at that login. Both are recorded in the seller log with no actor.
// Asks to confirm by typing the address again (or pass --yes).
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { isValidAdminEmail, normalizeAdminEmail } from '@gym/core';
import { generateTemporaryPassword } from '@gym/staff-admin/server';
import { ask, connect, fail, run } from './script-support';

const { values: args } = parseArgs({
  options: {
    remote: { type: 'boolean', default: false },
    email: { type: 'string' },
    password: { type: 'boolean', default: false },
    yes: { type: 'boolean', default: false },
  },
});

async function main() {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  let email: string;
  try {
    email = normalizeAdminEmail(args.email ?? (await ask(prompt, 'Platform admin email: ')));
    if (!isValidAdminEmail(email)) fail('That is not a platform admin address.');

    const supabase = connect(args.remote);
    const found = await supabase.rpc('platform_script_find_admin', { p_email: email });
    if (found.error) fail(`Could not read the platform admins: ${found.error.message}`);
    const admin = found.data[0];
    if (!admin) fail(`${email} is not a platform admin.`);

    console.log(
      `\nThis removes the two-step device${args.password ? ' and the password' : ''} of ${admin.full_name} <${email}>.`,
    );
    if (!admin.is_active) {
      console.log('Note: this account is deactivated. Another platform admin reactivates it.');
    }
    if (!args.yes) {
      const typed = normalizeAdminEmail(
        await ask(prompt, 'Type the email address again to confirm: '),
      );
      if (typed !== email) fail('The addresses differ. Nothing was changed.');
    }

    const factors = await supabase.auth.admin.mfa.listFactors({ userId: admin.user_id });
    if (factors.error) fail(`Could not read the two-step devices: ${factors.error.message}`);
    for (const factor of factors.data.factors) {
      const removed = await supabase.auth.admin.mfa.deleteFactor({
        id: factor.id,
        userId: admin.user_id,
      });
      if (removed.error) fail(`Could not remove a two-step device: ${removed.error.message}`);
    }
    const twoStep = await supabase.rpc('platform_script_record', {
      p_user_id: admin.user_id,
      p_action: 'reset_two_step',
    });
    if (twoStep.error) {
      fail(
        `The device is removed, but the seller log could not record it: ${twoStep.error.message}. Run this again.`,
      );
    }
    console.log(
      `✔ Two-step login reset (${factors.data.factors.length} device(s) removed, recovery codes voided).`,
    );

    if (args.password) {
      const password = generateTemporaryPassword();
      const changed = await supabase.auth.admin.updateUserById(admin.user_id, { password });
      if (changed.error) fail(`Could not set a temporary password: ${changed.error.message}`);
      const recorded = await supabase.rpc('platform_script_record', {
        p_user_id: admin.user_id,
        p_action: 'reset_password',
      });
      if (recorded.error) {
        fail(
          `The password changed, but it could not be marked temporary: ${recorded.error.message}. Run this again.`,
        );
      }
      console.log(`\n  Temporary password (shown only now, stored nowhere): ${password}\n`);
    }

    console.log(
      'At the next login in the seller panel they set up a new authenticator app' +
        (args.password ? ' and choose their own password.' : '.'),
    );
  } finally {
    prompt.close();
  }
}

await run(main);
