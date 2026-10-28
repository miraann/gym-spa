import { daysBetween } from '@gym/core';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@gym/ui/components/empty';
import { FieldError } from '@gym/ui/components/field';
import { Skeleton } from '@gym/ui/components/skeleton';
import { HandCoinsIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DateSelectField } from '@/components/date-select-field';
import { RequirePermission } from '@/components/no-access';
import { useFormat } from '@/lib/format';
import { useBaghdadToday } from '@/lib/use-today';
import { useBranchChoice } from '@/lib/use-branch-choice';
import { useSpaCommissions } from './spa-calendar-data';
import { SpaError } from './spa-error';
import { spaErrorKey } from './spa-errors';
import { BranchSelect } from '@/components/branch-select';

/** /spa/commissions (spa.manage): each spa staff member's completed bookings and commission. */
export function SpaCommissionsPage() {
  return (
    <RequirePermission permission="spa.manage">
      <Commissions />
    </RequirePermission>
  );
}

function Commissions() {
  const { t } = useTranslation('spa');
  const format = useFormat();
  const today = useBaghdadToday();
  const { branchId, setBranchId, active, loaded } = useBranchChoice();
  // This month so far.
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [until, setUntil] = useState(today);
  const valid = daysBetween(from, until) >= 0 && daysBetween(from, until) <= 366;
  const report = useSpaCommissions(branchId, from, until, valid);
  const rows = report.data ?? [];
  const sum = (key: 'bookings' | 'total' | 'commission') =>
    rows.reduce((total, row) => total + row[key], 0);
  const years = [Number(today.slice(0, 4)) - 1, Number(today.slice(0, 4))];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('commissions.title')} description={t('commissions.description')} />
      <div className="flex flex-wrap items-end gap-3">
        <BranchSelect
          label={t('setup.branch')}
          branchId={branchId}
          active={active}
          onChange={setBranchId}
        />
        <DateSelectField
          label={t('commissions.from')}
          value={from}
          onChange={setFrom}
          years={years}
          allowEmpty={false}
        />
        <DateSelectField
          label={t('commissions.until')}
          value={until}
          onChange={setUntil}
          years={years}
          allowEmpty={false}
        />
      </div>
      {!valid && <FieldError>{t('commissions.range')}</FieldError>}
      {loaded && branchId === '' ? (
        <p className="text-muted-foreground">{t('setup.noBranch')}</p>
      ) : report.isError ? (
        <SpaError error={spaErrorKey(report.error, 'load_commissions')} />
      ) : report.isPending ? (
        <Skeleton className="h-48 rounded-3xl" />
      ) : rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HandCoinsIcon />
            </EmptyMedia>
            <EmptyDescription>{t('commissions.empty')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-3xl bg-card">
          <table className="w-full text-start" data-testid="spa-commissions">
            <thead>
              <tr className="border-b text-sm text-muted-foreground">
                <th scope="col" className="px-4 py-3 text-start font-normal">
                  {t('commissions.therapist')}
                </th>
                <th scope="col" className="px-4 py-3 text-end font-normal">
                  {t('commissions.bookings')}
                </th>
                <th scope="col" className="px-4 py-3 text-end font-normal">
                  {t('commissions.total')}
                </th>
                <th scope="col" className="px-4 py-3 text-end font-normal">
                  {t('commissions.commission')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.therapistId} className="border-b last:border-b-0">
                  <th scope="row" className="px-4 py-3 text-start font-normal">
                    {row.fullName}
                  </th>
                  <td className="px-4 py-3 text-end tabular-nums">{format.number(row.bookings)}</td>
                  <td className="px-4 py-3 text-end tabular-nums">{format.money(row.total)}</td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {format.money(row.commission)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/40">
                <th scope="row" className="px-4 py-3 text-start">
                  {t('commissions.sum')}
                </th>
                <td className="px-4 py-3 text-end tabular-nums">
                  {format.number(sum('bookings'))}
                </td>
                <td className="px-4 py-3 text-end tabular-nums">{format.money(sum('total'))}</td>
                <td className="px-4 py-3 text-end text-lg tabular-nums">
                  {format.money(sum('commission'))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
