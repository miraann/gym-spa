import type { AdminAnswer, AdminHandler } from './gateway.ts';
import { LicenseInstallError } from './license.ts';
import { OwnerError, type LicenseService } from './license-service.ts';
import { PairingError, type PairingService } from './pairing-service.ts';

// The server's own settings, answered only to the server PC itself (the gateway checks that, and
// who may: access.ts). The Windows app's server screens and `gym-server-admin` use them.
//
//   GET  /server/v1/admin/license       the machine code and the license
//   POST /server/v1/admin/license       { license?, activation? }: install them
//   POST /server/v1/admin/owner         { username, fullName }: the first Owner, once
//   POST /server/v1/admin/clock-accept  after a clock set ahead by mistake was corrected
//   POST /server/v1/admin/pairing-code  a new 6-digit code (10 minutes) with the server identity
//   GET  /server/v1/admin/pcs           the paired PCs
//   POST /server/v1/admin/pcs-remove    { id }: refuses that PC from now on

function text(body: unknown, name: string): string | undefined {
  if (typeof body !== 'object' || body === null || !(name in body)) return undefined;
  const value = (body as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
}

const notFound: AdminAnswer = { status: 404, body: { error: 'no_route' } };

export interface AdminServices {
  readonly license: LicenseService | null;
  readonly pairing: PairingService | null;
}

async function licenseRoutes(
  service: LicenseService,
  method: string,
  name: string,
  body: unknown,
): Promise<AdminAnswer | null> {
  if (name === 'license' && method === 'GET') {
    return { status: 200, body: { machineCode: service.machineCode, license: service.summary() } };
  }
  if (name === 'license' && method === 'POST') {
    const license = await service.install({
      license: text(body, 'license'),
      activation: text(body, 'activation'),
    });
    return { status: 200, body: { machineCode: service.machineCode, license } };
  }
  if (name === 'owner' && method === 'POST') {
    const owner = await service.createOwner({
      username: text(body, 'username') ?? '',
      fullName: text(body, 'fullName') ?? '',
    });
    return { status: 201, body: owner };
  }
  if (name === 'clock-accept' && method === 'POST') {
    return { status: 200, body: { license: await service.acceptClock() } };
  }
  return null;
}

function pairingRoutes(
  service: PairingService,
  method: string,
  name: string,
  body: unknown,
): AdminAnswer | null {
  if (name === 'pairing-code' && method === 'POST') return { status: 201, body: service.newCode() };
  if (name === 'pcs' && method === 'GET') {
    return { status: 200, body: { identity: service.identity, pcs: service.list() } };
  }
  if (name === 'pcs-remove' && method === 'POST') {
    const removed = service.remove(text(body, 'id') ?? '');
    return removed
      ? { status: 200, body: { removed: true } }
      : { status: 404, body: { error: 'pc_not_found' } };
  }
  return null;
}

export function adminHandler(services: AdminServices): AdminHandler {
  return async (method, name, body) => {
    try {
      const answer =
        (services.license && (await licenseRoutes(services.license, method, name, body))) ??
        (services.pairing && pairingRoutes(services.pairing, method, name, body));
      return answer ?? notFound;
    } catch (error) {
      if (error instanceof LicenseInstallError) {
        return { status: 400, body: { error: error.key, detail: error.detail } };
      }
      if (error instanceof OwnerError) {
        return {
          status: error.key === 'owner_exists' || error.key === 'no_gym' ? 409 : 400,
          body: { error: error.key },
        };
      }
      throw error;
    }
  };
}

/** POST /server/v1/pair (from any PC on the LAN): { code, proof, name } → its token, once. */
export async function pairAnswer(service: PairingService, body: unknown): Promise<AdminAnswer> {
  try {
    const paired = await service.pair({
      code: text(body, 'code') ?? '',
      proof: text(body, 'proof') ?? '',
      name: text(body, 'name') ?? '',
    });
    return { status: 201, body: paired };
  } catch (error) {
    if (error instanceof PairingError) {
      return { status: error.key === 'too_many_tries' ? 429 : 400, body: { error: error.key } };
    }
    throw error;
  }
}
