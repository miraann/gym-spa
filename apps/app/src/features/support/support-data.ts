import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { requireClient, useActingClient } from '@/features/staff/admin-data';

// Support access (MT-4): the gym lets Click Group read its members for a while, sees the grant
// (every staff member, for the notice) and what Click Group read (support.grant). The database
// decides and records everything (grant_support_access, revoke_support_access, support_reads).

const SUPPORT_QUERY = 'support';
/** How often the grant is read again, so the notice goes away by itself when the time is over. */
const REFRESH_MS = 60_000;

export interface SupportGrant {
  readonly id: string;
  readonly reason: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly revokedAt: string | null;
}

export interface SupportRead {
  readonly id: string;
  readonly readAt: string;
  readonly adminEmail: string | null;
  readonly what: 'members' | 'member';
  readonly search: string | null;
  readonly member: { readonly id: string; readonly fullName: string } | null;
}

/** Whether a grant lets Click Group in at `now`. */
export function isRunning(grant: SupportGrant, now: number): boolean {
  return grant.revokedAt === null && Date.parse(grant.endsAt) > now;
}

/** The gym's last grants, newest first. */
export function useSupportGrants() {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [SUPPORT_QUERY, actor, 'grants'],
    enabled: client !== undefined,
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<SupportGrant[]> => {
      const { data, error } = await requireClient(client)
        .from('support_grants')
        .select('id, reason, starts_at, ends_at, revoked_at')
        .order('starts_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        reason: row.reason,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        revokedAt: row.revoked_at,
      }));
    },
  });
}

/** The time now, again every minute: a grant that ran out stops counting by itself. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return now;
}

/** The grant running now, if any (for the notice and the page). */
export function useRunningSupportGrant(): SupportGrant | null {
  const grants = useSupportGrants();
  const now = useNow();
  return grants.data?.find((grant) => isRunning(grant, now)) ?? null;
}

/** What Click Group read, newest first (support.grant). */
export function useSupportReads(enabled: boolean) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [SUPPORT_QUERY, actor, 'reads'],
    enabled: enabled && client !== undefined,
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<SupportRead[]> => {
      const { data, error } = await requireClient(client)
        .from('support_reads')
        .select('id, read_at, admin_email, what, details, members (id, full_name)')
        .order('read_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data.map((row) => {
        const details = row.details as { readonly search?: unknown } | null;
        return {
          id: row.id,
          readAt: row.read_at,
          adminEmail: row.admin_email,
          what: row.what === 'member' ? 'member' : 'members',
          search: typeof details?.search === 'string' ? details.search : null,
          member: row.members ? { id: row.members.id, fullName: row.members.full_name } : null,
        };
      });
    },
  });
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [SUPPORT_QUERY] });
}

export function useGrantSupport() {
  const { client } = useActingClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (input: { id: string; hours: number; reason: string }) => {
      const { error } = await requireClient(client).rpc('grant_support_access', {
        p_id: input.id,
        p_hours: input.hours,
        p_reason: input.reason,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export function useRevokeSupport() {
  const { client } = useActingClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (grantId: string) => {
      const { error } = await requireClient(client).rpc('revoke_support_access', {
        p_id: grantId,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}
