import { addDays, baghdadMoment, daysBetween } from '@gym/core';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { Skeleton } from '@gym/ui/components/skeleton';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DateSelectField } from '@/components/date-select-field';
import { RequirePermission } from '@/components/no-access';
import { usePermission } from '@/features/auth/use-permissions';
import { useBranchChoice } from '@/lib/use-branch-choice';
import { BranchSelect } from '@/components/branch-select';
import { useBaghdadToday } from '@/lib/use-today';
import { ClockList } from './clock-list';
import { useClockRecords } from './hr-data';
import { HrError } from './hr-error';
import { hrErrorKey } from './hr-errors';

/** /hr/clock (hr.view): who came and went in a branch, from one day to another. */
export function ClockPage() {
  return (
    <RequirePermission permission="hr.view">
      <Clock />
    </RequirePermission>
  );
}

function Clock() {
  const { t } = useTranslation('hr');
  const today = useBaghdadToday();
  const mayManage = usePermission('hr.manage');
  const { branchId, setBranchId, active, loaded } = useBranchChoice();
  const [from, setFrom] = useState(addDays(today, -6));
  const [until, setUntil] = useState(today);
  const valid = daysBetween(from, until) >= 0 && daysBetween(from, until) <= 366;
  const records = useClockRecords(
    { branchId },
    baghdadMoment(from, 0).toISOString(),
    baghdadMoment(addDays(until, 1), 0).toISOString(),
    valid && branchId !== '',
  );
  const years = [Number(today.slice(0, 4)) - 1, Number(today.slice(0, 4))];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('clock.title')} description={t('clock.description')} />
      <div className="flex flex-wrap items-end gap-3">
        <BranchSelect
          label={t('clock.branch')}
          branchId={branchId}
          active={active}
          onChange={setBranchId}
        />
        <DateSelectField
          label={t('clock.from')}
          value={from}
          onChange={setFrom}
          years={years}
          allowEmpty={false}
        />
        <DateSelectField
          label={t('clock.until')}
          value={until}
          onChange={setUntil}
          years={years}
          allowEmpty={false}
        />
      </div>
      {loaded && branchId === '' ? null : records.isError ? (
        <HrError error={hrErrorKey(records.error, 'load_clock')} />
      ) : records.isPending ? (
        <Skeleton className="h-48 rounded-3xl" />
      ) : (
        <div className="rounded-3xl bg-card p-4">
          <ClockList records={records.data} showNames mayManage={mayManage} />
        </div>
      )}
    </div>
  );
}
