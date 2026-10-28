import { daysBetween } from '@gym/core';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { FieldError } from '@gym/ui/components/field';
import { Skeleton } from '@gym/ui/components/skeleton';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BranchSelect } from '@/components/branch-select';
import { DateSelectField } from '@/components/date-select-field';
import { RequirePermission } from '@/components/no-access';
import { useBranchChoice } from '@/lib/use-branch-choice';
import { useFormat } from '@/lib/format';
import { useBaghdadToday } from '@/lib/use-today';
import { useTrainerReport } from './pt-data';
import { PtError } from './pt-error';
import { ptErrorKey } from './pt-errors';

/** /trainers/report (hr.view): per trainer, classes, PT sessions, time worked and pay. */
export function TrainerReportPage() {
  return (
    <RequirePermission permission="hr.view">
      <Report />
    </RequirePermission>
  );
}

function Report() {
  const { t } = useTranslation('pt');
  const format = useFormat();
  const today = useBaghdadToday();
  const { branchId, setBranchId, active } = useBranchChoice();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [until, setUntil] = useState(today);
  const valid = daysBetween(from, until) >= 0 && daysBetween(from, until) <= 366;
  const report = useTrainerReport(branchId, from, until, valid);
  const years = [Number(today.slice(0, 4)) - 1, Number(today.slice(0, 4))];
  const hours = (minutes: number) =>
    t('report.hoursValue', {
      hours: format.number(Math.floor(minutes / 60)),
      minutes: String(minutes % 60).padStart(2, '0'),
    });
  const rows = report.data ?? [];
  const sum = (key: 'classes' | 'classEarning' | 'ptSessions' | 'ptEarning' | 'clockMinutes') =>
    rows.reduce((total, row) => total + row[key], 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('report.title')} description={t('report.description')} />
      <div className="flex flex-wrap items-end gap-3">
        <BranchSelect
          label={t('report.branch')}
          branchId={branchId}
          active={active}
          onChange={setBranchId}
        />
        <DateSelectField
          label={t('report.from')}
          value={from}
          onChange={setFrom}
          years={years}
          allowEmpty={false}
        />
        <DateSelectField
          label={t('report.until')}
          value={until}
          onChange={setUntil}
          years={years}
          allowEmpty={false}
        />
      </div>
      {!valid && <FieldError>{t('report.range')}</FieldError>}
      {report.isError ? (
        <PtError error={ptErrorKey(report.error, 'load_report')} />
      ) : report.isPending ? (
        <Skeleton className="h-48 rounded-3xl" />
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">{t('report.empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-3xl bg-card">
          <table className="w-full text-sm" data-testid="trainer-report">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th scope="col" className="px-4 py-3 text-start font-normal">
                  {t('report.trainer')}
                </th>
                <th scope="col" className="px-4 py-3 text-end font-normal">
                  {t('report.classes')}
                </th>
                <th scope="col" className="px-4 py-3 text-end font-normal">
                  {t('report.classEarning')}
                </th>
                <th scope="col" className="px-4 py-3 text-end font-normal">
                  {t('report.ptSessions')}
                </th>
                <th scope="col" className="px-4 py-3 text-end font-normal">
                  {t('report.ptEarning')}
                </th>
                <th scope="col" className="px-4 py-3 text-end font-normal">
                  {t('report.hours')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.staffId} className="border-b last:border-b-0">
                  <th scope="row" className="px-4 py-3 text-start font-normal">
                    {row.fullName}
                  </th>
                  <td className="px-4 py-3 text-end tabular-nums">{format.number(row.classes)}</td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {format.money(row.classEarning)}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {format.number(row.ptSessions)}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">{format.money(row.ptEarning)}</td>
                  <td className="px-4 py-3 text-end tabular-nums" dir="ltr">
                    {hours(row.clockMinutes)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/40">
                <th scope="row" className="px-4 py-3 text-start">
                  {t('report.total')}
                </th>
                <td className="px-4 py-3 text-end tabular-nums">{format.number(sum('classes'))}</td>
                <td className="px-4 py-3 text-end tabular-nums">
                  {format.money(sum('classEarning'))}
                </td>
                <td className="px-4 py-3 text-end tabular-nums">
                  {format.number(sum('ptSessions'))}
                </td>
                <td className="px-4 py-3 text-end tabular-nums">
                  {format.money(sum('ptEarning'))}
                </td>
                <td className="px-4 py-3 text-end tabular-nums" dir="ltr">
                  {hours(sum('clockMinutes'))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
