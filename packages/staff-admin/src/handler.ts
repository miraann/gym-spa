import { StaffAdminError, type StaffAdminErrorKey } from './errors.ts';
import {
  createStaff,
  deactivateStaff,
  reactivateStaff,
  renameStaff,
  resetPassword,
  type StaffAdminDeps,
} from './operations.ts';
import {
  consoleLog,
  summarizeError,
  type AdminPort,
  type CallerPort,
  type StaffAdminLog,
} from './ports.ts';
import { staffAdminRequest, type StaffAdminRequest } from './requests.ts';

// The staff-admin endpoint, with web-standard Request and Response: the Edge Function serves it
// as it is (Deno.serve), and the offline edition's gym-server will wrap the same handler.
//
//   POST, Authorization: Bearer <the manager's access token>, a JSON body (requests.ts)
//   200 with the result, or an error status with { "error": "<key>" } (errors.ts)
//
// The token is never checked here: every operation starts with a database call under it, which
// PostgREST verifies, and nothing uses the secret key before that call has passed.

export interface StaffAdminHandlerOptions {
  readonly admin: AdminPort;
  /** The manager's side for this request: a database client that sends their token. */
  readonly callerFor: (token: string, request: Request) => CallerPort;
  readonly log?: StaffAdminLog;
  readonly temporaryPassword?: () => string;
}

/** Bearer tokens, no cookies: any origin may call it (the token is what counts). */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-device-id',
  'Access-Control-Max-Age': '86400',
} as const;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      // Answers can hold a temporary password: nothing may keep a copy.
      'Cache-Control': 'no-store',
    },
  });
}

function failure(key: StaffAdminErrorKey): Response {
  return json(new StaffAdminError(key).status, { error: key });
}

function bearerToken(request: Request): string | null {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(request.headers.get('Authorization') ?? '');
  return match?.[1] ?? null;
}

function run(deps: StaffAdminDeps, request: StaffAdminRequest): Promise<unknown> {
  switch (request.action) {
    case 'create':
      return createStaff(deps, request);
    case 'reset_password':
      return resetPassword(deps, request);
    case 'deactivate':
      return deactivateStaff(deps, request);
    case 'reactivate':
      return reactivateStaff(deps, request);
    case 'rename':
      return renameStaff(deps, request);
  }
}

export function createStaffAdminHandler(
  options: StaffAdminHandlerOptions,
): (request: Request) => Promise<Response> {
  const log = options.log ?? consoleLog;

  return async (request) => {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') return failure('method_not_allowed');

    const token = bearerToken(request);
    if (token === null) return failure('unauthorized');

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return failure('invalid_request');
    }
    const parsed = staffAdminRequest.safeParse(body);
    if (!parsed.success) return failure('invalid_request');

    try {
      const deps: StaffAdminDeps = {
        admin: options.admin,
        caller: options.callerFor(token, request),
        log,
        ...(options.temporaryPassword ? { temporaryPassword: options.temporaryPassword } : {}),
      };
      return json(200, await run(deps, parsed.data));
    } catch (error) {
      if (error instanceof StaffAdminError) return failure(error.key);
      log({ event: 'unexpected_error', action: parsed.data.action, error: summarizeError(error) });
      return failure('unexpected');
    }
  };
}
