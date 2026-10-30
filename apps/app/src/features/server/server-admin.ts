import { z } from 'zod';
import { readBackendConfig } from '@/lib/backend';

// The offline server's own settings, from the app on the server PC (step OF-d): its license and
// first Owner while it is set up, then its pairing codes and paired PCs. gym-server answers these
// only to the server PC itself, and once the gym has staff only to someone with server.manage,
// whose session goes with each call (apps/server/src/access.ts).

export class ServerAdminError extends Error {
  constructor(
    readonly key: string,
    readonly status: number,
  ) {
    super(key);
  }
}

async function call<T>(
  name: string,
  schema: z.ZodType<T>,
  options: { method?: 'GET' | 'POST'; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const config = readBackendConfig();
  if (config === null) throw new ServerAdminError('unexpected', 0);
  const response = await fetch(
    `${config.supabaseUrl.replace(/\/+$/, '')}/server/v1/admin/${name}`,
    {
      method: options.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    },
  ).catch(() => null);
  if (response === null) throw new ServerAdminError('unreachable', 0);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const key =
      typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'unexpected';
    throw new ServerAdminError(key, response.status);
  }
  return schema.parse(body);
}

const licenseAnswer = z.object({
  machineCode: z.string(),
  license: z.object({ kind: z.string() }),
});

export function fetchMachineCode(): Promise<string> {
  return call('license', licenseAnswer).then((answer) => answer.machineCode);
}

export function installLicense(codes: { license?: string; activation?: string }) {
  return call('license', licenseAnswer, { method: 'POST', body: codes });
}

export function createOwner(owner: { username: string; fullName: string }) {
  return call('owner', z.object({ username: z.string(), temporaryPassword: z.string() }), {
    method: 'POST',
    body: owner,
  });
}

export const pairingCodeSchema = z.object({
  code: z.string(),
  expiresAt: z.string(),
  identity: z.string(),
});
export type PairingCode = z.infer<typeof pairingCodeSchema>;

export function newPairingCode(token: string | null): Promise<PairingCode> {
  return call('pairing-code', pairingCodeSchema, { method: 'POST', token });
}

export const pairedPcsSchema = z.object({
  identity: z.string(),
  pcs: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      pairedAt: z.string(),
      lastSeenAt: z.string().nullable(),
    }),
  ),
});
export type PairedPcs = z.infer<typeof pairedPcsSchema>;

export function fetchPairedPcs(token: string | null): Promise<PairedPcs> {
  return call('pcs', pairedPcsSchema, { token });
}

export function removePairedPc(id: string, token: string | null) {
  return call('pcs-remove', z.object({ removed: z.boolean() }), {
    method: 'POST',
    body: { id },
    token,
  });
}
