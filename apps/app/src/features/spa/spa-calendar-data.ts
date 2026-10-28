import {
  SPA_BOOKING_STATUSES,
  SPA_PAID_WITH,
  addDays,
  baghdadMoment,
  resolveSetting,
  type SpaBookingStatus,
  type SpaPaidWith,
} from '@gym/core';
import type { LocalizedNames } from '@gym/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { MEMBERS_QUERY } from '@/features/members/member-data';
import {
  DEBTS_QUERY,
  INVOICES_QUERY,
  TODAY_PAYMENTS_QUERY,
} from '@/features/payments/payment-data';
import { paymentJson, type PaymentInput } from '@/features/payments/payment-input';
import { requireClient, useActingClient } from '@/features/staff/admin-data';

// The spa calendar's server calls (step 6e), with the acting staff member's own session: bookings of
// a branch (spa.view); booking, moving, the statuses and arriving through the booking functions
// (spa.book; charging also payments.create). supabase/migrations/20261028600000_spa_bookings.sql.

export const SPA_BOOKINGS_QUERY = 'spa-bookings';
const SPA_SETTINGS_QUERY = 'spa-settings';
const SPA_BALANCES_QUERY = 'spa-balances';
/** How often the calendar is read again while it is open, as others book too. */
const REFRESH_MS = 30_000;

export interface SpaBooking extends LocalizedNames {
  readonly id: string;
  readonly memberId: string;
  readonly serviceId: string;
  readonly roomId: string;
  readonly place: number;
  readonly therapistId: string | null;
  readonly price: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly roomFreeAt: string;
  readonly paidWith: SpaPaidWith;
  readonly walkIn: boolean;
  readonly note: string | null;
  readonly status: SpaBookingStatus;
  readonly statusNote: string | null;
  readonly invoiceId: string | null;
  /** Null: a member the staff member can't see (no members.view). */
  readonly member: {
    readonly fullName: string;
    readonly memberNumber: number;
    readonly phone: string | null;
    readonly isGuest: boolean;
  } | null;
}

function oneOf<T extends string>(values: readonly T[], value: string, fallback: T): T {
  return values.find((each) => each === value) ?? fallback;
}

const BOOKING_COLUMNS =
  'id, member_id, service_id, room_id, place, therapist_id, name_ckb, name_en, name_ar, price, starts_at, ends_at, room_free_at, paid_with, walk_in, note, status, status_note, invoice_id, members (full_name, member_number, phone, is_guest)';

interface BookingRow {
  readonly id: string;
  readonly member_id: string;
  readonly service_id: string;
  readonly room_id: string;
  readonly place: number;
  readonly therapist_id: string | null;
  readonly name_ckb: string;
  readonly name_en: string | null;
  readonly name_ar: string | null;
  readonly price: number;
  readonly starts_at: string;
  readonly ends_at: string;
  readonly room_free_at: string;
  readonly paid_with: string;
  readonly walk_in: boolean;
  readonly note: string | null;
  readonly status: string;
  readonly status_note: string | null;
  readonly invoice_id: string | null;
  /** Null: RLS hides the member from staff without members.view. */
  readonly members: {
    readonly full_name: string;
    readonly member_number: number;
    readonly phone: string | null;
    readonly is_guest: boolean;
  } | null;
}

function toBooking(row: BookingRow): SpaBooking {
  const member = row.members;
  return {
    id: row.id,
    memberId: row.member_id,
    serviceId: row.service_id,
    roomId: row.room_id,
    place: row.place,
    therapistId: row.therapist_id,
    nameCkb: row.name_ckb,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    price: row.price,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    roomFreeAt: row.room_free_at,
    paidWith: oneOf(SPA_PAID_WITH, row.paid_with, 'pay'),
    walkIn: row.walk_in,
    note: row.note,
    status: oneOf(SPA_BOOKING_STATUSES, row.status, 'booked'),
    statusNote: row.status_note,
    invoiceId: row.invoice_id,
    member: member
      ? {
          fullName: member.full_name,
          memberNumber: member.member_number,
          phone: member.phone,
          isGuest: member.is_guest,
        }
      : null,
  };
}

/** A branch's bookings from the first day to the last (Baghdad), all statuses. */
export function useSpaBookings(branchId: string, firstDay: string, lastDay: string) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [SPA_BOOKINGS_QUERY, actor, branchId, firstDay, lastDay],
    enabled: client !== undefined && branchId !== '',
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<SpaBooking[]> => {
      const { data, error } = await requireClient(client)
        .from('spa_bookings')
        .select(BOOKING_COLUMNS)
        .eq('branch_id', branchId)
        .gte('starts_at', baghdadMoment(firstDay, 0).toISOString())
        .lt('starts_at', baghdadMoment(addDays(lastDay, 1), 0).toISOString())
        .order('starts_at');
      if (error) throw error;
      return data.map(toBooking);
    },
  });
}

export interface SpaCalendarSettings {
  readonly fromHour: number;
  readonly untilHour: number;
  readonly slotMinutes: number;
}

/** The calendar's hours and step in a branch (the branch's own settings, else the gym's). */
export function useSpaCalendarSettings(branchId: string) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [SPA_SETTINGS_QUERY, actor, branchId],
    enabled: client !== undefined,
    queryFn: async (): Promise<SpaCalendarSettings> => {
      const { data, error } = await requireClient(client)
        .from('settings')
        .select('branch_id, key, value')
        .in('key', ['spa.calendar_from_hour', 'spa.calendar_until_hour', 'spa.slot_minutes']);
      if (error) throw error;
      const branch = branchId === '' ? null : branchId;
      return {
        fromHour: resolveSetting('spa.calendar_from_hour', data, branch),
        untilHour: resolveSetting('spa.calendar_until_hour', data, branch),
        slotMinutes: resolveSetting('spa.slot_minutes', data, branch),
      };
    },
  });
}

export interface SpaBalance {
  /** package: a spa package of the member; plan: sessions of one of their subscriptions. */
  readonly source: 'package' | 'plan';
  /** The package or subscription it is booked with. */
  readonly id: string;
  readonly serviceId: string;
  readonly names: LocalizedNames;
  readonly left: number;
  readonly total: number;
  /** YYYY-MM-DD; null: no limit. */
  readonly startsOn: string;
  readonly endsOn: string | null;
  /** plan: the subscription is still active (not cancelled, replaced...). */
  readonly active: boolean;
}

/** What a member may book with besides paying: their packages and their plans' spa sessions. */
export function useSpaBalances(memberId: string | null) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [SPA_BALANCES_QUERY, actor, memberId],
    enabled: client !== undefined && memberId !== null,
    queryFn: async (): Promise<SpaBalance[]> => {
      const db = requireClient(client);
      const [packages, sessions] = await Promise.all([
        db
          .from('member_spa_packages')
          .select(
            'id, service_id, name_ckb, name_en, name_ar, session_count, starts_on, expires_on, sessions_left',
          )
          .eq('member_id', memberId ?? '')
          .order('starts_on'),
        db
          .from('subscription_spa_sessions')
          .select(
            'subscription_id, service_id, session_count, sessions_left, subscriptions!inner (member_id, status, start_date, end_date, name_ckb, name_en, name_ar)',
          )
          .eq('subscriptions.member_id', memberId ?? ''),
      ]);
      if (packages.error) throw packages.error;
      if (sessions.error) throw sessions.error;
      return [
        ...packages.data.map((row): SpaBalance => ({
          source: 'package',
          id: row.id,
          serviceId: row.service_id,
          names: { nameCkb: row.name_ckb, nameEn: row.name_en, nameAr: row.name_ar },
          left: row.sessions_left ?? 0,
          total: row.session_count,
          startsOn: row.starts_on,
          endsOn: row.expires_on,
          active: true,
        })),
        ...sessions.data.map((row): SpaBalance => ({
          source: 'plan',
          id: row.subscription_id,
          serviceId: row.service_id,
          names: {
            nameCkb: row.subscriptions.name_ckb,
            nameEn: row.subscriptions.name_en,
            nameAr: row.subscriptions.name_ar,
          },
          left: row.sessions_left ?? 0,
          total: row.session_count,
          startsOn: row.subscriptions.start_date,
          endsOn: row.subscriptions.end_date,
          active: row.subscriptions.status === 'active',
        })),
      ];
    },
  });
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [
        SPA_BOOKINGS_QUERY,
        SPA_BALANCES_QUERY,
        INVOICES_QUERY,
        DEBTS_QUERY,
        TODAY_PAYMENTS_QUERY,
      ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
}

export interface NewBooking {
  readonly id: string;
  readonly branchId: string;
  readonly memberId: string;
  readonly serviceId: string;
  readonly startsAt: Date;
  readonly roomId: string;
  readonly therapistId: string | null;
  readonly paidWith: SpaPaidWith;
  /** The package or subscription it uses, for paidWith package or plan. */
  readonly sourceId: string | null;
  readonly walkIn: boolean;
  readonly note: string | null;
}

export function useBookSpa() {
  const { client } = useActingClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (booking: NewBooking) => {
      const { error } = await requireClient(client).rpc('book_spa', {
        p_id: booking.id,
        p_branch_id: booking.branchId,
        p_member_id: booking.memberId,
        p_service_id: booking.serviceId,
        p_starts_at: booking.startsAt.toISOString(),
        p_room_id: booking.roomId,
        p_paid_with: booking.paidWith,
        p_walk_in: booking.walkIn,
        ...(booking.therapistId === null ? {} : { p_therapist_id: booking.therapistId }),
        ...(booking.paidWith === 'package' && booking.sourceId
          ? { p_member_package_id: booking.sourceId }
          : {}),
        ...(booking.paidWith === 'plan' && booking.sourceId
          ? { p_subscription_id: booking.sourceId }
          : {}),
        ...(booking.note ? { p_note: booking.note } : {}),
      });
      if (error) throw error;
    },
    onSettled: refresh,
  });
}

export function useMoveSpaBooking() {
  const { client } = useActingClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (move: {
      bookingId: string;
      startsAt: Date;
      roomId: string;
      therapistId: string | null;
    }) => {
      const { error } = await requireClient(client).rpc('move_spa_booking', {
        p_booking_id: move.bookingId,
        p_starts_at: move.startsAt.toISOString(),
        p_room_id: move.roomId,
        ...(move.therapistId === null ? {} : { p_therapist_id: move.therapistId }),
      });
      if (error) throw error;
    },
    onSettled: refresh,
  });
}

export function useSetSpaBookingStatus() {
  const { client } = useActingClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (change: {
      bookingId: string;
      status: 'confirmed' | 'cancelled' | 'no_show' | 'completed';
      note: string | null;
    }) => {
      const { error } = await requireClient(client).rpc('set_spa_booking_status', {
        p_booking_id: change.bookingId,
        p_status: change.status,
        ...(change.note ? { p_note: change.note } : {}),
      });
      if (error) throw error;
    },
    onSettled: refresh,
  });
}

const arrivalSchema = z.object({
  invoice_number: z.string().optional(),
  receipt_number: z.string().nullable().optional(),
});

/** Marks the arrival; a booking to pay gets its invoice. The answer is its number, if one was made. */
export function useArriveSpaBooking() {
  const { client } = useActingClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (arrival: {
      bookingId: string;
      invoiceId: string;
      payment: PaymentInput | null;
    }): Promise<string | null> => {
      const { data, error } = await requireClient(client).rpc('arrive_spa_booking', {
        p_booking_id: arrival.bookingId,
        p_invoice_id: arrival.invoiceId,
        ...(arrival.payment ? { p_payment: paymentJson(arrival.payment) } : {}),
      });
      if (error) throw error;
      return arrivalSchema.parse(data).invoice_number ?? null;
    },
    onSettled: refresh,
  });
}

/** Adds a guest; the answer is their id. */
export function useCreateGuest() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (guest: {
      branchId: string;
      fullName: string;
      gender: 'male' | 'female';
      phone: string;
    }) => {
      const id = crypto.randomUUID();
      const { error } = await requireClient(client).rpc('create_guest', {
        p_id: id,
        p_branch_id: guest.branchId,
        p_full_name: guest.fullName,
        p_gender: guest.gender,
        p_phone: guest.phone,
      });
      if (error) throw error;
      return id;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [MEMBERS_QUERY] }),
  });
}

/** A member's bookings in the branches the staff member reaches (spa.view), the latest first. */
export function useMemberSpaBookings(memberId: string, enabled: boolean) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [SPA_BOOKINGS_QUERY, actor, 'member', memberId],
    enabled: client !== undefined && enabled,
    queryFn: async (): Promise<SpaBooking[]> => {
      const { data, error } = await requireClient(client)
        .from('spa_bookings')
        .select(BOOKING_COLUMNS)
        .eq('member_id', memberId)
        .order('starts_at', { ascending: false })
        .limit(MEMBER_BOOKINGS_SHOWN);
      if (error) throw error;
      return data.map(toBooking);
    },
  });
}

/** How many of a member's bookings their page shows. */
const MEMBER_BOOKINGS_SHOWN = 20;

/** Sells a package (spa.book and payments.create); the answer is the invoice's number. */
export function useSellSpaPackage() {
  const { client } = useActingClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (sale: {
      memberPackageId: string;
      invoiceId: string;
      packageId: string;
      memberId: string;
      branchId: string;
      payment: PaymentInput | null;
    }): Promise<string | null> => {
      const { data, error } = await requireClient(client).rpc('sell_spa_package', {
        p_member_package_id: sale.memberPackageId,
        p_invoice_id: sale.invoiceId,
        p_package_id: sale.packageId,
        p_member_id: sale.memberId,
        p_branch_id: sale.branchId,
        ...(sale.payment ? { p_payment: paymentJson(sale.payment) } : {}),
      });
      if (error) throw error;
      return arrivalSchema.parse(data).invoice_number ?? null;
    },
    onSettled: refresh,
  });
}

export interface SpaCommission {
  readonly therapistId: string;
  readonly fullName: string;
  readonly bookings: number;
  readonly total: number;
  readonly commission: number;
}

/** Each staff member's completed bookings and commission in a branch, from one day to another. */
export function useSpaCommissions(branchId: string, from: string, until: string, enabled: boolean) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [SPA_BOOKINGS_QUERY, actor, 'commissions', branchId, from, until],
    enabled: client !== undefined && enabled && branchId !== '',
    queryFn: async (): Promise<SpaCommission[]> => {
      const { data, error } = await requireClient(client).rpc('spa_commissions', {
        p_branch_id: branchId,
        p_from: from,
        p_until: until,
      });
      if (error) throw error;
      return data.map((row) => ({
        therapistId: row.therapist_id,
        fullName: row.full_name,
        bookings: row.bookings,
        total: row.total,
        commission: row.commission,
      }));
    },
  });
}
