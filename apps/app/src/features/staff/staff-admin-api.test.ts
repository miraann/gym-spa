import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { AppSupabaseClient } from '@/lib/backend';
import {
  StaffAdminCallError,
  createStaffAccount,
  deactivateStaffAccount,
  renameStaffAccount,
  resetStaffPassword,
} from './staff-admin-api';

const STAFF_ID = 'c0000000-0000-4000-8000-000000000001';
const ROLE_ID = 'c0000000-0000-4000-8000-0000000000a1';
const BRANCH_ID = 'c0000000-0000-4000-8000-0000000000b1';

/** A client whose functions.invoke answers with the given result. */
function clientAnswering(result: { data: unknown; error: unknown }) {
  const invoke = vi.fn(() => Promise.resolve(result));
  const client = { functions: { invoke } } as unknown as AppSupabaseClient;
  return { client, invoke };
}

function httpError(status: number, body: unknown): FunctionsHttpError {
  return new FunctionsHttpError(new Response(JSON.stringify(body), { status }));
}

async function failureKey(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof StaffAdminCallError) return error.key;
    throw error;
  }
  throw new Error('it succeeded');
}

const account = {
  username: 'ali.karim',
  fullName: 'عەلی کەریم',
  phone: null,
  roleId: ROLE_ID,
  allBranches: false,
  branchIds: [BRANCH_ID],
};

describe('staff-admin calls', () => {
  it('sends the action to the staff-admin function and reads the answer', async () => {
    const answer = {
      staffId: STAFF_ID,
      username: 'ali.karim',
      temporaryPassword: 'k7m2p9x4w3h8r6',
    };
    const { client, invoke } = clientAnswering({ data: answer, error: null });

    await expect(createStaffAccount(client, account)).resolves.toEqual(answer);
    expect(invoke).toHaveBeenCalledWith('staff-admin', { body: { action: 'create', ...account } });
  });

  it('never sends a request the server would refuse anyway', async () => {
    const { client, invoke } = clientAnswering({ data: null, error: null });

    expect(await failureKey(renameStaffAccount(client, STAFF_ID, 'Ali Karim'))).toBe(
      'invalid_request',
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("gives the server's reason as its key", async () => {
    const { client } = clientAnswering({
      data: null,
      error: httpError(409, { error: 'username_taken' }),
    });
    expect(await failureKey(createStaffAccount(client, account))).toBe('username_taken');
  });

  it('a lost connection is network', async () => {
    const { client } = clientAnswering({
      data: null,
      error: new FunctionsFetchError(new TypeError('Failed to fetch')),
    });
    expect(await failureKey(deactivateStaffAccount(client, STAFF_ID))).toBe('network');
  });

  it.each([
    ['an unknown key', httpError(500, { error: 'something_new' })],
    ['a body that is not ours', httpError(502, '<html>Bad gateway</html>')],
    ['the function not reached', new FunctionsRelayError(new Response(null, { status: 503 }))],
  ])('%s is unexpected', async (_reason, error) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { client } = clientAnswering({ data: null, error });
    expect(await failureKey(deactivateStaffAccount(client, STAFF_ID))).toBe('unexpected');
  });

  it('an answer of the wrong shape is unexpected', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { client } = clientAnswering({ data: { staffId: STAFF_ID }, error: null });
    expect(await failureKey(resetStaffPassword(client, STAFF_ID))).toBe('unexpected');
  });
});
