// Moves staff logins to their gym's address, once, after the multi-tenant step (MT-1).
//
// Before MT-1 a staff member logged in as <username>@staff.gym-spa.invalid. Now the gym code is
// part of it: <username>@<gym code>.staff.gym-spa.invalid, and the database refuses a staff account
// whose Auth email doesn't match. A project that had staff before MT-1 (the cloud project: its data
// moved into the gym "demo") needs this once, right after its MT-1 migrations are pushed. Safe to
// run again: it only changes logins that don't match yet. Sessions stay valid; the next password
// login needs the gym code.
//
//   pnpm staff-logins:move                    local Supabase: shows what would change
//   pnpm staff-logins:move --remote           the project in supabase/.env.local: shows what would change
//   pnpm staff-logins:move --remote --apply   changes them
import { parseArgs } from 'node:util';
import { staffEmail } from '@gym/core';
import { connect, fail, run } from './script-support';

const { values: args } = parseArgs({
  options: {
    remote: { type: 'boolean', default: false },
    apply: { type: 'boolean', default: false },
  },
});

const PAGE_SIZE = 500;

interface Move {
  readonly id: string;
  readonly username: string;
  readonly gymCode: string;
  readonly from: string;
  readonly to: string;
}

async function main() {
  const supabase = connect(args.remote);
  console.log(args.apply ? 'Changing logins.\n' : 'Dry run: nothing is changed (add --apply).\n');

  const moves: Move[] = [];
  let checked = 0;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: staff, error } = await supabase
      .from('staff_users')
      .select('id, username, gyms(code)')
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) fail(`Could not read the staff accounts: ${error.message}`);

    for (const member of staff) {
      checked += 1;
      // gym_id is required, so every staff member has a gym.
      const gymCode = member.gyms.code;
      const { data: auth, error: authError } = await supabase.auth.admin.getUserById(member.id);
      if (authError) fail(`Could not read the login of ${member.username}: ${authError.message}`);
      const expected = staffEmail(member.username, gymCode);
      if (auth.user.email !== expected) {
        moves.push({
          id: member.id,
          username: member.username,
          gymCode,
          from: auth.user.email ?? '(none)',
          to: expected,
        });
      }
    }
    if (staff.length < PAGE_SIZE) break;
  }

  for (const move of moves) {
    console.log(`  ${move.username} (gym ${move.gymCode}): ${move.from} → ${move.to}`);
  }
  console.log(`\n${checked} staff accounts checked, ${moves.length} logins to move.`);
  if (!args.apply || moves.length === 0) return;

  let failed = 0;
  for (const move of moves) {
    const { error } = await supabase.auth.admin.updateUserById(move.id, {
      email: move.to,
      email_confirm: true,
    });
    if (error) {
      failed += 1;
      console.error(`  ✖ ${move.username} (gym ${move.gymCode}): ${error.message}`);
    }
  }
  if (failed > 0) fail(`${failed} of ${moves.length} logins could not be moved; run it again.`);
  console.log(`✔ ${moves.length} logins moved. Staff now log in with their gym code.`);
}

await run(main);
