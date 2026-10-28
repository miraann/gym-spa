import { localizedName } from '@gym/i18n';
import { printPage } from '@gym/platform';
import { Badge } from '@gym/ui/components/badge';
import { CircleCheckIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useDeviceGym } from '@/features/auth/auth-context';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import type { CashReport } from './cash-data';

// A cash register shift's report (step 8e): on the screen, and printed on an 80mm roll or an A4
// page through #print-root, like receipts (styles.css).

export type CashReportSize = '80mm' | 'a4';

const PAGE: Record<CashReportSize, string> = {
  '80mm': '@page { size: 80mm auto; margin: 3mm; }',
  a4: '@page { size: A4; margin: 15mm; }',
};

/** Counted minus expected, as a status: even, over or short, with the amount. */
export function DifferenceBadge({
  difference,
  currency,
}: {
  readonly difference: number;
  readonly currency: 'IQD' | 'USD';
}) {
  const { t } = useTranslation('cash');
  const format = useFormat();
  if (difference === 0) {
    return (
      <Badge variant="success">
        <CircleCheckIcon aria-hidden="true" />
        {t('report.even')}
      </Badge>
    );
  }
  return (
    <Badge variant={difference > 0 ? 'warning' : 'destructive'}>
      <TriangleAlertIcon aria-hidden="true" />
      {t(difference > 0 ? 'report.over' : 'report.short')}{' '}
      <span dir="ltr" className="tabular-nums">
        {format.money(Math.abs(difference), currency)}
      </span>
    </Badge>
  );
}

function Line({
  label,
  value,
  strong,
}: {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={strong ? undefined : 'text-muted-foreground print:text-black'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/** The report's lines; `printed` drops the badges (black and white). */
export function CashReportView({
  report,
  printed = false,
}: {
  readonly report: CashReport;
  readonly printed?: boolean;
}) {
  const { t } = useTranslation('cash');
  const { t: ts } = useTranslation('subscriptions');
  const format = useFormat();
  const iqd = (amount: number) => format.money(amount, 'IQD');
  const usd = (amount: number) => format.money(amount, 'USD');
  const payments = report.methods.filter((each) => each.kind === 'payment');
  const refunds = report.methods.filter((each) => each.kind === 'refund');
  const hasUsd =
    report.opening_usd !== 0 ||
    report.cash_in_usd !== 0 ||
    report.cash_out_usd !== 0 ||
    payments.some((each) => each.usd !== null && each.usd !== 0) ||
    (report.counted_usd ?? 0) !== 0 ||
    (report.expected_usd ?? 0) !== 0;
  const method = (each: CashReport['methods'][number]) =>
    t('report.methodLine', {
      method: ts(`sell.methods.${each.method}`),
      count: format.number(each.count),
    });
  const difference = (value: number | null, currency: 'IQD' | 'USD') =>
    value === null ? null : printed ? (
      <span dir="ltr">{format.money(value, currency)}</span>
    ) : (
      <DifferenceBadge difference={value} currency={currency} />
    );

  return (
    <div className="flex flex-col gap-3" data-testid="cash-report">
      <section className="flex flex-col gap-1">
        <Line
          label={t('report.openedBy', {
            name: report.opened_by ?? '',
            time: format.dateTime(report.opened_at),
          })}
          value=""
        />
        {report.closed_at && (
          <Line
            label={t('report.closedBy', {
              name: report.closed_by ?? '',
              time: format.dateTime(report.closed_at),
            })}
            value=""
          />
        )}
        <Line label={t('report.float')} value={iqd(report.opening_iqd)} />
        {report.opening_usd !== 0 && <Line label="" value={usd(report.opening_usd)} />}
      </section>

      <section
        className="flex flex-col gap-1 border-t border-dashed pt-2"
        data-testid="cash-methods"
      >
        <span>{t('report.payments')}</span>
        {payments.length === 0 ? (
          <span className="text-sm text-muted-foreground">{t('report.noPayments')}</span>
        ) : (
          payments.map((each) => (
            <Line
              key={each.method}
              label={method(each)}
              value={
                each.usd === null ? iqd(each.amount) : `${iqd(each.amount)} (${usd(each.usd)})`
              }
            />
          ))
        )}
        {refunds.length > 0 && (
          <>
            <span>{t('report.refunds')}</span>
            {refunds.map((each) => (
              <Line key={each.method} label={method(each)} value={iqd(-each.amount)} />
            ))}
          </>
        )}
        {report.cash_in_iqd !== 0 && (
          <Line label={t('report.cashIn')} value={iqd(report.cash_in_iqd)} />
        )}
        {report.cash_in_usd !== 0 && (
          <Line label={t('report.cashIn')} value={usd(report.cash_in_usd)} />
        )}
        {report.cash_out_iqd !== 0 && (
          <Line label={t('report.cashOut')} value={iqd(-report.cash_out_iqd)} />
        )}
        {report.cash_out_usd !== 0 && (
          <Line label={t('report.cashOut')} value={usd(-report.cash_out_usd)} />
        )}
      </section>

      <section className="flex flex-col gap-1 border-t border-dashed pt-2">
        {report.expected_iqd === null ? (
          <span className="text-sm text-muted-foreground">{t('report.blind')}</span>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th scope="col" className="sr-only">
                  {t('report.title')}
                </th>
                <th scope="col" className="text-end font-normal text-muted-foreground">
                  {t('report.iqd')}
                </th>
                {hasUsd && (
                  <th scope="col" className="text-end font-normal text-muted-foreground">
                    {t('report.usd')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="text-start font-normal">
                  {t('report.expected')}
                </th>
                <td className="text-end tabular-nums" data-expected-iqd>
                  {iqd(report.expected_iqd)}
                </td>
                {hasUsd && (
                  <td className="text-end tabular-nums">{usd(report.expected_usd ?? 0)}</td>
                )}
              </tr>
              {report.counted_iqd !== null && (
                <tr>
                  <th scope="row" className="text-start font-normal">
                    {t('report.counted')}
                  </th>
                  <td className="text-end tabular-nums">{iqd(report.counted_iqd)}</td>
                  {hasUsd && (
                    <td className="text-end tabular-nums">{usd(report.counted_usd ?? 0)}</td>
                  )}
                </tr>
              )}
              {report.difference_iqd !== null && (
                <tr>
                  <th scope="row" className="text-start font-normal">
                    {t('report.difference')}
                  </th>
                  <td className="text-end" data-difference-iqd>
                    {difference(report.difference_iqd, 'IQD')}
                  </td>
                  {hasUsd && (
                    <td className="text-end">{difference(report.difference_usd, 'USD')}</td>
                  )}
                </tr>
              )}
            </tbody>
          </table>
        )}
        {report.close_note && <Line label={t('report.note')} value={report.close_note} />}
      </section>
    </div>
  );
}

/** Prints a shift's report, then calls onDone. */
export function CashReportPrint({
  report,
  branchName,
  size,
  onDone,
}: {
  readonly report: CashReport;
  readonly branchName: string;
  readonly size: CashReportSize;
  readonly onDone: () => void;
}) {
  const { t } = useTranslation('cash');
  const { language } = usePreferences();
  const gym = useDeviceGym();

  useEffect(() => {
    let cancelled = false;
    const finish = () => {
      onDone();
    };
    window.addEventListener('afterprint', finish, { once: true });
    // The fonts first, or the report prints in the fallback font.
    void document.fonts.ready.then(() => {
      if (!cancelled) printPage();
    });
    return () => {
      cancelled = true;
      window.removeEventListener('afterprint', finish);
    };
  }, [onDone]);

  return createPortal(
    <div id="print-root">
      <style>{PAGE[size]}</style>
      <article
        className={
          size === '80mm'
            ? 'flex w-[74mm] flex-col gap-2 bg-white text-[11px] leading-snug text-black'
            : 'flex flex-col gap-4 bg-white text-sm text-black'
        }
      >
        <header className="flex flex-col items-center gap-1 text-center">
          {gym && <span className="text-sm">{localizedName(gym, language)}</span>}
          <span>{branchName}</span>
          <span>{t('report.title')}</span>
        </header>
        <CashReportView report={report} printed />
      </article>
    </div>,
    document.body,
  );
}
