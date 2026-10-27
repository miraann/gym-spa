import {
  CHECKIN_REASONS,
  CHECKIN_RESULTS,
  CHECKIN_WARNINGS,
  OVERRIDABLE_REASONS,
  type CheckinAnswer,
} from '@gym/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useAuthState } from '@/features/auth/auth-context';
import { MEMBERS_QUERY } from '@/features/members/member-data';
import { SUBSCRIPTIONS_QUERY } from '@/features/subscriptions/subscription-data';
import { requireClient, useActingClient } from '@/features/staff/admin-data';

// Check-in (step 4b): the database decides (public.check_in, step 4a); the screens show its answer.

/** Visits and who is inside: refreshed after every check-in. */
export const ATTENDANCE_QUERY = 'attendance';

const answerSchema = z.object({
  result: z.enum(CHECKIN_RESULTS),
  reason: z.enum(CHECKIN_REASONS).nullable(),
  warnings: z.array(z.enum(CHECKIN_WARNINGS)),
  attendance_id: z.string().nullable(),
  checked_in_at: z.string().nullable(),
  previous_at: z.string().nullable(),
  card_status: z.enum(['stolen', 'blocked']).nullable(),
  overridden: z.enum(OVERRIDABLE_REASONS).nullable(),
  member: z
    .object({
      id: z.string(),
      full_name: z.string(),
      member_number: z.number(),
      gender: z.enum(['male', 'female']),
      status: z.enum(['active', 'suspended', 'banned', 'archived']),
      photo_updated_at: z.string().nullable(),
    })
    .nullable(),
  subscription: z
    .object({
      id: z.string(),
      name_ckb: z.string(),
      name_en: z.string().nullable(),
      name_ar: z.string().nullable(),
      kind: z.enum(['time', 'visits', 'hybrid', 'unlimited']),
      start_date: z.string(),
      end_date: z.string().nullable(),
      visit_count: z.number().nullable(),
      visits_left: z.number().nullable(),
      allowed_days: z.array(z.number()).nullable(),
      allowed_from: z.string().nullable(),
      allowed_until: z.string().nullable(),
      daily_visit_limit: z.number().nullable(),
      frozen_until: z.string().nullable(),
    })
    .nullable(),
  owed_now: z.number().nullable(),
}) satisfies z.ZodType<CheckinAnswer>;

/** Who comes in: a card as the reader read it, or a member picked by hand. */
export type CheckinWho = { readonly cardUid: string } | { readonly memberId: string };

export interface CheckinInput {
  readonly who: CheckinWho;
  readonly branchId: string;
  /** Lets a refused member in anyway (checkin.override). */
  readonly overrideNote?: string;
}

export function useCheckIn() {
  const { client } = useActingClient();
  const { device } = useAuthState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CheckinInput): Promise<CheckinAnswer> => {
      const { data, error } = await requireClient(client).rpc('check_in', {
        p_id: crypto.randomUUID(),
        p_branch_id: input.branchId,
        ...('cardUid' in input.who
          ? { p_card_uid: input.who.cardUid }
          : { p_member_id: input.who.memberId }),
        ...(device ? { p_device_id: device.id } : {}),
        ...(input.overrideNote ? { p_override_note: input.overrideNote } : {}),
      });
      if (error) throw error;
      return answerSchema.parse(data);
    },
    onSuccess: (answer) => {
      if (answer.attendance_id === null) return;
      // A visit counted: visits left, memberships and who is inside change (photos don't).
      for (const key of [ATTENDANCE_QUERY, SUBSCRIPTIONS_QUERY]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      void queryClient.invalidateQueries({
        predicate: ({ queryKey }) =>
          queryKey[0] === MEMBERS_QUERY && queryKey[2] !== 'photo' && queryKey[2] !== 'thumbnails',
      });
    },
  });
}
