import { minuteAsBaghdadTime } from '@gym/core';
import { Button } from '@gym/ui/components/button';
import { TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePermission } from '@/features/auth/use-permissions';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import { useLockerSettings, useReleaseDailyLockers } from './locker-data';
import { LockerError } from './locker-error';
import { lockerErrorKey, type LockerErrorKey } from './locker-errors';
import type { MapLocker } from './locker-look';

/**
 * The end-of-day list: daily lockers from an earlier day and rentals past their last paid day, not
 * given back. The daily ones are released every night at the gym's set time (pg_cron on the cloud),
 * and staff can still release them together with one button (before that time, or on the offline
 * edition until its server runs the same job).
 */
export function NotReturnedList({
  branchId,
  lockers,
  onOpen,
}: {
  readonly branchId: string;
  readonly lockers: readonly MapLocker[];
  readonly onOpen: (lockerId: string) => void;
}) {
  const { t } = useTranslation('lockers');
  const format = useFormat();
  const { online, readOnly } = useAdminWriteState();
  const mayAssign = usePermission('lockers.assign');
  const releaseAll = useReleaseDailyLockers();
  const settings = useLockerSettings(branchId);
  const [error, setError] = useState<LockerErrorKey | null>(null);
  const overdue = lockers.filter((each) => each.status === 'overdue');
  const daily = overdue.filter((each) => each.holder?.kind === 'daily').length;
  if (overdue.length === 0) return null;

  return (
    <section
      className="flex flex-col gap-3 rounded-3xl bg-warning/10 p-4"
      aria-labelledby="not-returned-title"
      data-testid="not-returned"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="not-returned-title" className="flex items-center gap-2 text-lg">
          <TriangleAlertIcon aria-hidden className="size-5 text-warning" />
          {t('notReturned.title', { count: format.number(overdue.length) })}
        </h2>
        {mayAssign && daily > 0 && (
          <Button
            variant="outline"
            disabled={!online || readOnly || releaseAll.isPending}
            onClick={() => {
              setError(null);
              releaseAll.mutate(branchId, {
                onSuccess: (count) => {
                  toast.success(t('notReturned.done', { count: format.number(count) }));
                },
                onError: (thrown) => {
                  setError(lockerErrorKey(thrown, 'release_daily'));
                },
              });
            }}
          >
            {t('notReturned.releaseDaily', { count: format.number(daily) })}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {t('notReturned.description')}
        {settings.isSuccess &&
          ` ${t('notReturned.nightly', { time: format.time(minuteAsBaghdadTime(settings.data.nightReleaseMinute)) })}`}
      </p>
      <ul className="flex flex-wrap gap-2">
        {overdue.map((each) => (
          <li key={each.locker.id}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onOpen(each.locker.id);
              }}
            >
              <span dir="ltr" className="tabular-nums">
                {each.locker.number}
              </span>
              {each.holder?.member && <span>{each.holder.member.fullName}</span>}
            </Button>
          </li>
        ))}
      </ul>
      <LockerError error={error} />
    </section>
  );
}
