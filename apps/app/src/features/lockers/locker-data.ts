import {
  LOCKER_RELEASE_REASONS,
  compareLockerNumbers,
  resolveSetting,
  type LockerKind,
  type LockerReleaseReason,
  type LockerZone,
} from '@gym/core';
import type { PostgrestError } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ATTENDANCE_QUERY } from '@/features/checkin/checkin-data';
import {
  DEBTS_QUERY,
  INVOICES_QUERY,
  TODAY_PAYMENTS_QUERY,
} from '@/features/payments/payment-data';
import { paymentJson, type PaymentInput } from '@/features/payments/payment-input';
import { requireClient, useActingClient } from '@/features/staff/admin-data';

// The lockers screens' server calls (Phase 5), with the acting staff member's own session: RLS
// shows lockers.view the lockers of their branches, and only the locker functions change them
// (supabase/migrations/20261028200000_lockers.sql).

export const LOCKERS_QUERY = 'lockers';
const LOCKER_SETTINGS_QUERY = 'locker-settings';
/** How often the map is read again while it is open, as others give lockers out too. */
const REFRESH_MS = 30_000;
/** A locker's history shows its last holders. */
export const LOCKER_HISTORY_SHOWN = 20;

export interface Locker {
  readonly id: string;
  readonly number: string;
  readonly zone: LockerZone;
  readonly kind: LockerKind;
  readonly outOfOrderNote: string | null;
}

export interface LockerHolder {
  readonly id: string;
  readonly lockerId: string;
  readonly kind: LockerKind;
  readonly startsOn: string;
  readonly endsOn: string | null;
  readonly assignedAt: string;
  readonly attendanceId: string | null;
  readonly releasedAt: string | null;
  readonly releaseReason: LockerReleaseReason | null;
  /** Released by the night release (no staff member), not by hand. */
  readonly releasedAutomatically: boolean;
  /** Null: a member the staff member can't see (no members.view). */
  readonly member: {
    readonly id: string;
    readonly fullName: string;
    readonly memberNumber: number;
    readonly gender: 'male' | 'female';
  } | null;
}

const HOLDER_COLUMNS =
  'id, locker_id, kind, starts_on, ends_on, assigned_at, attendance_id, released_at, released_by, release_reason, members (id, full_name, member_number, gender)';

interface HolderRow {
  readonly id: string;
  readonly locker_id: string;
  readonly kind: string;
  readonly starts_on: string;
  readonly ends_on: string | null;
  readonly assigned_at: string;
  readonly attendance_id: string | null;
  readonly released_at: string | null;
  readonly released_by: string | null;
  readonly release_reason: string | null;
  readonly members: {
    readonly id: string;
    readonly full_name: string;
    readonly member_number: number;
    readonly gender: string;
  } | null;
}

function isReleaseReason(value: string | null): value is LockerReleaseReason {
  return LOCKER_RELEASE_REASONS.some((reason) => reason === value);
}

function toHolder(row: HolderRow): LockerHolder {
  return {
    id: row.id,
    lockerId: row.locker_id,
    kind: row.kind === 'rented' ? 'rented' : 'daily',
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    assignedAt: row.assigned_at,
    attendanceId: row.attendance_id,
    releasedAt: row.released_at,
    releaseReason: isReleaseReason(row.release_reason) ? row.release_reason : null,
    releasedAutomatically: row.release_reason === 'end_of_day' && row.released_by === null,
    member: row.members
      ? {
          id: row.members.id,
          fullName: row.members.full_name,
          memberNumber: row.members.member_number,
          gender: row.members.gender === 'female' ? 'female' : 'male',
        }
      : null,
  };
}

function toZone(value: string): LockerZone {
  return value === 'men' || value === 'women' ? value : 'mixed';
}

export interface LockerMap {
  /** In map order. */
  readonly lockers: readonly Locker[];
  /** The open holder of each locker that has one, by locker id. */
  readonly holders: ReadonlyMap<string, LockerHolder>;
}

/** A branch's lockers and who holds them now. */
export function useLockerMap(branchId: string) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [LOCKERS_QUERY, actor, 'map', branchId],
    enabled: client !== undefined && branchId !== '',
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<LockerMap> => {
      const db = requireClient(client);
      const [lockers, holders] = await Promise.all([
        db
          .from('lockers')
          .select('id, number, zone, kind, out_of_order_note')
          .eq('branch_id', branchId)
          .is('deleted_at', null),
        db
          .from('locker_assignments')
          .select(HOLDER_COLUMNS)
          .eq('branch_id', branchId)
          .is('released_at', null),
      ]);
      if (lockers.error) throw lockers.error;
      if (holders.error) throw holders.error;
      return {
        lockers: lockers.data
          .map((row) => ({
            id: row.id,
            number: row.number,
            zone: toZone(row.zone),
            kind: row.kind === 'rented' ? ('rented' as const) : ('daily' as const),
            outOfOrderNote: row.out_of_order_note,
          }))
          .sort((a, b) => compareLockerNumbers(a.number, b.number)),
        holders: new Map(holders.data.map((row) => [row.locker_id, toHolder(row)])),
      };
    },
  });
}

/** A locker's last holders, newest first. */
export function useLockerHistory(lockerId: string) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [LOCKERS_QUERY, actor, 'history', lockerId],
    enabled: client !== undefined,
    queryFn: async (): Promise<LockerHolder[]> => {
      const { data, error } = await requireClient(client)
        .from('locker_assignments')
        .select(HOLDER_COLUMNS)
        .eq('locker_id', lockerId)
        .order('assigned_at', { ascending: false })
        .limit(LOCKER_HISTORY_SHOWN);
      if (error) throw error;
      return data.map(toHolder);
    },
  });
}

/** The lockers a member holds now (in the branches the staff member reaches). */
export function useMemberLockers(memberId: string, enabled: boolean) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [LOCKERS_QUERY, actor, 'member', memberId],
    enabled: enabled && client !== undefined,
    queryFn: async () => {
      const { data, error } = await requireClient(client)
        .from('locker_assignments')
        .select(`${HOLDER_COLUMNS}, lockers (number, branch_id)`)
        .eq('member_id', memberId)
        .is('released_at', null)
        .order('assigned_at');
      if (error) throw error;
      return data.map((row) => ({ ...toHolder(row), number: row.lockers.number }));
    },
  });
}

export interface LockerSettings {
  /** Dinars a month; 0: not set. */
  readonly rentMonthPrice: number;
  /** Dinars; 0: no fee. */
  readonly lostKeyFee: number;
  /** When each night the daily lockers not given back are released: minutes after midnight. */
  readonly nightReleaseMinute: number;
}

/** The locker settings that apply in a branch (the branch's own setting, else the gym's). */
export function useLockerSettings(branchId: string) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [LOCKER_SETTINGS_QUERY, actor, branchId],
    enabled: client !== undefined,
    queryFn: async (): Promise<LockerSettings> => {
      const { data, error } = await requireClient(client)
        .from('settings')
        .select('branch_id, key, value')
        .in('key', [
          'lockers.rent_month_price',
          'lockers.lost_key_fee',
          'lockers.night_release_minute',
        ]);
      if (error) throw error;
      const branch = branchId === '' ? null : branchId;
      return {
        rentMonthPrice: resolveSetting('lockers.rent_month_price', data, branch),
        lostKeyFee: resolveSetting('lockers.lost_key_fee', data, branch),
        nightReleaseMinute: resolveSetting('lockers.night_release_minute', data, branch),
      };
    },
  });
}

/** Saves the gym-wide locker settings (settings.edit, every branch). */
export function useSaveLockerSettings() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: LockerSettings) => {
      const { error } = await requireClient(client)
        .from('settings')
        .upsert(
          [
            { key: 'lockers.rent_month_price', value: settings.rentMonthPrice },
            { key: 'lockers.lost_key_fee', value: settings.lostKeyFee },
            { key: 'lockers.night_release_minute', value: settings.nightReleaseMinute },
          ],
          { onConflict: 'gym_id,branch_id,key' },
        );
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [LOCKER_SETTINGS_QUERY] }),
  });
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [LOCKERS_QUERY, ATTENDANCE_QUERY, INVOICES_QUERY, DEBTS_QUERY, TODAY_PAYMENTS_QUERY].map(
        (key) => queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
}

/** One call to a locker function; the screens refresh after it, whether it worked or not. */
function useLockerCall<Input>(
  call: (
    client: ReturnType<typeof requireClient>,
    input: Input,
  ) => PromiseLike<{ error: PostgrestError | null }>,
) {
  const { client } = useActingClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (input: Input) => {
      const { error } = await call(requireClient(client), input);
      if (error) throw error;
    },
    onSettled: refresh,
  });
}

export function useAddLockers() {
  return useLockerCall(
    (
      db,
      input: {
        branchId: string;
        zone: LockerZone;
        kind: LockerKind;
        prefix: string;
        from: number;
        to: number;
      },
    ) =>
      db.rpc('add_lockers', {
        p_branch_id: input.branchId,
        p_zone: input.zone,
        p_kind: input.kind,
        p_prefix: input.prefix,
        p_from: input.from,
        p_to: input.to,
      }),
  );
}

export function useUpdateLocker() {
  return useLockerCall(
    (db, input: { lockerId: string; number: string; zone: LockerZone; kind: LockerKind }) =>
      db.rpc('update_locker', {
        p_locker_id: input.lockerId,
        p_number: input.number,
        p_zone: input.zone,
        p_kind: input.kind,
      }),
  );
}

/** Out of order with a note, or back in order (null). */
export function useSetOutOfOrder() {
  return useLockerCall((db, input: { lockerId: string; note: string | null }) =>
    db.rpc('set_locker_out_of_order', {
      p_locker_id: input.lockerId,
      ...(input.note === null ? {} : { p_note: input.note }),
    }),
  );
}

export function useRemoveLocker() {
  return useLockerCall((db, lockerId: string) =>
    db.rpc('remove_locker', { p_locker_id: lockerId }),
  );
}

export function useGiveLocker() {
  return useLockerCall(
    (
      db,
      input: {
        assignmentId: string;
        lockerId: string;
        memberId: string;
        attendanceId: string | null;
      },
    ) =>
      db.rpc('give_locker', {
        p_assignment_id: input.assignmentId,
        p_locker_id: input.lockerId,
        p_member_id: input.memberId,
        ...(input.attendanceId ? { p_attendance_id: input.attendanceId } : {}),
      }),
  );
}

export function useReleaseLocker() {
  return useLockerCall((db, assignmentId: string) =>
    db.rpc('release_locker', { p_assignment_id: assignmentId }),
  );
}

export function useReleaseDailyLockers() {
  const { client } = useActingClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (branchId: string): Promise<number> => {
      const { data, error } = await requireClient(client).rpc('release_daily_lockers', {
        p_branch_id: branchId,
      });
      if (error) throw error;
      return data;
    },
    onSettled: refresh,
  });
}

const invoiceResultSchema = z.object({ invoice_number: z.string().optional() });

/** A locker function that may make an invoice; returns its number, if it made one. */
function useInvoiceCall<Input>(
  call: (
    client: ReturnType<typeof requireClient>,
    input: Input,
  ) => PromiseLike<{ data: unknown; error: PostgrestError | null }>,
) {
  const { client } = useActingClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (input: Input): Promise<string | null> => {
      const { data, error } = await call(requireClient(client), input);
      if (error) throw error;
      return invoiceResultSchema.parse(data).invoice_number ?? null;
    },
    onSettled: refresh,
  });
}

export function useRentLocker() {
  return useInvoiceCall(
    (
      db,
      input: {
        assignmentId: string;
        invoiceId: string;
        lockerId: string;
        memberId: string;
        startsOn: string;
        months: number;
        description: string;
        payment: PaymentInput | null;
      },
    ) =>
      db.rpc('rent_locker', {
        p_assignment_id: input.assignmentId,
        p_invoice_id: input.invoiceId,
        p_locker_id: input.lockerId,
        p_member_id: input.memberId,
        p_starts_on: input.startsOn,
        p_months: input.months,
        p_description: input.description,
        ...(input.payment ? { p_payment: paymentJson(input.payment) } : {}),
      }),
  );
}

export function useRenewLocker() {
  return useInvoiceCall(
    (
      db,
      input: {
        assignmentId: string;
        invoiceId: string;
        renewsId: string;
        months: number;
        description: string;
        payment: PaymentInput | null;
      },
    ) =>
      db.rpc('renew_locker_rental', {
        p_assignment_id: input.assignmentId,
        p_invoice_id: input.invoiceId,
        p_renews_id: input.renewsId,
        p_months: input.months,
        p_description: input.description,
        ...(input.payment ? { p_payment: paymentJson(input.payment) } : {}),
      }),
  );
}

export function useLostLockerKey() {
  return useInvoiceCall(
    (
      db,
      input: {
        assignmentId: string;
        invoiceId: string;
        description: string;
        payment: PaymentInput | null;
      },
    ) =>
      db.rpc('lost_locker_key', {
        p_assignment_id: input.assignmentId,
        p_invoice_id: input.invoiceId,
        p_description: input.description,
        ...(input.payment ? { p_payment: paymentJson(input.payment) } : {}),
      }),
  );
}
