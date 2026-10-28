import { lockerFitsGender, type CheckinAnswer } from '@gym/core';
import { Button } from '@gym/ui/components/button';
import { KeyRoundIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePermission } from '@/features/auth/use-permissions';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useGiveLocker, useLockerMap } from './locker-data';
import { lockerErrorKey } from './locker-errors';

/**
 * On the check-in result: one tap gives the member the first free daily locker of their zone, tied
 * to the visit, so checking out releases it. Hidden when they hold a daily locker already, none is
 * free, or the staff member may not give lockers.
 */
export function CheckinLocker({
  answer,
  branchId,
}: {
  readonly answer: CheckinAnswer;
  readonly branchId: string;
}) {
  const { t } = useTranslation('lockers');
  const mayAssign = usePermission('lockers.assign');
  const { online, readOnly } = useAdminWriteState();
  const allowed = answer.result === 'allowed' || answer.result === 'warning';
  const map = useLockerMap(mayAssign && allowed ? branchId : '');
  const give = useGiveLocker();
  const [assignmentId] = useState(() => crypto.randomUUID());
  const [given, setGiven] = useState<string | null>(null);
  const member = answer.member;
  if (!mayAssign || !allowed || member === null || answer.attendance_id === null || !map.data)
    return null;

  if (given !== null)
    return (
      <p className="flex items-center justify-center gap-2 text-2xl" data-testid="checkin-locker">
        <KeyRoundIcon aria-hidden className="size-6" />
        {t('checkin.given', { number: given })}
      </p>
    );

  const holders = [...map.data.holders.values()];
  if (holders.some((each) => each.kind === 'daily' && each.member?.id === member.id)) return null;
  const free = map.data.lockers.find(
    (locker) =>
      locker.kind === 'daily' &&
      locker.outOfOrderNote === null &&
      !map.data.holders.has(locker.id) &&
      lockerFitsGender(locker.zone, member.gender),
  );
  if (!free) return null;
  const attendanceId = answer.attendance_id;

  return (
    <Button
      size="lg"
      variant="secondary"
      className="h-12"
      data-testid="checkin-locker"
      disabled={!online || readOnly || give.isPending}
      onClick={() => {
        give.mutate(
          { assignmentId, lockerId: free.id, memberId: member.id, attendanceId },
          {
            onSuccess: () => {
              setGiven(free.number);
            },
            onError: (thrown) => {
              toast.error(t(`errors.${lockerErrorKey(thrown, 'give_at_checkin')}`));
            },
          },
        );
      }}
    >
      <KeyRoundIcon aria-hidden />
      {t('checkin.give', { number: free.number })}
    </Button>
  );
}
