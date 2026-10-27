import {
  DURATION_UNITS,
  PLAN_KINDS,
  SUBSCRIPTION_STATUSES,
  type DurationUnit,
  type FreezeDates,
  type PlanKind,
  type SubscriptionStatus,
} from '@gym/core';
import type { LocalizedNames } from '@gym/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { paymentJson, type PaymentInput } from '@/features/payments/payment-input';
import { requireClient, useActingClient } from '@/features/staff/admin-data';

// A member's subscriptions and what they owe (step 3d), and selling a subscription with
// sell_subscription() (step 3c: the subscription, invoice, first payment and installments together).

export const SUBSCRIPTIONS_QUERY = 'subscriptions';
export const BALANCES_QUERY = 'balances';

export interface SubscriptionFreeze extends FreezeDates {
  readonly id: string;
}

export interface MemberSubscription extends LocalizedNames {
  readonly id: string;
  readonly planId: string;
  readonly kind: PlanKind;
  readonly durationUnit: DurationUnit | null;
  readonly durationCount: number | null;
  readonly visitCount: number | null;
  readonly price: number;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly status: SubscriptionStatus;
  readonly maxFreezeDays: number;
  readonly freezes: readonly SubscriptionFreeze[];
  /** Shown only to staff who see the invoice (payments.view and its branch). */
  readonly invoiceNumber: string | null;
}

function oneOf<T extends string>(values: readonly T[], value: string, fallback: T): T {
  return values.find((each) => each === value) ?? fallback;
}

/** The member's subscriptions, the latest start first. */
export function useMemberSubscriptions(memberId: string) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [SUBSCRIPTIONS_QUERY, actor, memberId],
    enabled: client !== undefined,
    queryFn: async (): Promise<MemberSubscription[]> => {
      const { data, error } = await requireClient(client)
        .from('subscriptions')
        .select(
          'id, plan_id, name_ckb, name_en, name_ar, kind, duration_unit, duration_count, visit_count, price, start_date, end_date, status, max_freeze_days, created_at, invoice_items (invoices (number)), subscription_freezes (id, start_date, end_date, ended_on)',
        )
        .eq('member_id', memberId)
        .order('start_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        planId: row.plan_id,
        nameCkb: row.name_ckb,
        nameEn: row.name_en,
        nameAr: row.name_ar,
        kind: oneOf(PLAN_KINDS, row.kind, 'time'),
        durationUnit:
          row.duration_unit === null ? null : oneOf(DURATION_UNITS, row.duration_unit, 'month'),
        durationCount: row.duration_count,
        visitCount: row.visit_count,
        price: row.price,
        startDate: row.start_date,
        endDate: row.end_date,
        status: oneOf(SUBSCRIPTION_STATUSES, row.status, 'active'),
        maxFreezeDays: row.max_freeze_days,
        freezes: row.subscription_freezes.map((freeze) => ({
          id: freeze.id,
          startDate: freeze.start_date,
          endDate: freeze.end_date,
          endedOn: freeze.ended_on,
        })),
        // The types call the invoice always there, but RLS hides it without payments.view.
        invoiceNumber:
          (row.invoice_items[0]?.invoices as { number: string } | null | undefined)?.number ?? null,
      }));
    },
  });
}

/** What the member owes, on the invoices the staff member sees (payments.view). */
export function useMemberDebt(memberId: string, enabled: boolean) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [BALANCES_QUERY, actor, memberId],
    enabled: enabled && client !== undefined,
    queryFn: async (): Promise<number> => {
      const { data, error } = await requireClient(client)
        .from('invoice_balances')
        .select('due')
        .eq('member_id', memberId);
      if (error) throw error;
      return data.reduce((sum, row) => sum + (row.due ?? 0), 0);
    },
  });
}

/** A sale as sell_subscription() takes it; the ids are made once per sale by the screen. */
export interface Sale {
  readonly subscriptionId: string;
  readonly invoiceId: string;
  readonly memberId: string;
  readonly planId: string;
  readonly branchId: string;
  /** YYYY-MM-DD. */
  readonly startDate: string;
  /** The price the screen showed. */
  readonly price: number;
  readonly discount: number;
  readonly discountReason: string | null;
  readonly payment: PaymentInput | null;
  readonly installments: readonly {
    readonly id: string;
    readonly dueDate: string;
    readonly amount: number;
  }[];
}

const saleResultSchema = z.object({
  invoice_id: z.string(),
  invoice_number: z.string(),
  receipt_number: z.string().nullable(),
  total: z.number(),
  paid: z.number(),
  change_given: z.number(),
  end_date: z.string().nullable(),
});

export type SaleResult = z.infer<typeof saleResultSchema>;

export function useSellSubscription() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sale: Sale): Promise<SaleResult> => {
      const payment = sale.payment;
      const { data, error } = await requireClient(client).rpc('sell_subscription', {
        p_subscription_id: sale.subscriptionId,
        p_invoice_id: sale.invoiceId,
        p_member_id: sale.memberId,
        p_plan_id: sale.planId,
        p_branch_id: sale.branchId,
        p_start_date: sale.startDate,
        p_price: sale.price,
        p_discount: sale.discount,
        ...(sale.discountReason ? { p_discount_reason: sale.discountReason } : {}),
        ...(payment ? { p_payment: paymentJson(payment) } : {}),
        ...(sale.installments.length > 0
          ? {
              p_installments: sale.installments.map((each) => ({
                id: each.id,
                due_date: each.dueDate,
                amount: each.amount,
              })),
            }
          : {}),
      });
      if (error) throw error;
      return saleResultSchema.parse(data);
    },
    onSettled: () =>
      Promise.all(
        [SUBSCRIPTIONS_QUERY, BALANCES_QUERY].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  });
}
