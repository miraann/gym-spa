import {
  createStaffResult,
  isStaffAdminErrorKey,
  resetPasswordResult,
  staffAdminFailure,
  staffAdminRequest,
  staffChangeResult,
  type CreateStaffRequest,
  type CreateStaffResult,
  type ResetPasswordResult,
  type StaffAdminErrorKey,
  type StaffAdminRequest,
  type StaffChangeResult,
} from '@gym/staff-admin';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import type { z } from 'zod';
import type { AppSupabaseClient } from '@/lib/backend';
import { logError } from '@/lib/logger';

// The staff module's server calls (spec §2.5, design B): the staff-admin function at the backend,
// the Edge Function online and gym-server offline, at the same path. Each call goes with the
// acting staff member's own session; the server checks everything again.
//
// A temporary password comes back exactly once. Show it (TemporaryPasswordDialog) and drop it:
// never keep it in a query cache, in storage or in a log.

const FUNCTION = 'staff-admin';

/** Why a call failed: the server's key (staff:errors), or no connection. */
export type StaffAdminCallErrorKey = StaffAdminErrorKey | 'network';

export class StaffAdminCallError extends Error {
  override readonly name = 'StaffAdminCallError';
  constructor(
    readonly key: StaffAdminCallErrorKey,
    options?: ErrorOptions,
  ) {
    super(key, options);
  }
}

/** Sorts what supabase-js' functions client returned into a key. */
export async function toStaffAdminCallError(error: unknown): Promise<StaffAdminCallError> {
  if (error instanceof FunctionsHttpError) {
    const response: unknown = error.context;
    if (response instanceof Response) {
      const body: unknown = await response.json().catch(() => null);
      const failure = staffAdminFailure.safeParse(body);
      if (failure.success && isStaffAdminErrorKey(failure.data.error)) {
        return new StaffAdminCallError(failure.data.error, { cause: error });
      }
    }
  }
  if (error instanceof FunctionsFetchError)
    return new StaffAdminCallError('network', { cause: error });
  logError(error, { area: 'staff', action: FUNCTION });
  return new StaffAdminCallError('unexpected', { cause: error });
}

async function invoke<T>(
  client: AppSupabaseClient,
  request: StaffAdminRequest,
  result: z.ZodType<T>,
): Promise<T> {
  const valid = staffAdminRequest.safeParse(request);
  if (!valid.success) throw new StaffAdminCallError('invalid_request', { cause: valid.error });

  const response = await client.functions.invoke<unknown>(FUNCTION, { body: valid.data });
  const error: unknown = response.error;
  if (error) throw await toStaffAdminCallError(error);
  const parsed = result.safeParse(response.data);
  if (!parsed.success) {
    logError(parsed.error, { area: 'staff', action: request.action });
    throw new StaffAdminCallError('unexpected', { cause: parsed.error });
  }
  return parsed.data;
}

/** A new staff account. The answer holds its temporary password: show it once. */
export function createStaffAccount(
  client: AppSupabaseClient,
  account: Omit<CreateStaffRequest, 'action'>,
): Promise<CreateStaffResult> {
  return invoke(client, { action: 'create', ...account }, createStaffResult);
}

/** A new temporary password (the old one and their sessions stop working): show it once. */
export function resetStaffPassword(
  client: AppSupabaseClient,
  staffId: string,
): Promise<ResetPasswordResult> {
  return invoke(client, { action: 'reset_password', staffId }, resetPasswordResult);
}

/** Ends their access at once, on every device. */
export function deactivateStaffAccount(
  client: AppSupabaseClient,
  staffId: string,
): Promise<StaffChangeResult> {
  return invoke(client, { action: 'deactivate', staffId }, staffChangeResult);
}

export function reactivateStaffAccount(
  client: AppSupabaseClient,
  staffId: string,
): Promise<StaffChangeResult> {
  return invoke(client, { action: 'reactivate', staffId }, staffChangeResult);
}

/** A new username (send it normalized); their password, PIN and sessions stay. */
export function renameStaffAccount(
  client: AppSupabaseClient,
  staffId: string,
  username: string,
): Promise<StaffChangeResult> {
  return invoke(client, { action: 'rename', staffId, username }, staffChangeResult);
}
