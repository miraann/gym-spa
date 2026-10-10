// The staff-admin Edge Function over HTTP, as the local Supabase serves it (`pnpm db:functions`):
// the real edge runtime, gateway, Auth and database. `pnpm test:deno` sets the STAFF_ADMIN_TEST_*
// variables; without them these tests are skipped.
import {
  TestGym,
  loginResult,
  signIn,
  staffAdminRequest,
  type Backend,
} from '../../../packages/staff-admin/test/fixture.ts';

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
  const response = await fetch(staffAdminRequest(backend.url, token, body));
  const answer = (await response.json()) as Record<string, unknown>;
  return { status: response.status, answer };
}

Deno.test({
  name: 'staff-admin Edge Function over HTTP',
  ignore: backend === null,
  // supabase-js keeps connections for reuse; the gyms are removed at the end either way.
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    if (backend === null) return;
    const gym = await TestGym.create(backend, 'http-a');
    const otherGym = await TestGym.create(backend, 'http-b');
    try {
      const owner = await gym.addStaff('owner', 'owner', { allBranches: true });
      const reception = await gym.addStaff('reception', 'receptionist', { branches: ['B1'] });
      const otherOwner = await otherGym.addStaff('owner', 'owner', { allBranches: true });
      const ownerToken = (await signIn(backend, owner.email, owner.password)).session.access_token;
      const newReceptionist = {
        action: 'create',
        username: 'desk.one',
        fullName: 'کارمەندی نوێ',
        roleId: await gym.roleId('receptionist'),
        allBranches: false,
        branchIds: [await gym.branchId('B1')],
      };

      await t.step('a browser may call it (CORS preflight)', async () => {
        const response = await fetch(`${backend.url}/functions/v1/staff-admin`, {
          method: 'OPTIONS',
          headers: {
            Origin: 'https://gym-spa-ten.vercel.app',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'authorization, content-type, x-device-id',
          },
        });
        await response.body?.cancel();
        check(response.status >= 200 && response.status < 300, `preflight ${response.status}`);
        check(response.headers.get('Access-Control-Allow-Origin') !== null, 'allows the origin');
      });

      await t.step('no token, no access', async () => {
        const { status, answer } = await call(null, newReceptionist);
        check(
          status === 401 && answer.error === 'unauthorized',
          `got ${status} ${String(answer.error)}`,
        );
      });

      await t.step('an invalid token is unauthorized', async () => {
        const { status } = await call('not-a-token', newReceptionist);
        check(status === 401, `got ${status}`);
      });

      await t.step(
        'the Owner creates a receptionist, who logs in and must change the password',
        async () => {
          const { status, answer } = await call(ownerToken, newReceptionist);
          check(status === 200, `got ${status} ${JSON.stringify(answer)}`);
          const password = String(answer.temporaryPassword);
          check(/^[a-z2-9]{14}$/.test(password), 'a temporary password');
          const { client } = await signIn(backend, gym.email('desk.one'), password);
          const own = await client
            .from('staff_users')
            .select('must_change_password')
            .eq('id', String(answer.staffId))
            .single();
          check(own.data?.must_change_password === true, 'must change the password');
        },
      );

      await t.step('a receptionist is refused', async () => {
        const token = (await signIn(backend, reception.email, reception.password)).session
          .access_token;
        const { status, answer } = await call(token, { ...newReceptionist, username: 'desk.two' });
        check(
          status === 403 && answer.error === 'permission_denied',
          `got ${status} ${String(answer.error)}`,
        );
        check((await gym.login(gym.email('desk.two'))) === null, 'no login was made');
      });

      await t.step("another gym's Owner cannot touch this gym's staff", async () => {
        const token = (await signIn(backend, otherOwner.email, otherOwner.password)).session
          .access_token;
        const { status, answer } = await call(token, {
          action: 'deactivate',
          staffId: reception.id,
        });
        check(
          status === 403 && answer.error === 'cannot_manage_staff',
          `got ${status} ${String(answer.error)}`,
        );
        check(
          (await loginResult(backend, reception.email, reception.password)) === 'ok',
          'still active',
        );
      });
    } finally {
      await gym.cleanup();
      await otherGym.cleanup();
    }
  },
});
