import { formatMemberNumber } from '@gym/core';
import {
  GroupedList,
  GroupedListItem,
  GroupedListSkeleton,
  RowChevron,
} from '@gym/ui/blocks/list-group';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { Badge } from '@gym/ui/components/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@gym/ui/components/empty';
import { groupedRowClass } from '@gym/ui/lib/grouped-list';
import { Link } from '@tanstack/react-router';
import { BanIcon, HandCoinsIcon, Undo2Icon, WalletIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { RequirePermission } from '@/components/no-access';
import { useFormat } from '@/lib/format';
import { useBaghdadToday } from '@/lib/use-today';
import { useDebts, useTodayPayments } from './payment-data';
import { PaymentError } from './payment-error';
import { paymentErrorKey } from './payment-errors';

/** The start of a Baghdad day (UTC+3, no daylight saving) as an instant. */
function startOfBaghdadDay(date: string): string {
  return new Date(`${date}T00:00:00+03:00`).toISOString();
}

/** /payments (payments.view): who owes what, and the money taken today, in the staff member's branches. */
export function PaymentsPage() {
  const { t } = useTranslation('payments');
  return (
    <RequirePermission permission="payments.view">
      <div className="flex flex-col gap-6">
        <PageHeader title={t('page.title')} description={t('page.description')} />
        <Debts />
        <TodayPayments />
      </div>
    </RequirePermission>
  );
}

function Debts() {
  const { t } = useTranslation('payments');
  const format = useFormat();
  const debts = useDebts();
  return (
    <section className="flex flex-col gap-2" aria-labelledby="debts-title">
      <h2 id="debts-title" className="text-xl">
        {t('page.debts')}
      </h2>
      {debts.isPending ? (
        <GroupedListSkeleton rows={4} />
      ) : debts.isError ? (
        <PaymentError error={paymentErrorKey(debts.error, 'load_debts')} />
      ) : debts.data.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HandCoinsIcon />
            </EmptyMedia>
            <EmptyDescription>{t('page.noDebts')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <GroupedList aria-label={t('page.debts')}>
          {debts.data.map((debt) => (
            <GroupedListItem key={debt.memberId}>
              <Link
                to="/members/$memberId"
                params={{ memberId: debt.memberId }}
                className={groupedRowClass(false)}
                data-debt={debt.memberId}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{debt.fullName}</span>
                    <span className="shrink-0 tabular-nums">{format.money(debt.due)}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                    <span dir="ltr" className="tabular-nums">
                      {formatMemberNumber(debt.memberNumber)}
                    </span>
                    {debt.owedNow > 0 && (
                      <Badge variant="destructive">
                        <HandCoinsIcon aria-hidden="true" />
                        {t('page.owedNow', { amount: format.money(debt.owedNow) })}
                      </Badge>
                    )}
                    {debt.due > debt.owedNow && (
                      <span>
                        {t('page.owedLater', { amount: format.money(debt.due - debt.owedNow) })}
                      </span>
                    )}
                    {debt.nextDueDate && (
                      <span>{t('page.nextDue', { date: format.date(debt.nextDueDate) })}</span>
                    )}
                  </span>
                </span>
                <RowChevron />
              </Link>
            </GroupedListItem>
          ))}
        </GroupedList>
      )}
    </section>
  );
}

function TodayPayments() {
  const { t } = useTranslation('payments');
  const { t: ts } = useTranslation('subscriptions');
  const format = useFormat();
  const today = useBaghdadToday();
  const payments = useTodayPayments(startOfBaghdadDay(today));
  const total = (payments.data ?? [])
    .filter((payment) => !payment.voided)
    .reduce(
      (sum, payment) => sum + (payment.kind === 'refund' ? -payment.amount : payment.amount),
      0,
    );

  return (
    <section className="flex flex-col gap-2" aria-labelledby="today-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="today-title" className="text-xl">
          {t('page.today')}
        </h2>
        {payments.isSuccess && payments.data.length > 0 && (
          <span className="text-muted-foreground tabular-nums" data-testid="today-total">
            {t('page.totalToday', { amount: format.money(total) })}
          </span>
        )}
      </div>
      {payments.isPending ? (
        <GroupedListSkeleton rows={3} />
      ) : payments.isError ? (
        <PaymentError error={paymentErrorKey(payments.error, 'load_payments')} />
      ) : payments.data.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WalletIcon />
            </EmptyMedia>
            <EmptyDescription>{t('page.noPayments')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <GroupedList aria-label={t('page.today')}>
          {payments.data.map((payment) => (
            <GroupedListItem key={payment.id}>
              <Link
                to="/members/$memberId"
                params={{ memberId: payment.memberId }}
                className={groupedRowClass(false)}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{payment.memberName}</span>
                    <span className={payment.voided ? 'tabular-nums line-through' : 'tabular-nums'}>
                      {format.money(payment.kind === 'refund' ? -payment.amount : payment.amount)}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                    <span dir="ltr" className="tabular-nums">
                      {payment.number}
                    </span>
                    <span>{format.time(payment.createdAt)}</span>
                    <span>{ts(`sell.methods.${payment.method}`)}</span>
                    {payment.kind === 'refund' && (
                      <Badge variant="warning">
                        <Undo2Icon aria-hidden="true" />
                        {t('states.refund')}
                      </Badge>
                    )}
                    {payment.voided && (
                      <Badge variant="secondary">
                        <BanIcon aria-hidden="true" />
                        {t('states.voided')}
                      </Badge>
                    )}
                  </span>
                </span>
                <RowChevron />
              </Link>
            </GroupedListItem>
          ))}
        </GroupedList>
      )}
    </section>
  );
}
