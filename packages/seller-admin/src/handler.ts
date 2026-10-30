import {
  CORS_HEADERS,
  bearerToken,
  jsonResponse,
  summarizeError,
  type TokenVerifier,
} from '@gym/staff-admin/server';
import type { LicenseSigningKey } from '@gym/core';
import { SellerAdminError, type SellerAdminErrorKey } from './errors.ts';
import {
  addAdmin,
  createGym,
  deactivateAdmin,
  issueActivation,
  issueLicense,
  reactivateAdmin,
  resetAdminPassword,
  resetAdminTwoStep,
  useRecoveryCode,
  type SellerAdminDeps,
} from './operations.ts';
import {
  consoleLog,
  type SellerAdminLog,
  type SellerAdminPort,
  type SellerCallerPort,
} from './ports.ts';
import {
  BEFORE_TWO_STEP_ACTIONS,
  sellerAdminRequest,
  type SellerAdminRequest,
} from './requests.ts';

// The seller-admin endpoint, with web-standard Request and Response (the Edge Function serves it as
// it is). Online only: the offline edition has no seller panel.
//
//   POST, Authorization: Bearer <the platform admin's access token>, a JSON body (requests.ts)
//   200 with the result, or an error status with { "error": "<key>" } (errors.ts)
//
// Checks, in order, before anything changes:
//   1. the token itself (the project's keys, expiry, a logged-in user): 401 before the body is read;
//   2. a request it knows;
//   3. two-step login: the token must be aal2, except for using a recovery code (the admin lost
//      their device and has only passed the password);
//   4. every operation then starts with a database call under the same token, which checks for an
//      active platform admin with two-step login again. Nothing uses the secret key before that.

export interface SellerAdminHandlerOptions {
  readonly admin: SellerAdminPort;
  /** Checks the bearer token before anything else (@gym/staff-admin's token check). */
  readonly verifyToken: TokenVerifier;
  /** The platform admin's side for this request: a database client that sends their token. */
  readonly callerFor: (token: string, request: Request) => SellerCallerPort;
  readonly log?: SellerAdminLog;
  readonly temporaryPassword?: () => string;
  readonly newId?: () => string;
  /** The license signing key, loaded once from the function's secret; absent when it has none. */
  readonly licenseKey?: () => Promise<LicenseSigningKey>;
}

function failure(key: SellerAdminErrorKey): Response {
  return jsonResponse(new SellerAdminError(key).status, { error: key });
}

function run(deps: SellerAdminDeps, request: SellerAdminRequest): Promise<unknown> {
  switch (request.action) {
    case 'create_gym':
      return createGym(deps, request);
    case 'add_admin':
      return addAdmin(deps, request);
    case 'deactivate_admin':
      return deactivateAdmin(deps, request);
    case 'reactivate_admin':
      return reactivateAdmin(deps, request);
    case 'reset_admin_two_step':
      return resetAdminTwoStep(deps, request);
    case 'reset_admin_password':
      return resetAdminPassword(deps, request);
    case 'use_recovery_code':
      return useRecoveryCode(deps, request);
    case 'issue_license':
      return issueLicense(deps, request);
    case 'issue_activation':
      return issueActivation(deps, request);
  }
}

export function createSellerAdminHandler(
  options: SellerAdminHandlerOptions,
): (request: Request) => Promise<Response> {
  const log = options.log ?? consoleLog;

  return async (request) => {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') return failure('method_not_allowed');

    const token = bearerToken(request);
    if (token === null) return failure('unauthorized');
    let check;
    try {
      check = await options.verifyToken(token);
    } catch (error) {
      check = { ok: false, reason: 'unavailable', error } as const;
    }
    if (!check.ok) {
      if (check.reason !== 'unavailable') return failure('unauthorized');
      // The project's keys could not be read: nothing can be checked, so nothing goes ahead.
      log({
        event: 'unexpected_error',
        action: 'verify_token',
        ...('error' in check ? { error: summarizeError(check.error) } : {}),
      });
      return failure('unexpected');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return failure('invalid_request');
    }
    const parsed = sellerAdminRequest.safeParse(body);
    if (!parsed.success) return failure('invalid_request');

    if (check.aal !== 'aal2' && !BEFORE_TWO_STEP_ACTIONS.includes(parsed.data.action)) {
      return failure('mfa_required');
    }

    try {
      const deps: SellerAdminDeps = {
        admin: options.admin,
        caller: options.callerFor(token, request),
        log,
        callerId: check.userId,
        ...(options.temporaryPassword ? { temporaryPassword: options.temporaryPassword } : {}),
        ...(options.newId ? { newId: options.newId } : {}),
        ...(options.licenseKey ? { licenseKey: options.licenseKey } : {}),
      };
      return jsonResponse(200, await run(deps, parsed.data));
    } catch (error) {
      if (error instanceof SellerAdminError) return failure(error.key);
      log({ event: 'unexpected_error', action: parsed.data.action, error: summarizeError(error) });
      return failure('unexpected');
    }
  };
}
