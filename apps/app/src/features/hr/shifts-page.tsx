import {
  addDays,
  baghdadClock,
  baghdadMoment,
  clockToMinute,
  minuteToClock,
  weekStartOf,
} from '@gym/core';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Button } from '@gym/ui/components/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Spinner } from '@gym/ui/components/spinner';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BranchSelect } from '@/components/branch-select';
import { DateSelectField } from '@/components/date-select-field';
import { RequirePermission } from '@/components/no-access';
import { usePermission } from '@/features/auth/use-permissions';
import { useStaffDirectory, type StaffMember } from '@/features/staff/admin-data';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useBranchChoice } from '@/lib/use-branch-choice';
import { useFormat } from '@/lib/format';
import { useBaghdadToday } from '@/lib/use-today';
import { useRemoveShift, useSaveShift, useShifts, type Shift } from './hr-data';
import { HrError } from './hr-error';
import { hrErrorKey, type HrErrorKey } from './hr-errors';

/** /hr/shifts (hr.view): a branch's planned shifts for a week, a row per staff member. */
export function ShiftsPage() {
  return (
    <RequirePermission permission="hr.view">
      <Shifts />
    </RequirePermission>
  );
}

interface Editing {
  readonly shift: Shift | null;
  readonly staffId: string;
  readonly day: string;
}

function Shifts() {
  const { t } = useTranslation('hr');
  const format = useFormat();
  const today = useBaghdadToday();
  const mayManage = usePermission('hr.manage');
  const { branchId, setBranchId, active, loaded } = useBranchChoice();
  const [weekStart, setWeekStart] = useState(weekStartOf(today));
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const shifts = useShifts(
    branchId,
    baghdadMoment(weekStart, 0).toISOString(),
    baghdadMoment(addDays(weekStart, 7), 0).toISOString(),
  );
  const directory = useStaffDirectory();
  const [editing, setEditing] = useState<Editing | null>(null);
  const staff = (directory.data ?? []).filter(
    (member) =>
      member.isActive &&
      (member.allBranches ||
        member.branchIds.includes(branchId) ||
        (shifts.data ?? []).some((shift) => shift.staffId === member.id)),
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('shifts.title')} description={t('shifts.description')} />
      <div className="flex flex-wrap items-end gap-3">
        <BranchSelect
          label={t('clock.branch')}
          branchId={branchId}
          active={active}
          onChange={setBranchId}
        />
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label={t('shifts.previousWeek')}
            onClick={() => {
              setWeekStart(addDays(weekStart, -7));
            }}
          >
            <ChevronRightIcon className="ltr:rotate-180" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            disabled={weekStart === weekStartOf(today)}
            onClick={() => {
              setWeekStart(weekStartOf(today));
            }}
          >
            {t('shifts.thisWeek')}
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={t('shifts.nextWeek')}
            onClick={() => {
              setWeekStart(addDays(weekStart, 7));
            }}
          >
            <ChevronLeftIcon className="ltr:rotate-180" aria-hidden="true" />
          </Button>
        </div>
        <h2 className="text-lg">{`${format.date(days[0] ?? weekStart)} – ${format.date(days[6] ?? weekStart)}`}</h2>
      </div>

      {loaded && branchId === '' ? null : shifts.isError ? (
        <HrError error={hrErrorKey(shifts.error, 'load_shifts')} />
      ) : shifts.isPending || directory.isPending ? (
        <Skeleton className="h-64 rounded-3xl" />
      ) : staff.length === 0 ? (
        <p className="text-muted-foreground">{t('shifts.noStaff')}</p>
      ) : (
        <div className="overflow-x-auto rounded-3xl bg-card">
          <table className="w-full min-w-[56rem] text-sm" data-testid="shifts-week">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th scope="col" className="px-3 py-2 text-start font-normal">
                  {t('shifts.staff')}
                </th>
                {days.map((day) => (
                  <th key={day} scope="col" className="px-2 py-2 text-start font-normal">
                    {format.date(baghdadMoment(day, 12 * 60), 'full')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.id} className="border-b align-top last:border-b-0">
                  <th scope="row" className="px-3 py-2 text-start font-medium">
                    {member.fullName}
                  </th>
                  {days.map((day) => {
                    const own = shifts.data.filter(
                      (shift) =>
                        shift.staffId === member.id && baghdadClock(shift.startsAt).day === day,
                    );
                    return (
                      <td
                        key={day}
                        className="px-2 py-2"
                        data-shift-cell={`${member.fullName} ${day}`}
                      >
                        <div className="flex flex-col gap-1">
                          {own.map((shift) => (
                            <Button
                              key={shift.id}
                              variant="secondary"
                              size="sm"
                              className="justify-start tabular-nums"
                              disabled={!mayManage}
                              onClick={() => {
                                setEditing({ shift, staffId: member.id, day });
                              }}
                            >
                              {`${format.time(shift.startsAt)}–${format.time(shift.endsAt)}`}
                            </Button>
                          ))}
                          {mayManage && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`${t('shifts.add')}: ${member.fullName}, ${format.date(day)}`}
                              onClick={() => {
                                setEditing({ shift: null, staffId: member.id, day });
                              }}
                            >
                              <PlusIcon aria-hidden />
                            </Button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <ShiftDialog
          editing={editing}
          branchId={branchId}
          staff={staff}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ShiftDialog({
  editing,
  branchId,
  staff,
  onClose,
}: {
  readonly editing: Editing;
  readonly branchId: string;
  readonly staff: readonly StaffMember[];
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('hr');
  const id = useId();
  const { online, readOnly } = useAdminWriteState();
  const save = useSaveShift();
  const remove = useRemoveShift();
  const existing = editing.shift;
  const [shiftId] = useState(() => existing?.id ?? crypto.randomUUID());
  const [day, setDay] = useState(existing ? baghdadClock(existing.startsAt).day : editing.day);
  const [start, setStart] = useState(
    existing ? minuteToClock(baghdadClock(existing.startsAt).minute) : '08:00',
  );
  const [end, setEnd] = useState(
    existing ? minuteToClock(baghdadClock(existing.endsAt).minute) : '16:00',
  );
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<HrErrorKey | null>(null);
  const startMinute = clockToMinute(start);
  const endMinute = clockToMinute(end);
  // An end at or before the start is the next day (a night shift).
  const length =
    startMinute === null || endMinute === null
      ? null
      : endMinute > startMinute
        ? endMinute - startMinute
        : endMinute + 1440 - startMinute;
  const timeProblem = length === null || length > 16 * 60;
  const person = staff.find((each) => each.id === editing.staffId);
  const pending = save.isPending || remove.isPending;

  const confirm = () => {
    setSent(true);
    if (timeProblem || startMinute === null) return;
    setError(null);
    const startsAt = baghdadMoment(day, startMinute);
    save.mutate(
      {
        id: shiftId,
        staffId: editing.staffId,
        branchId,
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + length * 60_000).toISOString(),
        note: null,
      },
      {
        onSuccess: () => {
          toast.success(t('shifts.saved'));
          onClose();
        },
        onError: (thrown) => {
          setError(hrErrorKey(thrown, 'save_shift'));
        },
      },
    );
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={existing ? t('shifts.editTitle') : t('shifts.addTitle')}
      description={person?.fullName}
      footer={
        <>
          <Button disabled={!online || readOnly || pending} onClick={confirm}>
            {save.isPending && <Spinner />}
            {t('actions.save')}
          </Button>
          {existing && (
            <Button
              variant="outline"
              disabled={!online || readOnly || pending}
              onClick={() => {
                remove.mutate(existing.id, {
                  onSuccess: () => {
                    toast.success(t('shifts.removed'));
                    onClose();
                  },
                  onError: (thrown) => {
                    setError(hrErrorKey(thrown, 'remove_shift'));
                  },
                });
              }}
            >
              {t('shifts.remove')}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </>
      }
    >
      <FieldGroup data-testid="shift-form">
        <DateSelectField
          label={t('shifts.day')}
          value={day}
          onChange={setDay}
          years={[Number(editing.day.slice(0, 4)), Number(editing.day.slice(0, 4)) + 1]}
          allowEmpty={false}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${id}-start`}>{t('shifts.start')}</FieldLabel>
            <Input
              id={`${id}-start`}
              type="time"
              dir="ltr"
              value={start}
              onChange={(event) => {
                setStart(event.target.value);
              }}
            />
          </Field>
          <Field data-invalid={(sent && timeProblem) || undefined}>
            <FieldLabel htmlFor={`${id}-end`}>{t('shifts.end')}</FieldLabel>
            <Input
              id={`${id}-end`}
              type="time"
              dir="ltr"
              value={end}
              onChange={(event) => {
                setEnd(event.target.value);
              }}
            />
            {sent && timeProblem && <FieldError>{t('errors.invalid_shift')}</FieldError>}
          </Field>
        </div>
        <HrError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}
