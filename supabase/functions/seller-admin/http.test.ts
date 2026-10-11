// The seller-admin Edge Function over HTTP, as the local Supabase serves it (`pnpm db:functions`):
// the real edge runtime, gateway, Auth (with TOTP and the access token hook) and database.
// `pnpm test:deno` sets the STAFF_ADMIN_TEST_* variables; without them these tests are skipped.
import {
  TestGym,
  loginResult,
  signIn,
  type Backend,
} from '../../../packages/staff-admin/test/fixture.ts';
import {
  TestPlatformAdmin,
  removePlatformAdminsSql,
} from '../../../packages/seller-admin/test/platform.ts';

function readBackend(): Backend | null {
  const url = Deno.env.get('STAFF_ADMIN_TEST_URL');
  const publishableKey = Deno.env.get('STAFF_ADMIN_TEST_PUBLISHABLE_KEY');
  const secretKey = Deno.env.get('STAFF_ADMIN_TEST_SECRET_KEY');
  return url && publishableKey && secretKey ? { url, publishableKey, secretKey } : null;
}

const backend = readBackend();

function check(condition: boolean, what: string): void {
  if (!condition) throw new Error(what);
}

async function call(token: string | null, body: unknown) {
  if (backend === null) throw new Error('no backend');
  const response = await fetch(`${backend.url}/functions/v1/seller-admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
  const answer = (await response.json()) as Record<string, unknown>;
  return { status: response.status, answer };
}

/** SQL into the local database (removing test platform admins, which no API may delete). */
async function localSql(sql: string): Promise<void> {
  const command = new Deno.Command('docker', {
    args: [
      'exec',
      '-i',
      'supabase_db_gym-spa',
      'psql',
      '-U',
      'postgres',
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    stdin: 'piped',
    stdout: 'null',
    stderr: 'piped',
  }).spawn();
  const writer = command.stdin.getWriter();
  await writer.write(new TextEncoder().encode(sql));
  await writer.close();
  const { code, stderr } = await command.output();
  if (code !== 0) throw new Error(new TextDecoder().decode(stderr));
}

Deno.test({
  name: 'seller-admin Edge Function over HTTP',
  ignore: backend === null,
  // supabase-js keeps connections for reuse; everything is removed at the end either way.
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    if (backend === null) return;
    const run = crypto.randomUUID().slice(0, 6);
    const code = `http-seller-${run}`;
    const admin = await TestPlatformAdmin.create(backend, 'http-admin');
    // Set inside a step; a holder, so TypeScript doesn't narrow it to null.
    const made: { gym: TestGym | null } = { gym: null };
    try {
      const aal2 = await admin.ready();
      const aal1 =
        (await (await admin.signIn()).auth.getSession()).data.session?.access_token ?? '';
      const newGym = {
        action: 'create_gym',
        code,
        nameCkb: 'جیمی تاقیکردنەوە',
        firstBranchName: 'لقی سەرەکی',
        paidUntil: null,
        owner: { username: 'boss', fullName: 'خاوەن' },
      };

      await t.step('a browser may call it (CORS preflight)', async () => {
        const response = await fetch(`${backend.url}/functions/v1/seller-admin`, {
          method: 'OPTIONS',
          headers: {
            Origin: 'https://gym-spa-ten.vercel.app',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'authorization, content-type',
          },
        });
        await response.body?.cancel();
        check(response.status >= 200 && response.status < 300, `preflight ${response.status}`);
        check(response.headers.get('Access-Control-Allow-Origin') !== null, 'allows the origin');
      });

      await t.step('no token, no access', async () => {
        const { status, answer } = await call(null, newGym);
        check(
          status === 401 && answer.error === 'unauthorized',
          `got ${status} ${String(answer.error)}`,
        );
      });

      await t.step('after the password alone, only a recovery code is accepted', async () => {
        const { status, answer } = await call(aal1, newGym);
        check(
          status === 403 && answer.error === 'mfa_required',
          `got ${status} ${String(answer.error)}`,
        );
      });

      await t.step('a request it does not know is refused', async () => {
        const { status, answer } = await call(aal2.accessToken, { action: 'delete_gym', code });
        check(
          status === 400 && answer.error === 'invalid_request',
          `got ${status} ${String(answer.error)}`,
        );
      });

      await t.step('after two-step login it creates a gym whose Owner can log in', async () => {
        const { status, answer } = await call(aal2.accessToken, newGym);
        check(status === 200, `got ${status} ${JSON.stringify(answer)}`);
        made.gym = TestGym.existing(backend, String(answer.gymId), code);
        const result = await loginResult(
          backend,
          `boss@${code}.staff.gym-spa.invalid`,
          String(answer.temporaryPassword),
        );
        check(result === 'ok', `Owner login: ${result}`);
      });

      await t.step('gym staff are no platform admins', async () => {
        if (made.gym === null) throw new Error('no gym');
        const owner = await made.gym.addStaff('second.owner', 'owner', { allBranches: true });
        const token = (await signIn(backend, owner.email, owner.password)).session.access_token;
        const { status, answer } = await call(token, {
          action: 'use_recovery_code',
          code: 'aaaa-bbbb-cccc-dddd',
        });
        check(
          status === 403 && answer.error === 'not_platform_admin',
          `got ${status} ${String(answer.error)}`,
        );
      });
    } finally {
      if (made.gym !== null) await made.gym.cleanup();
      await localSql(removePlatformAdminsSql([admin.id]));
    }
  },
});
