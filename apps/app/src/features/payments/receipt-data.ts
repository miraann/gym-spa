import { PAYMENT_METHODS, type PaymentMethod } from '@gym/core';
import { LANGUAGE_CODES, type Language, type LocalizedNames } from '@gym/i18n';
import { useQuery } from '@tanstack/react-query';
import { requireClient, useActingClient } from '@/features/staff/admin-data';
import { INVOICES_QUERY } from './payment-data';

// One invoice as its receipt prints it (step 3g): the items, payments, installments and balances
// the staff member may see, the member and the branch. Printed in the member's own language
// (spec §0).

export interface ReceiptItem extends LocalizedNames {
  readonly quantity: number;
  readonly unitPrice: number;
  readonly discount: number;
  readonly total: number;
}

export interface ReceiptPayment {
  readonly number: string;
  readonly kind: 'payment' | 'refund';
  readonly method: PaymentMethod;
  readonly amount: number;
  readonly currency: 'IQD' | 'USD';
  readonly foreignAmount: number | null;
  readonly exchangeRate: number | null;
  readonly changeGiven: number;
  readonly createdAt: string;
  readonly voided: boolean;
}

export interface Receipt {
  readonly number: string;
  readonly createdAt: string;
  readonly voided: boolean;
  readonly subtotal: number;
  readonly discount: number;
  readonly total: number;
  readonly paid: number;
  readonly refunded: number;
  readonly credited: number;
  readonly due: number;
  readonly items: readonly ReceiptItem[];
  readonly payments: readonly ReceiptPayment[];
  readonly installments: readonly {
    readonly dueDate: string;
    readonly amount: number;
    readonly paid: number;
  }[];
  readonly memberName: string;
  readonly memberNumber: number;
  readonly language: Language;
  readonly branch:
    (LocalizedNames & { readonly phone: string | null; readonly address: string | null }) | null;
}

export function useReceipt(invoiceId: string | null) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [INVOICES_QUERY, actor, 'receipt', invoiceId],
    enabled: invoiceId !== null && client !== undefined,
    queryFn: async (): Promise<Receipt> => {
      const acting = requireClient(client);
      const id = invoiceId ?? '';
      const [invoice, balance, installments] = await Promise.all([
        acting
          .from('invoices')
          .select(
            'number, created_at, voided_at, subtotal, discount, total, invoice_items (description_ckb, description_en, description_ar, quantity, unit_price, discount, total), payments (number, kind, method, amount, currency, foreign_amount, exchange_rate, change_given, created_at, voided_at), members (full_name, member_number, preferred_language), branches (name_ckb, name_en, name_ar, phone, address)',
          )
          .eq('id', id)
          .single(),
        acting
          .from('invoice_balances')
          .select('paid, refunded, credited, due')
          .eq('invoice_id', id)
          .single(),
        acting
          .from('installment_balances')
          .select('due_date, amount, paid')
          .eq('invoice_id', id)
          .order('due_date'),
      ]);
      if (invoice.error) throw invoice.error;
      if (balance.error) throw balance.error;
      if (installments.error) throw installments.error;
      const row = invoice.data;
      // The types call these always there, but RLS hides them without members.view.
      const member = row.members as {
        full_name: string;
        member_number: number;
        preferred_language: string;
      } | null;
      const branch = row.branches as {
        name_ckb: string;
        name_en: string | null;
        name_ar: string | null;
        phone: string | null;
        address: string | null;
      } | null;
      return {
        number: row.number,
        createdAt: row.created_at,
        voided: row.voided_at !== null,
        subtotal: row.subtotal,
        discount: row.discount,
        total: row.total,
        paid: balance.data.paid ?? 0,
        refunded: balance.data.refunded ?? 0,
        credited: balance.data.credited ?? 0,
        due: balance.data.due ?? 0,
        items: row.invoice_items.map((item) => ({
          nameCkb: item.description_ckb,
          nameEn: item.description_en,
          nameAr: item.description_ar,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          discount: item.discount,
          total: item.total,
        })),
        payments: row.payments
          .map((payment) => ({
            number: payment.number,
            kind: payment.kind === 'refund' ? ('refund' as const) : ('payment' as const),
            method: PAYMENT_METHODS.find((each) => each === payment.method) ?? 'cash',
            amount: payment.amount,
            currency: payment.currency === 'USD' ? ('USD' as const) : ('IQD' as const),
            foreignAmount: payment.foreign_amount,
            exchangeRate: payment.exchange_rate,
            changeGiven: payment.change_given ?? 0,
            createdAt: payment.created_at,
            voided: payment.voided_at !== null,
          }))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        installments: installments.data.map((each) => ({
          dueDate: each.due_date ?? '',
          amount: each.amount ?? 0,
          paid: each.paid ?? 0,
        })),
        memberName: member?.full_name ?? '',
        memberNumber: member?.member_number ?? 0,
        language: LANGUAGE_CODES.find((code) => code === member?.preferred_language) ?? 'ckb',
        branch: branch
          ? {
              nameCkb: branch.name_ckb,
              nameEn: branch.name_en,
              nameAr: branch.name_ar,
              phone: branch.phone,
              address: branch.address,
            }
          : null,
      };
    },
  });
}
