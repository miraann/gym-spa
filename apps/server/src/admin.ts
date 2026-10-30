import type { AdminAnswer, AdminHandler } from './gateway.ts';
import { LicenseInstallError } from './license.ts';
import { OwnerError, type LicenseService } from './license-service.ts';

// The server's own settings, answered only to the server PC itself (the gateway checks that):
// the license and activation, the first Owner, and accepting the clock. The server screen of the
// Windows app (OF-c/OF-d) and `gym-server-admin` use them.
//
//   GET  /server/v1/admin/license       the machine code and the license
//   POST /server/v1/admin/license       { license?, activation? }: install them
//   POST /server/v1/admin/owner         { username, fullName }: the first Owner, once
//   POST /server/v1/admin/clock-accept  after a clock set ahead by mistake was corrected

function text(body: unknown, name: string): string | undefined {
  if (typeof body !== 'object' || body === null || !(name in body)) return undefined;
  const value = (body as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
}

const notFound: AdminAnswer = { status: 404, body: { error: 'no_route' } };

export function adminHandler(service: LicenseService): AdminHandler {
  return async (method, name, body) => {
    try {
      if (name === 'license' && method === 'GET') {
        return {
          status: 200,
          body: { machineCode: service.machineCode, license: service.summary() },
        };
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
      return notFound;
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
