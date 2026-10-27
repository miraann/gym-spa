import type { Database } from '@gym/db';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useSellerClient } from '@/lib/client';
import { PanelError, fromDatabase } from '@/lib/errors';

// Support access (MT-4c): a gym's members, read only while the gym lets Click Group in. Every
// member read writes a row the gym sees (support_reads), so these queries never read again by
// themselves: no refetch on focus or on a timer, no retry. A search runs only when sent.

type Functions = Database['public']['Functions'];

export type SupportGymRow = Functions['seller_support_gyms']['Returns'][number];
export type SupportReadRow = Omit<
  Functions['seller_support_reads']['Returns'][number],
  'member_id'
> & {
  readonly member_id: string | null;
};

/** Read once, when asked: each read is recorded. */
const READ_ONCE = {
  staleTime: Infinity,
  gcTime: 0,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  refetchOnMount: true,
  retry: false,
} as const;

const memberRowSchema = z.object({
  id: z.string(),
  member_number: z.number(),
  full_name: z.string(),
  phone: z.string().nullable(),
  status: z.string(),
  membership: z.string(),
  branch_code: z.string(),
});
export type SupportMemberRow = z.infer<typeof memberRowSchema>;

const memberSchema = z.object({
  member: z.object({
    id: z.string(),
    member_number: z.number(),
    full_name: z.string(),
    gender: z.string(),
    phone: z.string().nullable(),
    birth_date: z.string().nullable(),
    status: z.string(),
    status_reason: z.string().nullable(),
    created_at: z.string(),
    membership: z.string(),
    branch_code: z.string().nullable(),
  }),
  subscriptions: z.array(
    z.object({
      id: z.string(),
      name_ckb: z.string(),
      kind: z.string(),
      start_date: z.string(),
      end_date: z.string().nullable(),
      status: z.string(),
      visit_count: z.number().nullable(),
      used_visits: z.number().nullable(),
    }),
  ),
  invoices: z.array(
    z.object({
      id: z.string(),
      number: z.string(),
      total: z.number(),
      paid: z.number(),
      due: z.number(),
      refunded: z.number(),
      created_at: z.string(),
      voided_at: z.string().nullable(),
    }),
  ),
  payments: z.array(
    z.object({
      id: z.string(),
      number: z.string(),
      kind: z.string(),
      method: z.string(),
      amount: z.number(),
      created_at: z.string(),
      voided_at: z.string().nullable(),
    }),
  ),
  cards: z.array(
    z.object({
      id: z.string(),
      uid: z.string(),
      status: z.string(),
      end_reason: z.string().nullable(),
      created_at: z.string(),
    }),
  ),
  visits: z.array(
    z.object({
      id: z.string(),
      checked_in_at: z.string(),
      checked_out_at: z.string().nullable(),
      method: z.string(),
      override_reason: z.string().nullable(),
      voided_at: z.string().nullable(),
      branch_code: z.string().nullable(),
    }),
  ),
});
export type SupportMember = z.infer<typeof memberSchema>;

/** Parses a function's answer; a shape we don't expect is a bug, not a user error. */
function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new PanelError('unexpected', { cause: parsed.error });
  return parsed.data;
}

/** The gyms that let Click Group in now (no member data: refreshed like the other screens). */
export function useSupportGyms() {
  const client = useSellerClient();
  return useQuery({
    queryKey: ['support', 'gyms'],
    refetchInterval: 60_000,
    queryFn: async (): Promise<SupportGymRow[]> => {
      const { data, error } = await client.rpc('seller_support_gyms');
      if (error) throw fromDatabase(error);
      return data;
    },
  });
}

/** What Click Group read in a gym (no member data). */
export function useSupportReads(gymId: string) {
  const client = useSellerClient();
  return useQuery({
    queryKey: ['support', 'reads', gymId],
    queryFn: async (): Promise<SupportReadRow[]> => {
      const { data, error } = await client.rpc('seller_support_reads', { p_gym_id: gymId });
      if (error) throw fromDatabase(error);
      return data;
    },
  });
}

/** A gym's members matching `search` (null: not sent yet, nothing is read). Recorded. */
export function useSupportMembers(gymId: string, search: string | null) {
  const client = useSellerClient();
  return useQuery({
    queryKey: ['support', 'members', gymId, search],
    enabled: search !== null,
    ...READ_ONCE,
    queryFn: async (): Promise<SupportMemberRow[]> => {
      const { data, error } = await client.rpc('seller_support_members', {
        p_gym_id: gymId,
        ...(search ? { p_search: search } : {}),
      });
      if (error) throw fromDatabase(error);
      return parse(z.array(memberRowSchema), data);
    },
  });
}

/** One member of a gym. Recorded. */
export function useSupportMember(gymId: string, memberId: string) {
  const client = useSellerClient();
  return useQuery({
    queryKey: ['support', 'member', gymId, memberId],
    ...READ_ONCE,
    queryFn: async (): Promise<SupportMember> => {
      const { data, error } = await client.rpc('seller_support_member', {
        p_gym_id: gymId,
        p_member_id: memberId,
      });
      if (error) throw fromDatabase(error);
      return parse(memberSchema, data);
    },
  });
}
