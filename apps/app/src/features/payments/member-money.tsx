import { baghdadDateOf } from '@gym/core';
import { Badge } from '@gym/ui/components/badge';
import { Button } from '@gym/ui/components/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Skeleton } from '@gym/ui/components/skeleton';
import {
  BanIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
  PlusIcon,
  Undo2Icon,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '@/features/auth/use-permissions';
import type { Member } from '@/features/members/member-data';
import { useFormat } from '@/lib/format';
import { useBaghdadToday } from '@/lib/use-today';
import { ChargeDialog, PayDialog, RefundDialog, VoidDialog } from './money-dialogs';
import { useMemberInvoices, type InvoicePayment, type MemberInvoice } from './payment-data';
import { PaymentError } from './payment-error';
import { paymentErrorKey } from './payment-errors';

type InvoiceState = 'paid' | 'partly' | 'unpaid' | 'voided';

const STATE_BADGES: Readonly<
  Record<
    InvoiceState,
    { variant: 'success' | 'warning' | 'destructive' | 'secondary'; icon: LucideIcon }
  >
> = {
  paid: { variant: 'success', icon: CircleCheckIcon },
  partly: { variant: 'warning', icon: CircleDotIcon },
  unpaid: { variant: 'destructive', icon: CircleDashedIcon },
  voided: { variant: 'secondary', icon: BanIcon },
};

function invoiceState(invoice: MemberInvoice): InvoiceState {
  if (invoice.voidReason !== null) return 'voided';
  if (invoice.due <= 0) return 'paid';
  return invoice.paid > 0 ? 'partly' : 'unpaid';
}

type OpenDialog =
  | { readonly kind: 'pay' | 'refund'; readonly invoice: MemberInvoice }
  | {
      readonly kind: 'void';
      readonly target: { kind: 'invoice' | 'payment'; id: string; number: string };
    }
  | { readonly kind: 'charge' };

/**
 * A member's money on their page (step 3e, payments.view): their invoices with what was paid,
 * given back and is still owed, each payment and installment, and what staff may do: take a
 * payment, give money back, void today's mistakes, and make an invoice for something else.
 */
export function MemberMoneyCard({ member }: { readonly member: Member }) {
  const { t } = useTranslation('payments');
  const permissions = usePermissions();
  const canSee = permissions.has('payments.view');
  const invoices = useMemberInvoices(member.id, canSee);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  if (!canSee) return null;
  const canCharge = permissions.has('payments.create') && member.status !== 'archived';

  const closeDialog = (open: boolean) => {
    if (!open) setDialog(null);
  };

  return (
    <Card data-testid="member-money">
      <CardHeader>
        <CardTitle>{t('member.title')}</CardTitle>
        {canCharge && (
          <CardAction>
            <Button
              variant="outline"
              onClick={() => {
                setDialog({ kind: 'charge' });
              }}
            >
              <PlusIcon data-icon="inline-start" />
              {t('member.newInvoice')}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {invoices.isPending ? (
          <Skeleton className="h-16 rounded-xl" />
        ) : invoices.isError ? (
          <PaymentError error={paymentErrorKey(invoices.error, 'load')} />
        ) : invoices.data.length === 0 ? (
          <p className="text-muted-foreground">{t('member.empty')}</p>
        ) : (
          invoices.data.map((invoice) => (
            <InvoiceRow key={invoice.id} invoice={invoice} onOpen={setDialog} />
          ))
        )}
      </CardContent>
      {dialog?.kind === 'pay' && (
        <PayDialog invoice={dialog.invoice} open onOpenChange={closeDialog} />
      )}
      {dialog?.kind === 'refund' && (
        <RefundDialog invoice={dialog.invoice} open onOpenChange={closeDialog} />
      )}
      {dialog?.kind === 'void' && (
        <VoidDialog target={dialog.target} open onOpenChange={closeDialog} />
      )}
      {dialog?.kind === 'charge' && (
        <ChargeDialog memberId={member.id} open onOpenChange={closeDialog} />
      )}
    </Card>
  );
}

function Amount({
  label,
  value,
  testId,
}: {
  readonly label: string;
  readonly value: string;
  readonly testId?: string;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular-nums" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

function InvoiceRow({
  invoice,
  onOpen,
}: {
  readonly invoice: MemberInvoice;
  readonly onOpen: (dialog: OpenDialog) => void;
}) {
  const { t } = useTranslation('payments');
  const format = useFormat();
  const today = useBaghdadToday();
  const permissions = usePermissions();
  const state = invoiceState(invoice);
  const { variant, icon: StateIcon } = STATE_BADGES[state];
  const voided = state === 'voided';
  const madeToday = baghdadDateOf(new Date(invoice.createdAt)) === today;

  const actions: ReactNode[] = [];
  if (!voided && invoice.due > 0 && permissions.has('payments.create')) {
    actions.push(
      <Button
        key="pay"
        size="sm"
        onClick={() => {
          onOpen({ kind: 'pay', invoice });
        }}
      >
        {t('actions.pay')}
      </Button>,
    );
  }
  if (!voided && invoice.paid - invoice.refunded > 0 && permissions.has('payments.refund')) {
    actions.push(
      <Button
        key="refund"
        size="sm"
        variant="outline"
        onClick={() => {
          onOpen({ kind: 'refund', invoice });
        }}
      >
        <Undo2Icon data-icon="inline-start" />
        {t('actions.refund')}
      </Button>,
    );
  }
  if (!voided && madeToday && permissions.has('payments.void')) {
    actions.push(
      <Button
        key="void"
        size="sm"
        variant="ghost"
        className="text-destructive"
        onClick={() => {
          onOpen({
            kind: 'void',
            target: { kind: 'invoice', id: invoice.id, number: invoice.number },
          });
        }}
      >
        {t('actions.void')}
      </Button>,
    );
  }

  return (
    <details className="group rounded-xl bg-muted/50" data-invoice={invoice.number}>
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 p-3">
        <span className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-2">
            <span dir="ltr" className="font-medium tabular-nums">
              {invoice.number}
            </span>
            <Badge variant={variant} data-invoice-state={state}>
              <StateIcon aria-hidden="true" />
              {t(`states.${state}`)}
            </Badge>
          </span>
          <span className="truncate text-sm text-muted-foreground">
            {format.date(invoice.createdAt)} · {invoice.items.join('، ')}
          </span>
        </span>
        <span className="text-end tabular-nums">
          {format.money(invoice.total)}
          {!voided && invoice.due > 0 && (
            <span className="block text-sm text-destructive">
              {t('member.due')}: {format.money(invoice.due)}
            </span>
          )}
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t p-3">
        {voided && invoice.voidReason && (
          <p className="text-sm text-muted-foreground">
            {t('member.voidedBecause', { reason: invoice.voidReason })}
          </p>
        )}
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Amount label={t('member.total')} value={format.money(invoice.total)} />
          <Amount label={t('member.paid')} value={format.money(invoice.paid)} />
          {invoice.refunded > 0 && (
            <Amount label={t('member.refunded')} value={format.money(invoice.refunded)} />
          )}
          <Amount label={t('member.due')} value={format.money(invoice.due)} testId="invoice-due" />
        </dl>
        {invoice.payments.length > 0 && (
          <section className="flex flex-col gap-1">
            <h4 className="text-sm text-muted-foreground">{t('member.payments')}</h4>
            <ul className="flex flex-col gap-1">
              {invoice.payments.map((payment) => (
                <PaymentLine key={payment.id} payment={payment} onOpen={onOpen} />
              ))}
            </ul>
          </section>
        )}
        {invoice.installments.length > 0 && (
          <section className="flex flex-col gap-1">
            <h4 className="text-sm text-muted-foreground">{t('member.installments')}</h4>
            <ul className="flex flex-col gap-1 text-sm">
              {invoice.installments.map((installment) => {
                const paid = installment.paid >= installment.amount;
                const overdue = !paid && !voided && installment.dueDate < today;
                return (
                  <li
                    key={installment.id}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-2">
                      {format.date(installment.dueDate)}
                      {overdue && (
                        <Badge variant="destructive">
                          <CircleAlertIcon aria-hidden="true" />
                          {t('states.overdue')}
                        </Badge>
                      )}
                    </span>
                    <span className="tabular-nums">
                      {paid
                        ? `${format.money(installment.amount)} · ${t('member.installmentPaid')}`
                        : installment.paid > 0
                          ? t('member.installmentPart', {
                              paid: format.money(installment.paid),
                              amount: format.money(installment.amount),
                            })
                          : format.money(installment.amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {actions.length > 0 && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </details>
  );
}

function PaymentLine({
  payment,
  onOpen,
}: {
  readonly payment: InvoicePayment;
  readonly onOpen: (dialog: OpenDialog) => void;
}) {
  const { t } = useTranslation('payments');
  const { t: ts } = useTranslation('subscriptions');
  const format = useFormat();
  const today = useBaghdadToday();
  const permissions = usePermissions();
  const voided = payment.voidReason !== null;
  const canVoid =
    !voided &&
    permissions.has('payments.void') &&
    baghdadDateOf(new Date(payment.createdAt)) === today;
  const refund = payment.kind === 'refund';

  return (
    <li className="flex flex-col gap-0.5 text-sm" data-payment={payment.number}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span dir="ltr" className="tabular-nums">
            {payment.number}
          </span>
          <span className="text-muted-foreground">
            {format.dateTime(payment.createdAt)} · {ts(`sell.methods.${payment.method}`)}
          </span>
          {refund && (
            <Badge variant="warning">
              <Undo2Icon aria-hidden="true" />
              {t('states.refund')}
            </Badge>
          )}
          {voided && (
            <Badge variant="secondary">
              <BanIcon aria-hidden="true" />
              {t('states.voided')}
            </Badge>
          )}
        </span>
        <span className={voided ? 'tabular-nums line-through' : 'tabular-nums'}>
          {format.money(refund ? -payment.amount : payment.amount)}
        </span>
      </div>
      {payment.currency === 'USD' &&
        payment.foreignAmount !== null &&
        payment.exchangeRate !== null && (
          <span className="text-muted-foreground">
            {t('member.usd', {
              amount: format.number(payment.foreignAmount, 2),
              rate: format.number(payment.exchangeRate),
            })}
            {payment.changeGiven > 0 &&
              ` · ${t('member.change', { amount: format.money(payment.changeGiven) })}`}
          </span>
        )}
      {refund && payment.reason && (
        <span className="text-muted-foreground">
          {t('member.refundBecause', { reason: payment.reason })}
        </span>
      )}
      {voided && payment.voidReason && (
        <span className="text-muted-foreground">
          {t('member.voidedBecause', { reason: payment.voidReason })}
        </span>
      )}
      {canVoid && (
        <Button
          size="sm"
          variant="ghost"
          className="self-start text-destructive"
          onClick={() => {
            onOpen({
              kind: 'void',
              target: { kind: 'payment', id: payment.id, number: payment.number },
            });
          }}
        >
          {t('actions.void')}
        </Button>
      )}
    </li>
  );
}
