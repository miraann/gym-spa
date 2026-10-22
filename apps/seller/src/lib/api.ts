import type { Database } from '@gym/db';
import {
  SELLER_ADMIN_RESULTS,
  type SellerAdminAction,
  type SellerAdminRequest,
  type SellerAdminResults,
} from '@gym/seller-admin';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { SellerClient } from './backend';
import { useSellerClient } from './client';
import { PanelError, fromDatabase, fromFunction } from './errors';

// Every read and change the panel makes: the seller_* database functions (each checks for an
// active platform admin with two-step login itself) and the seller-admin Edge Function for what
// needs the Auth admin API.

type Functions = Database['public']['Functions'];

/** The generated types call every column a SQL function returns non-null; these can be null. */
type WithNulls<Row, Key extends keyof Row> = Omit<Row, Key> & { [K in Key]: Row[K] | null };

/** A gym with its member counts (seller_member_counts: numbers only, never names). */
export type GymRow = Omit<Functions['seller_member_counts']['Returns'][number], 'gym_id'> &
  GymRowWithoutCounts;

type GymRowWithoutCounts = WithNulls<
  Functions['seller_gyms']['Returns'][number],
  | 'name_en'
  | 'name_ar'
  | 'paid_until'
  | 'suspended_at'
  | 'locked_at'
  | 'state_reason'
  | 'max_branches'
  | 'max_devices'
  | 'last_login_at'
  | 'last_device_seen_at'
>;
export type AdminRow = WithNulls<Functions['seller_admins']['Returns'][number], 'last_sign_in_at'>;
export type LogRow = WithNulls<
  Functions['seller_audit_log']['Returns'][number],
  'actor_id' | 'actor_email' | 'gym_id' | 'gym_code' | 'target_admin_id' | 'target_email' | 'reason'
>;
export type MeRow = Functions['seller_me']['Returns'][number];

/**
 * A SQL argument that may be null. The generated types can't say so for parameters without a
 * default; PostgREST sends it as JSON null, which the function reads as SQL null.
 */
function sqlNull<T>(value: T | null): T {
  return value as T;
}

/** Screens refresh on focus and every minute (no Realtime: spec §2.5). */
const REFRESH_MS = 60_000;

async function rows<T>(
  promise: PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>,
): Promise<T> {
  const { data, error } = await promise;
  if (error) throw fromDatabase(error);
  if (data === null) throw new PanelError('unexpected');
  return data;
}

/** One action of the seller-admin Edge Function, with its answer checked. */
export async function callSellerAdmin<A extends SellerAdminAction>(
  client: SellerClient,
  request: Extract<SellerAdminRequest, { action: A }>,
): Promise<SellerAdminResults[A]> {
  const result = await client.functions.invoke<unknown>('seller-admin', { body: request });
  const error: unknown = result.error;
  if (error) throw await fromFunction(error);
  const parsed = SELLER_ADMIN_RESULTS[request.action].safeParse(result.data);
  if (!parsed.success) throw new PanelError('unexpected', { cause: parsed.error });
  return parsed.data as SellerAdminResults[A];
}

export async function fetchMe(client: SellerClient): Promise<MeRow | null> {
  const { data, error } = await client.rpc('seller_me').maybeSingle();
  if (error) throw fromDatabase(error);
  return data;
}

// Reads -----------------------------------------------------------------------------------------

/** The gyms (one, or all) with their member counts; a gym without a count row has 0 members. */
async function fetchGyms(client: SellerClient, gymId?: string): Promise<GymRow[]> {
  const args = gymId === undefined ? {} : { p_gym_id: gymId };
  const [gyms, counts] = await Promise.all([
    rows<GymRowWithoutCounts[]>(client.rpc('seller_gyms', args)),
    rows(client.rpc('seller_member_counts', args)),
  ]);
  const byGym = new Map(counts.map((count) => [count.gym_id, count]));
  return gyms.map((gym) => ({
    ...gym,
    members: byGym.get(gym.id)?.members ?? 0,
    active_members: byGym.get(gym.id)?.active_members ?? 0,
  }));
}

export function useGyms() {
  const client = useSellerClient();
  return useQuery({
    queryKey: ['gyms'],
    queryFn: () => fetchGyms(client),
    refetchInterval: REFRESH_MS,
  });
}

export function useGym(gymId: string) {
  const client = useSellerClient();
  return useQuery({
    queryKey: ['gyms', gymId],
    queryFn: async (): Promise<GymRow | null> => (await fetchGyms(client, gymId))[0] ?? null,
    refetchInterval: REFRESH_MS,
  });
}

export function useAdmins() {
  const client = useSellerClient();
  return useQuery({
    queryKey: ['admins'],
    queryFn: async (): Promise<AdminRow[]> => rows(client.rpc('seller_admins')),
    refetchInterval: REFRESH_MS,
  });
}

const LOG_PAGE = 50;

/** The seller log, newest first, in pages; gymId narrows it to one gym. */
export function useAuditLog(gymId: string | null) {
  const client = useSellerClient();
  return useInfiniteQuery({
    queryKey: ['log', gymId],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<LogRow[]> =>
      rows(
        client.rpc('seller_audit_log', {
          p_limit: LOG_PAGE,
          ...(gymId === null ? {} : { p_gym_id: gymId }),
          ...(pageParam === null ? {} : { p_before: pageParam }),
        }),
      ),
    getNextPageParam: (last) =>
      last.length < LOG_PAGE ? undefined : (last[last.length - 1]?.occurred_at ?? undefined),
  });
}

// Changes -----------------------------------------------------------------------------------------

function afterGymChange(queryClient: QueryClient): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['gyms'] }),
    queryClient.invalidateQueries({ queryKey: ['log'] }),
  ]).then(() => undefined);
}

function afterAdminChange(queryClient: QueryClient): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['admins'] }),
    queryClient.invalidateQueries({ queryKey: ['log'] }),
  ]).then(() => undefined);
}

export type GymStateAction = 'suspend' | 'lock' | 'reactivate';

/** Suspend, lock or reactivate a gym, with its reason (required for lock). */
export function useGymState(gymId: string) {
  const client = useSellerClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ action, reason }: { action: GymStateAction; reason: string | null }) => {
      const args = { p_gym_id: gymId, ...(reason === null ? {} : { p_reason: reason }) };
      const call =
        action === 'suspend'
          ? client.rpc('seller_suspend_gym', args)
          : action === 'lock'
            ? client.rpc('seller_lock_gym', { p_gym_id: gymId, p_reason: reason ?? '' })
            : client.rpc('seller_reactivate_gym', args);
      const { error } = await call;
      if (error) throw fromDatabase(error);
    },
    onSuccess: () => afterGymChange(queryClient),
  });
}

export function useSetPaidUntil(gymId: string) {
  const client = useSellerClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (paidUntil: string | null) => {
      const { error } = await client.rpc('seller_set_paid_until', {
        p_gym_id: gymId,
        // null: no end.
        p_paid_until: sqlNull(paidUntil),
      });
      if (error) throw fromDatabase(error);
    },
    onSuccess: () => afterGymChange(queryClient),
  });
}

export function useSetLimits(gymId: string) {
  const client = useSellerClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      branches,
      devices,
    }: {
      branches: number | null;
      devices: number | null;
    }) => {
      const { error } = await client.rpc('seller_set_limits', {
        p_gym_id: gymId,
        p_max_branches: sqlNull(branches),
        p_max_devices: sqlNull(devices),
      });
      if (error) throw fromDatabase(error);
    },
    onSuccess: () => afterGymChange(queryClient),
  });
}

export function useRenameGym(gymId: string) {
  const client = useSellerClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (names: { ckb: string; en: string | null; ar: string | null }) => {
      const { error } = await client.rpc('seller_rename_gym', {
        p_gym_id: gymId,
        p_name_ckb: names.ckb,
        p_name_en: sqlNull(names.en),
        p_name_ar: sqlNull(names.ar),
      });
      if (error) throw fromDatabase(error);
    },
    onSuccess: () => afterGymChange(queryClient),
  });
}

export function useCreateGym() {
  const client = useSellerClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: Extract<SellerAdminRequest, { action: 'create_gym' }>) =>
      callSellerAdmin(client, request),
    onSuccess: () => afterGymChange(queryClient),
  });
}

export type AdminAction = 'deactivate_admin' | 'reactivate_admin' | 'reset_admin_two_step';

export function useAdminChange() {
  const client = useSellerClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ action, userId }: { action: AdminAction; userId: string }) =>
      callSellerAdmin(client, { action, userId }),
    onSuccess: () => afterAdminChange(queryClient),
  });
}

export function useResetAdminPassword() {
  const client = useSellerClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      callSellerAdmin(client, { action: 'reset_admin_password', userId }),
    onSuccess: () => afterAdminChange(queryClient),
  });
}

export function useAddAdmin() {
  const client = useSellerClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, fullName }: { email: string; fullName: string }) =>
      callSellerAdmin(client, { action: 'add_admin', email, fullName }),
    onSuccess: () => afterAdminChange(queryClient),
  });
}

/** A new set of 10 recovery codes for the signed-in admin; returned once. */
export async function newRecoveryCodes(client: SellerClient): Promise<string[]> {
  return rows(client.rpc('seller_new_recovery_codes'));
}
