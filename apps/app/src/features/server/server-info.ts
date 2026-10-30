import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { readBackendConfig, type BackendConfig } from '@/lib/backend';
import { isOfflineEdition } from '@/lib/edition';

// What the offline edition's server says about itself (GET /server/v1/info, no key needed): which
// gym it is, its version (every PC must run the same one), and its license with the warnings. The
// online edition has no such server and never asks.

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const stage = z.union([z.literal(30), z.literal(7), z.literal(1)]);

export const licenseSummarySchema = z.object({
  kind: z.enum(['none', 'broken', 'not_activated', 'wrong_machine', 'activated']),
  gymCode: z.string().nullable(),
  type: z.enum(['yearly', 'perpetual']).nullable(),
  expiresOn: day.nullable(),
  updatesUntil: day.nullable(),
  maxBranches: z.number().nullable(),
  maxDevices: z.number().nullable(),
  state: z
    .discriminatedUnion('kind', [
      z.object({
        kind: z.literal('active'),
        daysLeft: z.number().nullable(),
        stage: stage.nullable(),
      }),
      z.object({ kind: z.literal('grace'), daysLeft: z.number(), readOnlyOn: day }),
      z.object({ kind: z.literal('expired') }),
    ])
    .nullable(),
  updates: z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('none') }),
      z.object({ kind: z.literal('ending'), daysLeft: z.number(), stage }),
      z.object({ kind: z.literal('ended') }),
    ])
    .nullable(),
  clockBehind: z.boolean(),
});

export const serverInfoSchema = z.object({
  edition: z.literal('offline'),
  version: z.string(),
  fingerprint: z.string().nullable(),
  gym: z.object({ code: z.string(), name: z.string() }).nullable(),
  license: licenseSummarySchema.nullable(),
  /** The server's identity (XXXX-XXXX); null on a server without its LAN port. */
  identity: z.string().nullable().optional(),
  /** What the server PC still needs to be set up (OF-d). */
  setup: z.enum(['license', 'owner']).nullable().optional(),
});

export type ServerInfo = z.infer<typeof serverInfoSchema>;
export type LicenseSummary = z.infer<typeof licenseSummarySchema>;

/** Asks the server; throws when it doesn't answer or answers something else. */
export async function fetchServerInfo(
  config: BackendConfig,
  fetcher: typeof fetch = (...args) => fetch(...args),
): Promise<ServerInfo> {
  const response = await fetcher(`${config.supabaseUrl.replace(/\/+$/, '')}/server/v1/info`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`server_info_${String(response.status)}`);
  return serverInfoSchema.parse(await response.json());
}

export const SERVER_INFO_KEY = ['server-info'] as const;

/** The server's info in the offline edition (every minute, and when the app comes back to the front). */
export function useServerInfo() {
  const config = readBackendConfig();
  return useQuery({
    queryKey: SERVER_INFO_KEY,
    queryFn: () => {
      if (config === null) throw new Error('not_configured');
      return fetchServerInfo(config);
    },
    enabled: isOfflineEdition && config !== null,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** Whether this app and the server run the same version (spec §2.5: they must). */
export function sameVersion(info: Pick<ServerInfo, 'version'>, appVersion: string): boolean {
  return info.version === appVersion;
}

/** Why an offline gym is read-only, from its server's license; null when the license ran out. */
export function readOnlyReason(
  license: LicenseSummary | null,
): 'clock' | 'notActivated' | 'wrongMachine' | 'broken' | null {
  if (license === null) return null;
  if (license.clockBehind) return 'clock';
  if (license.kind === 'not_activated') return 'notActivated';
  if (license.kind === 'wrong_machine') return 'wrongMachine';
  if (license.kind === 'broken') return 'broken';
  return null;
}
