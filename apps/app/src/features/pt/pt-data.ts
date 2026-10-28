import type { LocalizedNames } from '@gym/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  DEBTS_QUERY,
  INVOICES_QUERY,
  TODAY_PAYMENTS_QUERY,
} from '@/features/payments/payment-data';
import { paymentJson, type PaymentInput } from '@/features/payments/payment-input';
import { requireClient, useActingClient } from '@/features/staff/admin-data';

// Personal training's server calls (step 7f), with the acting staff member's own session: packages
// are the gym's, a member's packages and sessions need members.view; the PT functions change them.
// supabase/migrations/20261028900000_personal_training.sql.

export const PT_QUERY = 'pt';

export interface PtPackage extends LocalizedNames {
  readonly id: string;
  readonly sessionCount: number;
  readonly price: number;
  readonly validDays: number | null;
  readonly isActive: boolean;
}

export type PtPackageDraft = Omit<PtPackage, 'id'>;

export function usePtPackages() {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [PT_QUERY, actor, 'packages'],
    enabled: client !== undefined,
    queryFn: async (): Promise<PtPackage[]> => {
      const { data, error } = await requireClient(client)
        .from('pt_packages')
        .select('id, name_ckb, name_en, name_ar, session_count, price, valid_days, is_active');
      if (error) throw error;
      return data
        .map((row) => ({
          id: row.id,
          nameCkb: row.name_ckb,
          nameEn: row.name_en,
          nameAr: row.name_ar,
          sessionCount: row.session_count,
          price: row.price,
          validDays: row.valid_days,
          isActive: row.is_active,
        }))
        .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.price - b.price);
    },
  });
}

export function useSavePtPackage() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pack }: { id: string | null; pack: PtPackageDraft }) => {
      const { error } = await requireClient(client).rpc('save_pt_package', {
        p_id: id ?? crypto.randomUUID(),
        p_name_ckb: pack.nameCkb,
        p_session_count: pack.sessionCount,
        p_price: pack.price,
        p_is_active: pack.isActive,
        ...(pack.nameEn ? { p_name_en: pack.nameEn } : {}),
        ...(pack.nameAr ? { p_name_ar: pack.nameAr } : {}),
        ...(pack.validDays === null ? {} : { p_valid_days: pack.validDays }),
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [PT_QUERY] }),
  });
}

export interface MemberPtPackage extends LocalizedNames {
  readonly id: string;
  readonly memberId: string;
  readonly memberName: string | null;
  readonly trainerId: string;
  readonly branchId: string;
  readonly sessionCount: number;
  readonly left: number;
  readonly startsOn: string;
  readonly expiresOn: string | null;
}

const MEMBER_PACKAGE_COLUMNS =
  'id, member_id, trainer_id, branch_id, name_ckb, name_en, name_ar, session_count, starts_on, expires_on, sessions_left, members (full_name)';

interface MemberPackageRow {
  readonly id: string;
  readonly member_id: string;
  readonly trainer_id: string;
  readonly branch_id: string;
  readonly name_ckb: string;
  readonly name_en: string | null;
  readonly name_ar: string | null;
  readonly session_count: number;
  readonly starts_on: string;
  readonly expires_on: string | null;
  readonly sessions_left: number | null;
  readonly members: { readonly full_name: string } | null;
}

function toMemberPackage(row: MemberPackageRow): MemberPtPackage {
  return {
    id: row.id,
    memberId: row.member_id,
    memberName: row.members?.full_name ?? null,
    trainerId: row.trainer_id,
    branchId: row.branch_id,
    nameCkb: row.name_ckb,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    sessionCount: row.session_count,
    left: row.sessions_left ?? 0,
    startsOn: row.starts_on,
    expiresOn: row.expires_on,
  };
}

/** A member's PT packages, the latest first. */
export function useMemberPtPackages(memberId: string) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [PT_QUERY, actor, 'member', memberId],
    enabled: client !== undefined,
    queryFn: async (): Promise<MemberPtPackage[]> => {
      const { data, error } = await requireClient(client)
        .from('member_pt_packages')
        .select(MEMBER_PACKAGE_COLUMNS)
        .eq('member_id', memberId)
        .order('starts_on', { ascending: false });
      if (error) throw error;
      return data.map(toMemberPackage);
    },
  });
}

/** Packages with sessions left that haven't expired: the trainers' clients. */
export function useOpenPtPackages(today: string) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [PT_QUERY, actor, 'open', today],
    enabled: client !== undefined,
    queryFn: async (): Promise<MemberPtPackage[]> => {
      const { data, error } = await requireClient(client)
        .from('member_pt_packages')
        .select(MEMBER_PACKAGE_COLUMNS)
        .or(`expires_on.is.null,expires_on.gte.${today}`)
        .order('starts_on', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data.map(toMemberPackage).filter((each) => each.left > 0);
    },
  });
}

const saleSchema = z.object({ invoice_number: z.string().optional() });

export function useSellPtPackage() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sale: {
      memberPackageId: string;
      invoiceId: string;
      packageId: string;
      memberId: string;
      trainerId: string;
      branchId: string;
      payment: PaymentInput | null;
    }) => {
      const { data, error } = await requireClient(client).rpc('sell_pt_package', {
        p_member_package_id: sale.memberPackageId,
        p_invoice_id: sale.invoiceId,
        p_package_id: sale.packageId,
        p_member_id: sale.memberId,
        p_trainer_id: sale.trainerId,
        p_branch_id: sale.branchId,
        ...(sale.payment ? { p_payment: paymentJson(sale.payment) } : {}),
      });
      if (error) throw error;
      return saleSchema.parse(data).invoice_number ?? null;
    },
    onSettled: () =>
      Promise.all(
        [PT_QUERY, INVOICES_QUERY, DEBTS_QUERY, TODAY_PAYMENTS_QUERY].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  });
}

const loggedSchema = z.object({ sessions_left: z.number() });

export function useLogPtSession() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      memberPackageId: string;
      branchId: string;
      status: 'done' | 'no_show';
      note: string | null;
    }) => {
      const { data, error } = await requireClient(client).rpc('log_pt_session', {
        p_id: input.id,
        p_member_package_id: input.memberPackageId,
        p_branch_id: input.branchId,
        p_status: input.status,
        ...(input.note ? { p_note: input.note } : {}),
      });
      if (error) throw error;
      return loggedSchema.parse(data).sessions_left;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [PT_QUERY] }),
  });
}

export interface TrainerReportRow {
  readonly staffId: string;
  readonly fullName: string;
  readonly classes: number;
  readonly classEarning: number;
  readonly ptSessions: number;
  readonly ptEarning: number;
  readonly clockMinutes: number;
}

/** Per trainer: classes taught, PT sessions, hours on the clock and earnings (hr.view). */
export function useTrainerReport(branchId: string, from: string, until: string, enabled: boolean) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [PT_QUERY, actor, 'report', branchId, from, until],
    enabled: client !== undefined && enabled && branchId !== '',
    queryFn: async (): Promise<TrainerReportRow[]> => {
      const { data, error } = await requireClient(client).rpc('trainer_report', {
        p_branch_id: branchId,
        p_from: from,
        p_until: until,
      });
      if (error) throw error;
      return data.map((row) => ({
        staffId: row.staff_id,
        fullName: row.full_name,
        classes: row.classes,
        classEarning: row.class_earning,
        ptSessions: row.pt_sessions,
        ptEarning: row.pt_earning,
        clockMinutes: row.clock_minutes,
      }));
    },
  });
}
