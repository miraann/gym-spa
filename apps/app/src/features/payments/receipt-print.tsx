import { formatMemberNumber } from '@gym/core';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  getDirection,
  localizedName,
} from '@gym/i18n';
import { printPage } from '@gym/platform';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDeviceGym } from '@/features/auth/auth-context';
import { GymMark } from '@/components/layout/gym-mark';
import { i18n } from '@/lib/i18n';
import { usePreferences } from '@/lib/preferences';
import { useReceipt, type Receipt } from './receipt-data';
import { silentPrinter } from './receipt-printer';

// Printing an invoice's receipt (step 3g): it is drawn into #print-root, which the print styles
// show alone (styles.css), on an 80mm roll or an A4 page, in the member's language; then the
// print dialog opens (a PDF can be saved there too).

export type ReceiptSize = '80mm' | 'a4';

/** The page for each size: an 80mm roll is as long as the receipt. */
const PAGE: Record<ReceiptSize, string> = {
  '80mm': '@page { size: 80mm auto; margin: 3mm; }',
  a4: '@page { size: A4; margin: 15mm; }',
};

/** Prints the invoice once its receipt is loaded and drawn, then calls onDone. */
export function ReceiptPrint({
  invoiceId,
  size,
  onDone,
}: {
  readonly invoiceId: string;
  readonly size: ReceiptSize;
  readonly onDone: () => void;
}) {
  const receipt = useReceipt(invoiceId);
  const loaded = receipt.isSuccess;
  const failed = receipt.isError;

  useEffect(() => {
    if (failed) {
      onDone();
      return;
    }
    if (!loaded) return;
    let cancelled = false;
    const finish = () => {
      onDone();
    };
    window.addEventListener('afterprint', finish, { once: true });
    // The fonts first, or the receipt prints in the fallback font.
    void document.fonts.ready.then(() => {
      if (cancelled) return;
      const printer = silentPrinter();
      void printPage(printer).then(() => {
        // Printed without the dialog, there is no afterprint event.
        if (printer !== null && !cancelled) finish();
      });
    });
    return () => {
      cancelled = true;
      window.removeEventListener('afterprint', finish);
    };
  }, [loaded, failed, onDone]);

  if (!receipt.data) return null;
  return createPortal(
    <div id="print-root">
      <style>{PAGE[size]}</style>
      <ReceiptView receipt={receipt.data} size={size} />
    </div>,
    document.body,
  );
}

/** The receipt itself, in the member's language. */
export function ReceiptView({
  receipt,
  size,
}: {
  readonly receipt: Receipt;
  readonly size: ReceiptSize;
}) {
  const gym = useDeviceGym();
  const { digits } = usePreferences();
  const language = receipt.language;
  const t = i18n.getFixedT(language, 'payments');
  const ts = i18n.getFixedT(language, 'subscriptions');
  const options = { language, digits };
  const money = (amount: number) => formatMoney(amount, 'IQD', options);
  const narrow = size === '80mm';

  return (
    <article
      dir={getDirection(language)}
      lang={language}
      className={
        narrow
          ? 'flex w-[74mm] flex-col gap-2 bg-white text-[11px] leading-snug text-black'
          : 'flex flex-col gap-4 bg-white text-sm text-black'
      }
      data-receipt={receipt.number}
    >
      <header className="flex flex-col items-center gap-1 text-center">
        <GymMark className={narrow ? 'size-12 grayscale' : 'size-16 grayscale'} />
        {gym && (
          <span className={narrow ? 'text-sm' : 'text-lg'}>{localizedName(gym, language)}</span>
        )}
        {receipt.branch && (
          <span>
            {localizedName(receipt.branch, language)}
            {receipt.branch.phone && (
              <>
                {' · '}
                <span dir="ltr">{receipt.branch.phone}</span>
              </>
            )}
          </span>
        )}
        {receipt.branch?.address && <span>{receipt.branch.address}</span>}
      </header>

      <section className="flex flex-col gap-0.5 border-y border-dashed border-black py-1">
        <Line label={t('receipt.title')} value={<span dir="ltr">{receipt.number}</span>} />
        <Line label={t('receipt.date')} value={formatDateTime(receipt.createdAt, options)} />
        {receipt.memberNumber !== null && (
          <>
            <Line label={t('receipt.member')} value={receipt.memberName} />
            <Line
              label={t('receipt.memberNumber')}
              value={<span dir="ltr">{formatMemberNumber(receipt.memberNumber)}</span>}
            />
          </>
        )}
        {receipt.voided && <strong>{t('receipt.voided')}</strong>}
      </section>

      <section className="flex flex-col gap-1">
        {receipt.items.map((item, index) => (
          <div key={index} className="flex flex-col">
            <Line
              label={
                item.quantity > 1
                  ? `${localizedName(item, language)} × ${formatNumber(item.quantity, options)}`
                  : localizedName(item, language)
              }
              value={money(item.unitPrice * item.quantity)}
            />
            {item.discount > 0 && (
              <Line label={t('receipt.discount')} value={money(-item.discount)} />
            )}
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-0.5 border-t border-dashed border-black pt-1">
        <Line label={t('receipt.total')} value={money(receipt.total)} strong />
        <Line label={t('receipt.paid')} value={money(receipt.paid)} />
        {receipt.refunded > 0 && (
          <Line label={t('receipt.refunded')} value={money(-receipt.refunded)} />
        )}
        {receipt.credited > 0 && (
          <Line label={t('receipt.credited')} value={money(receipt.credited)} />
        )}
        <Line label={t('receipt.due')} value={money(receipt.due)} strong />
      </section>

      {receipt.payments.length > 0 && (
        <section className="flex flex-col gap-0.5">
          <span>{t('receipt.payments')}</span>
          {receipt.payments.map((payment) => (
            <div key={payment.number} className={payment.voided ? 'line-through' : undefined}>
              <Line
                label={
                  <span>
                    <span dir="ltr">{payment.number}</span>
                    {' · '}
                    {ts(`sell.methods.${payment.method}`)}
                  </span>
                }
                value={money(payment.kind === 'refund' ? -payment.amount : payment.amount)}
              />
              {payment.currency === 'USD' &&
                payment.foreignAmount !== null &&
                payment.exchangeRate !== null && (
                  <span>
                    {t('member.usd', {
                      amount: formatNumber(payment.foreignAmount, {
                        ...options,
                        fractionDigits: 2,
                      }),
                      rate: formatNumber(payment.exchangeRate, options),
                    })}
                    {payment.changeGiven > 0 &&
                      ` · ${t('member.change', { amount: money(payment.changeGiven) })}`}
                  </span>
                )}
            </div>
          ))}
        </section>
      )}

      {receipt.installments.length > 0 && (
        <section className="flex flex-col gap-0.5">
          <span>{t('receipt.installments')}</span>
          {receipt.installments.map((installment) => (
            <Line
              key={installment.dueDate}
              label={formatDate(installment.dueDate, options)}
              value={
                installment.paid >= installment.amount
                  ? `${money(installment.amount)} · ${t('member.installmentPaid')}`
                  : money(installment.amount - installment.paid)
              }
            />
          ))}
        </section>
      )}

      <footer className="flex flex-col items-center gap-0.5 border-t border-dashed border-black pt-1 text-center">
        <span>{t('receipt.thanks')}</span>
        <span>{t('receipt.printedAt', { date: formatDateTime(new Date(), options) })}</span>
      </footer>
    </article>
  );
}

function Line({
  label,
  value,
  strong = false,
}: {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly strong?: boolean;
}) {
  return (
    <div
      className={strong ? 'flex justify-between gap-2 text-[1.15em]' : 'flex justify-between gap-2'}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
