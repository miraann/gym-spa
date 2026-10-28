import { baghdadClock, baghdadMoment, clockToMinute, minuteToClock } from '@gym/core';
import { localizedName } from '@gym/i18n';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Badge } from '@gym/ui/components/badge';
import { Button } from '@gym/ui/components/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { Spinner } from '@gym/ui/components/spinner';
import { Textarea } from '@gym/ui/components/textarea';
import { cn } from '@gym/ui/lib/utils';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAdminBranches } from '@/features/staff/admin-data';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { useClockManual, useVoidClock, type ClockRecord } from './hr-data';
import { HrError } from './hr-error';
import { hrErrorKey, type HrErrorKey } from './hr-errors';

/** Minutes between two moments (to now while still in). */
function minutesOf(record: ClockRecord): number {
  const end = record.clockedOutAt ? new Date(record.clockedOutAt).getTime() : Date.now();
  return Math.max(0, Math.round((end - new Date(record.clockedInAt).getTime()) / 60_000));
}

/** Clock records, latest first, with how long each was and the total of the closed ones. */
export function ClockList({
  records,
  showNames,
  mayManage,
}: {
  readonly records: readonly ClockRecord[];
  readonly showNames: boolean;
  readonly mayManage: boolean;
}) {
  const { t } = useTranslation('hr');
  const format = useFormat();
  const [voiding, setVoiding] = useState<ClockRecord | null>(null);
  const worked = (minutes: number) =>
    t('clock.worked', {
      hours: format.number(Math.floor(minutes / 60)),
      minutes: format.number(minutes % 60),
    });
  const total = records
    .filter((record) => record.voidedAt === null && record.clockedOutAt !== null)
    .reduce((sum, record) => sum + minutesOf(record), 0);
  if (records.length === 0)
    return <p className="text-sm text-muted-foreground">{t('clock.none')}</p>;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y" data-testid="clock-list">
        {records.map((record) => (
          <li
            key={record.id}
            className={cn(
              'flex flex-wrap items-center gap-x-3 gap-y-1 py-2',
              record.voidedAt && 'text-muted-foreground',
            )}
            data-clock={record.fullName ?? record.staffId}
          >
            {showNames && <span className="font-medium">{record.fullName ?? '—'}</span>}
            <span className="tabular-nums">
              {`${format.date(record.clockedInAt)} · ${format.time(record.clockedInAt)} – ${
                record.clockedOutAt ? format.time(record.clockedOutAt) : t('clock.inside')
              }`}
            </span>
            {record.clockedOutAt && !record.voidedAt && (
              <span className="text-sm text-muted-foreground">{worked(minutesOf(record))}</span>
            )}
            <span className="text-xs text-muted-foreground">
              {record.method === 'card' ? t('clock.byCard') : t('clock.byHand')}
            </span>
            {record.note && <span className="text-xs text-muted-foreground">{record.note}</span>}
            {record.voidedAt ? (
              <Badge variant="outline">{`${t('clock.voided')}: ${record.voidReason ?? ''}`}</Badge>
            ) : (
              mayManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ms-auto"
                  onClick={() => {
                    setVoiding(record);
                  }}
                >
                  {t('clock.void')}
                </Button>
              )
            )}
          </li>
        ))}
      </ul>
      <p className="text-sm" data-testid="clock-total">
        {t('clock.total', { time: worked(total) })}
      </p>
      {voiding && (
        <VoidDialog
          record={voiding}
          onClose={() => {
            setVoiding(null);
          }}
        />
      )}
    </div>
  );
}

function VoidDialog({
  record,
  onClose,
}: {
  readonly record: ClockRecord;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('hr');
  const id = useId();
  const { online, readOnly } = useAdminWriteState();
  const cancel = useVoidClock();
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<HrErrorKey | null>(null);

  const confirm = () => {
    setSent(true);
    if (reason.trim() === '') return;
    setError(null);
    cancel.mutate(
      { recordId: record.id, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(t('clock.done.voided'));
          onClose();
        },
        onError: (thrown) => {
          setError(hrErrorKey(thrown, 'void_clock'));
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
      title={t('clock.voidTitle')}
      footer={
        <>
          <Button
            variant="destructive"
            disabled={!online || readOnly || cancel.isPending}
            onClick={confirm}
          >
            {cancel.isPending && <Spinner />}
            {t('clock.void')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </>
      }
    >
      <Field data-invalid={(sent && reason.trim() === '') || undefined}>
        <FieldLabel htmlFor={`${id}-reason`}>{t('clock.reason')}</FieldLabel>
        <Textarea
          id={`${id}-reason`}
          maxLength={300}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
        {sent && reason.trim() === '' && <FieldError>{t('errors.reason_required')}</FieldError>}
      </Field>
      <HrError error={error} />
    </ResponsiveDialog>
  );
}

/** A manager clocks someone in or out by hand (hr.manage): today at a time, with a note. */
export function ManualClockDialog({
  staffId,
  name,
  branchIds,
  clockIn,
  onClose,
}: {
  readonly staffId: string;
  readonly name: string;
  /** The staff member's branches the manager reaches; empty: all of the manager's. */
  readonly branchIds: readonly string[];
  readonly clockIn: boolean;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('hr');
  const { language } = usePreferences();
  const id = useId();
  const { online, readOnly } = useAdminWriteState();
  const branches = useAdminBranches();
  const clock = useClockManual();
  const choices = (branches.data ?? []).filter(
    (branch) => branch.isActive && (branchIds.length === 0 || branchIds.includes(branch.id)),
  );
  const now = baghdadClock(new Date());
  const [branchId, setBranchId] = useState('');
  const [time, setTime] = useState(minuteToClock(now.minute));
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<HrErrorKey | null>(null);
  const branch = choices.find((each) => each.id === branchId) ?? choices[0];
  const minute = clockToMinute(time);
  const noteProblem = note.trim() === '';

  const confirm = () => {
    setSent(true);
    if (noteProblem || minute === null || (clockIn && !branch)) return;
    setError(null);
    clock.mutate(
      {
        staffId,
        branchId: branch?.id ?? '',
        clockIn,
        at: baghdadMoment(now.day, minute),
        note: note.trim(),
      },
      {
        onSuccess: () => {
          toast.success(t(clockIn ? 'clock.done.in' : 'clock.done.out', { name }));
          onClose();
        },
        onError: (thrown) => {
          setError(hrErrorKey(thrown, 'manual_clock'));
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
      title={t(clockIn ? 'clock.manualTitleIn' : 'clock.manualTitleOut', { name })}
      footer={
        <>
          <Button disabled={!online || readOnly || clock.isPending} onClick={confirm}>
            {clock.isPending && <Spinner />}
            {t('clock.confirm')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </>
      }
    >
      <FieldGroup data-testid="manual-clock">
        {clockIn && choices.length > 1 && (
          <Field>
            <FieldLabel htmlFor={`${id}-branch`}>{t('clock.branch')}</FieldLabel>
            <NativeSelect
              id={`${id}-branch`}
              value={branch?.id ?? ''}
              onChange={(event) => {
                setBranchId(event.target.value);
              }}
            >
              {choices.map((each) => (
                <NativeSelectOption key={each.id} value={each.id}>
                  {localizedName(each, language)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        )}
        <Field data-invalid={(sent && minute === null) || undefined}>
          <FieldLabel htmlFor={`${id}-time`}>{t('clock.time')}</FieldLabel>
          <Input
            id={`${id}-time`}
            type="time"
            dir="ltr"
            className="w-36"
            value={time}
            onChange={(event) => {
              setTime(event.target.value);
            }}
          />
        </Field>
        <Field data-invalid={(sent && noteProblem) || undefined}>
          <FieldLabel htmlFor={`${id}-note`}>{t('clock.note')}</FieldLabel>
          <Textarea
            id={`${id}-note`}
            maxLength={300}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
          {sent && noteProblem && <FieldError>{t('clock.noteRequired')}</FieldError>}
        </Field>
        <HrError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}
