import { PAYMENT_METHODS, type PaymentMethod } from '@gym/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { requireClient, useActingClient } from '@/features/staff/admin-data';
import { BALANCES_QUERY, SUBSCRIPTIONS_QUERY } from '@/features/subscriptions/subscription-data';
import { paymentJson, type PaymentInput } from './payment-input';

// The money screens' server calls (step 3e): a member's invoices with their payments and
// installments (payments.view and the invoice's branch), what members owe, today's payments, and
// paying, voiding, giving money back and making an invoice for something else. The balances come
// from the database's views, never worked out here.

export const INVOICES_QUERY = 'invoices';
export const DEBTS_QUERY = 'debts';
export const TODAY_PAYMENTS_QUERY = 'today-payments';

export interface InvoicePayment {
  readonly id: string;
  readonly number: string;
  readonly kind: 'payment' | 'refund';
  readonly method: PaymentMethod;
  readonly amount: number;
  readonly currency: 'IQD' | 'USD';
  readonly foreignAmount: number | null;
  readonly exchangeRate: number | null;
  readonly changeGiven: number;
  readonly reference: string | null;
  readonly reason: string | null;
  readonly createdAt: string;
  readonly voidReason: string | null;
}

export interface InvoiceInstallment {
  readonly id: string;
  readonly dueDate: string;
  readonly amount: number;
  readonly paid: number;
}

export interface MemberInvoice {
  readonly id: string;
  readonly number: string;
  readonly createdAt: string;
  readonly total: number;
  readonly discount: number;
  readonly items: readonly string[];
  readonly voidReason: string | null;
  readonly paid: number;
  readonly refunded: number;
  readonly due: number;
  readonly payments: readonly InvoicePayment[];
  readonly installments: readonly InvoiceInstallment[];
}

function method(value: string): PaymentMethod {
  return PAYMENT_METHODS.find((each) => each === value) ?? 'cash';
}

/** A member's invoices (the newest first) that the staff member may see, with their balances. */
export function useMemberInvoices(memberId: string, enabled: boolean) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [INVOICES_QUERY, actor, memberId],
    enabled: enabled && client !== undefined,
    queryFn: async (): Promise<MemberInvoice[]> => {
      const acting = requireClient(client);
      const [invoices, balances] = await Promise.all([
        acting
          .from('invoices')
          .select(
            'id, number, created_at, total, discount, void_reason, invoice_items (description_ckb), payments (id, number, kind, method, amount, currency, foreign_amount, exchange_rate, change_given, reference, reason, created_at, void_reason)',
          )
          .eq('member_id', memberId)
          .order('created_at', { ascending: false }),
        acting
          .from('invoice_balances')
          .select('invoice_id, paid, refunded, due')
          .eq('member_id', memberId),
      ]);
      if (invoices.error) throw invoices.error;
      if (balances.error) throw balances.error;
      const ids = invoices.data.map((invoice) => invoice.id);
      const installments =
        ids.length === 0
          ? { data: [], error: null }
          : await acting
              .from('installment_balances')
              .select('installment_id, invoice_id, due_date, amount, paid')
              .in('invoice_id', ids)
              .order('due_date');
      if (installments.error) throw installments.error;
      const byInvoice = new Map(balances.data.map((row) => [row.invoice_id, row]));
      return invoices.data.map((invoice) => {
        const balance = byInvoice.get(invoice.id);
        return {
          id: invoice.id,
          number: invoice.number,
          createdAt: invoice.created_at,
          total: invoice.total,
          discount: invoice.discount,
          items: invoice.invoice_items.map((item) => item.description_ckb),
          voidReason: invoice.void_reason,
          paid: balance?.paid ?? 0,
          refunded: balance?.refunded ?? 0,
          due: balance?.due ?? 0,
          payments: invoice.payments
            .map((payment) => ({
              id: payment.id,
              number: payment.number,
              kind: payment.kind === 'refund' ? ('refund' as const) : ('payment' as const),
              method: method(payment.method),
              amount: payment.amount,
              currency: payment.currency === 'USD' ? ('USD' as const) : ('IQD' as const),
              foreignAmount: payment.foreign_amount,
              exchangeRate: payment.exchange_rate,
              changeGiven: payment.change_given ?? 0,
              reference: payment.reference,
              reason: payment.reason,
              createdAt: payment.created_at,
              voidReason: payment.void_reason,
            }))
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
          installments: installments.data
            .filter((row) => row.invoice_id === invoice.id)
            .map((row) => ({
              id: row.installment_id ?? '',
              dueDate: row.due_date ?? '',
              amount: row.amount ?? 0,
              paid: row.paid ?? 0,
            })),
        };
      });
    },
  });
}

export interface MemberDebt {
  readonly memberId: string;
  readonly fullName: string;
  readonly memberNumber: number;
  readonly due: number;
  readonly owedNow: number;
  readonly nextDueDate: string | null;
}

/** Who owes what on the invoices the staff member sees: most owed now first. */
export function useDebts() {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [DEBTS_QUERY, actor],
    enabled: client !== undefined,
    queryFn: async (): Promise<MemberDebt[]> => {
      const { data, error } = await requireClient(client)
        .from('member_debts')
        .select('member_id, full_name, member_number, due, owed_now, next_due_date')
        .order('owed_now', { ascending: false })
        .order('due', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data.map((row) => ({
        memberId: row.member_id ?? '',
        fullName: row.full_name ?? '',
        memberNumber: row.member_number ?? 0,
        due: row.due ?? 0,
        owedNow: row.owed_now ?? 0,
        nextDueDate: row.next_due_date,
      }));
    },
  });
}

export interface TodayPayment {
  readonly id: string;
  readonly number: string;
  readonly kind: 'payment' | 'refund';
  readonly method: PaymentMethod;
  readonly amount: number;
  readonly createdAt: string;
  readonly voided: boolean;
  readonly memberId: string;
  readonly memberName: string;
}

/** The payments and refunds taken since `since` (the start of today in Baghdad), newest first. */
export function useTodayPayments(since: string) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [TODAY_PAYMENTS_QUERY, actor, since],
    enabled: client !== undefined,
    queryFn: async (): Promise<TodayPayment[]> => {
      const { data, error } = await requireClient(client)
        .from('payments')
        .select(
          'id, number, kind, method, amount, created_at, voided_at, member_id, members (full_name)',
        )
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        number: row.number,
        kind: row.kind === 'refund' ? 'refund' : 'payment',
        method: method(row.method),
        amount: row.amount,
        createdAt: row.created_at,
        voided: row.voided_at !== null,
        memberId: row.member_id,
        // The types call the member always there, but RLS hides members without members.view.
        memberName: (row.members as { full_name: string } | null)?.full_name ?? '',
      }));
    },
  });
}

/** After any change to money: every list that shows it. */
function useRefreshMoney() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [INVOICES_QUERY, DEBTS_QUERY, TODAY_PAYMENTS_QUERY, BALANCES_QUERY, SUBSCRIPTIONS_QUERY].map(
        (key) => queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
}

const paymentResultSchema = z.object({
  receipt_number: z.string(),
  amount: z.number(),
  change_given: z.number(),
  due: z.number().nullable(),
});

export function usePayInvoice() {
  const { client } = useActingClient();
  const refresh = useRefreshMoney();
  return useMutation({
    mutationFn: async (input: { invoiceId: string; branchId: string; payment: PaymentInput }) => {
      const { data, error } = await requireClient(client).rpc('pay_invoice', {
        p_invoice_id: input.invoiceId,
        p_branch_id: input.branchId,
        p_payment: paymentJson(input.payment),
      });
      if (error) throw error;
      return paymentResultSchema.parse(data);
    },
    onSettled: refresh,
  });
}

export function useRefundInvoice() {
  const { client } = useActingClient();
  const refresh = useRefreshMoney();
  return useMutation({
    mutationFn: async (input: {
      refundId: string;
      invoiceId: string;
      branchId: string;
      amount: number;
      method: PaymentMethod;
      reason: string;
    }) => {
      const { data, error } = await requireClient(client).rpc('refund_invoice', {
        p_refund_id: input.refundId,
        p_invoice_id: input.invoiceId,
        p_branch_id: input.branchId,
        p_amount: input.amount,
        p_method: input.method,
        p_reason: input.reason,
      });
      if (error) throw error;
      return paymentResultSchema.parse(data);
    },
    onSettled: refresh,
  });
}

export function useVoid() {
  const { client } = useActingClient();
  const refresh = useRefreshMoney();
  return useMutation({
    mutationFn: async (input: { kind: 'invoice' | 'payment'; id: string; reason: string }) => {
      const acting = requireClient(client);
      const { error } =
        input.kind === 'invoice'
          ? await acting.rpc('void_invoice', { p_invoice_id: input.id, p_reason: input.reason })
          : await acting.rpc('void_payment', { p_payment_id: input.id, p_reason: input.reason });
      if (error) throw error;
    },
    onSettled: refresh,
  });
}

export const CHARGE_KINDS = ['card_replacement', 'other'] as const;
export type ChargeKind = (typeof CHARGE_KINDS)[number];

const chargeResultSchema = z.object({ invoice_number: z.string() });

export function useChargeMember() {
  const { client } = useActingClient();
  const refresh = useRefreshMoney();
  return useMutation({
    mutationFn: async (input: {
      invoiceId: string;
      memberId: string;
      branchId: string;
      kind: ChargeKind;
      text: string;
      amount: number;
      payment: PaymentInput | null;
    }) => {
      const { data, error } = await requireClient(client).rpc('charge_member', {
        p_invoice_id: input.invoiceId,
        p_member_id: input.memberId,
        p_branch_id: input.branchId,
        p_kind: input.kind,
        p_description: input.text,
        p_amount: input.amount,
        ...(input.payment ? { p_payment: paymentJson(input.payment) } : {}),
      });
      if (error) throw error;
      return chargeResultSchema.parse(data);
    },
    onSettled: refresh,
  });
}
