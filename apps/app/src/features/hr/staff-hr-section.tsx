import { parseDecimal, parseWholeNumber } from '@gym/core';
import { ChoiceGroup } from '@gym/ui/blocks/choice-group';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Badge } from '@gym/ui/components/badge';
import { Button } from '@gym/ui/components/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Checkbox } from '@gym/ui/components/checkbox';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Label } from '@gym/ui/components/label';
import { Spinner } from '@gym/ui/components/spinner';
import { Textarea } from '@gym/ui/components/textarea';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { DateSelectField } from '@/components/date-select-field';
import { usePermission } from '@/features/auth/use-permissions';
import { CardNumberField, CardUid, ScanPrompt } from '@/features/cards/card-scan';
import { useCardNumber } from '@/features/cards/use-card-number';
import type { StaffMember } from '@/features/staff/admin-data';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import { useBaghdadToday } from '@/lib/use-today';
import { ClockList, ManualClockDialog } from './clock-list';
import {
  SALARY_TYPES,
  useClockRecords,
  useEndStaffCard,
  useGiveStaffCard,
  useSaveStaffProfile,
  useStaffCard,
  useStaffProfile,
  type SalaryType,
  type StaffProfile,
} from './hr-data';
import { HrError } from './hr-error';
import { hrErrorKey, type HrErrorKey } from './hr-errors';

/** How far back a staff member's page shows their time worked. */
const RECENT_DAYS = 14;

/**
 * A staff member's HR, on their page: pay terms, their card and recent time worked. hr.view (or
 * their own page) sees it; hr.manage changes it for others.
 */
export function StaffHrSection({
  member,
  isSelf,
}: {
  readonly member: StaffMember;
  readonly isSelf: boolean;
}) {
  const mayView = usePermission('hr.view');
  const mayManage = usePermission('hr.manage') && !isSelf;
  if (!mayView && !isSelf) return null;
  return (
    <>
      <PayCard member={member} mayManage={mayManage} />
      <StaffCardCard member={member} mayManage={mayManage} />
      <RecentClockCard member={member} mayManage={mayManage} />
    </>
  );
}

function PayCard({
  member,
  mayManage,
}: {
  readonly member: StaffMember;
  readonly mayManage: boolean;
}) {
  const { t } = useTranslation('hr');
  const format = useFormat();
  const profile = useStaffProfile(member.id, true);
  const [editing, setEditing] = useState(false);
  const data = profile.data ?? null;

  return (
    <Card data-testid="staff-pay">
      <CardHeader>
        <CardTitle>
          <h3>{t('profile.title')}</h3>
        </CardTitle>
        {mayManage && profile.isSuccess && (
          <CardAction>
            <Button
              variant="outline"
              onClick={() => {
                setEditing(true);
              }}
            >
              {data ? t('profile.edit') : t('profile.set')}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {profile.isError ? (
          <HrError error={hrErrorKey(profile.error, 'load_profile')} />
        ) : data === null ? (
          <p className="text-sm text-muted-foreground">{t('profile.none')}</p>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">{t('profile.salaryType')}</dt>
              <dd>
                {t(`profile.types.${data.salaryType}`)}
                {data.salaryType === 'fixed' &&
                  data.monthlySalary !== null &&
                  ` · ${t('profile.perMonth', { amount: format.money(data.monthlySalary) })}`}
                {data.salaryType === 'hourly' &&
                  data.hourlyRate !== null &&
                  ` · ${t('profile.perHour', { amount: format.money(data.hourlyRate) })}`}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">{t('profile.classFee')}</dt>
              <dd className="tabular-nums">{format.money(data.classFee)}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">{t('profile.ptPercent')}</dt>
              <dd className="tabular-nums">{`${format.number(data.ptPercent)}%`}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">{t('profile.hiredOn')}</dt>
              <dd>{data.hiredOn ? format.date(data.hiredOn) : '—'}</dd>
            </div>
            {data.teaches && (
              <div>
                <Badge variant="secondary">{t('profile.trainer')}</Badge>
              </div>
            )}
          </dl>
        )}
      </CardContent>
      {editing && (
        <PayDialog
          member={member}
          profile={data}
          onClose={() => {
            setEditing(false);
          }}
        />
      )}
    </Card>
  );
}

function PayDialog({
  member,
  profile,
  onClose,
}: {
  readonly member: StaffMember;
  readonly profile: StaffProfile | null;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('hr');
  const id = useId();
  const today = useBaghdadToday();
  const { online, readOnly } = useAdminWriteState();
  const save = useSaveStaffProfile();
  const [salaryType, setSalaryType] = useState<SalaryType>(profile?.salaryType ?? 'fixed');
  const [monthly, setMonthly] = useState(String(profile?.monthlySalary ?? ''));
  const [hourly, setHourly] = useState(String(profile?.hourlyRate ?? ''));
  const [classFee, setClassFee] = useState(String(profile?.classFee ?? 0));
  const [ptPercent, setPtPercent] = useState(String(profile?.ptPercent ?? 0));
  const [teaches, setTeaches] = useState(profile?.teaches ?? false);
  const [hiredOn, setHiredOn] = useState(profile?.hiredOn ?? '');
  const [note, setNote] = useState(profile?.note ?? '');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<HrErrorKey | null>(null);
  const monthlyValue = parseWholeNumber(monthly);
  const hourlyValue = parseWholeNumber(hourly);
  const feeValue = parseWholeNumber(classFee);
  const percentValue = parseDecimal(ptPercent);
  const amountProblem =
    (salaryType === 'fixed' && monthlyValue === null) ||
    (salaryType === 'hourly' && hourlyValue === null);
  const feeProblem = feeValue === null;
  const percentProblem = percentValue === null || percentValue > 100;

  const confirm = () => {
    setSent(true);
    if (amountProblem || feeProblem || percentProblem) return;
    setError(null);
    save.mutate(
      {
        staffId: member.id,
        profile: {
          salaryType,
          monthlySalary: salaryType === 'fixed' ? monthlyValue : null,
          hourlyRate: salaryType === 'hourly' ? hourlyValue : null,
          classFee: feeValue,
          ptPercent: percentValue,
          teaches,
          hiredOn: hiredOn === '' ? null : hiredOn,
          note: note.trim() === '' ? null : note.trim(),
        },
      },
      {
        onSuccess: () => {
          toast.success(t('profile.saved'));
          onClose();
        },
        onError: (thrown) => {
          setError(hrErrorKey(thrown, 'save_profile'));
        },
      },
    );
  };

  const money = (value: string, onChange: (value: string) => void, fieldId: string) => (
    <Input
      id={fieldId}
      inputMode="numeric"
      dir="ltr"
      className="tabular-nums"
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  );

  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('profile.dialogTitle', { name: member.fullName })}
      footer={
        <>
          <Button disabled={!online || readOnly || save.isPending} onClick={confirm}>
            {save.isPending && <Spinner />}
            {t('actions.save')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </>
      }
    >
      <FieldGroup data-testid="staff-pay-form">
        <Field>
          <FieldLabel>{t('profile.salaryType')}</FieldLabel>
          <ChoiceGroup
            label={t('profile.salaryType')}
            value={salaryType}
            choices={SALARY_TYPES.map((each) => ({
              value: each,
              label: t(`profile.types.${each}`),
            }))}
            onChange={setSalaryType}
          />
        </Field>
        {salaryType === 'fixed' && (
          <Field data-invalid={(sent && amountProblem) || undefined}>
            <FieldLabel htmlFor={`${id}-monthly`}>{t('profile.monthly')}</FieldLabel>
            {money(monthly, setMonthly, `${id}-monthly`)}
            {sent && amountProblem && <FieldError>{t('profile.amountProblem')}</FieldError>}
          </Field>
        )}
        {salaryType === 'hourly' && (
          <Field data-invalid={(sent && amountProblem) || undefined}>
            <FieldLabel htmlFor={`${id}-hourly`}>{t('profile.hourly')}</FieldLabel>
            {money(hourly, setHourly, `${id}-hourly`)}
            {sent && amountProblem && <FieldError>{t('profile.amountProblem')}</FieldError>}
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={(sent && feeProblem) || undefined}>
            <FieldLabel htmlFor={`${id}-fee`}>{t('profile.classFee')}</FieldLabel>
            {money(classFee, setClassFee, `${id}-fee`)}
            {sent && feeProblem && <FieldError>{t('profile.amountProblem')}</FieldError>}
          </Field>
          <Field data-invalid={(sent && percentProblem) || undefined}>
            <FieldLabel htmlFor={`${id}-percent`}>{t('profile.ptPercent')}</FieldLabel>
            <Input
              id={`${id}-percent`}
              inputMode="decimal"
              dir="ltr"
              className="tabular-nums"
              value={ptPercent}
              onChange={(event) => {
                setPtPercent(event.target.value);
              }}
            />
            {sent && percentProblem && <FieldError>{t('profile.percentProblem')}</FieldError>}
          </Field>
        </div>
        <Field>
          <div className="flex items-center gap-3">
            <Checkbox
              id={`${id}-teaches`}
              checked={teaches}
              onCheckedChange={(checked) => {
                setTeaches(checked === true);
              }}
            />
            <Label htmlFor={`${id}-teaches`} className="font-normal">
              {t('profile.teaches')}
            </Label>
          </div>
          <FieldDescription>{t('profile.teachesHint')}</FieldDescription>
        </Field>
        <DateSelectField
          label={t('profile.hiredOn')}
          value={hiredOn}
          onChange={setHiredOn}
          years={Array.from({ length: 40 }, (_, index) => Number(today.slice(0, 4)) - index)}
        />
        <Field>
          <FieldLabel htmlFor={`${id}-note`}>{t('profile.note')}</FieldLabel>
          <Textarea
            id={`${id}-note`}
            maxLength={1000}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
        </Field>
        <HrError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}

function StaffCardCard({
  member,
  mayManage,
}: {
  readonly member: StaffMember;
  readonly mayManage: boolean;
}) {
  const { t } = useTranslation('hr');
  const format = useFormat();
  const card = useStaffCard(member.id, true);
  const { online, readOnly } = useAdminWriteState();
  const end = useEndStaffCard();
  const [giving, setGiving] = useState(false);
  const [error, setError] = useState<HrErrorKey | null>(null);

  const takeBack = (reason: 'returned' | 'lost') => {
    if (!card.data) return;
    setError(null);
    end.mutate(
      { cardId: card.data.id, reason },
      {
        onSuccess: () => {
          toast.success(t('card.ended'));
        },
        onError: (thrown) => {
          setError(hrErrorKey(thrown, 'end_card'));
        },
      },
    );
  };

  return (
    <Card data-testid="staff-card">
      <CardHeader>
        <CardTitle>
          <h3>{t('card.title')}</h3>
        </CardTitle>
        {mayManage && card.isSuccess && (
          <CardAction>
            <Button
              variant="outline"
              disabled={!online || readOnly}
              onClick={() => {
                setGiving(true);
              }}
            >
              {card.data ? t('card.replace') : t('card.give')}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {card.data ? (
          <div className="flex flex-wrap items-center gap-3">
            <CardUid uid={card.data.uid} className="text-lg" />
            <span className="text-sm text-muted-foreground">
              {t('card.since', { date: format.date(card.data.createdAt) })}
            </span>
            {mayManage && (
              <div className="ms-auto flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!online || readOnly || end.isPending}
                  onClick={() => {
                    takeBack('returned');
                  }}
                >
                  {t('card.returned')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!online || readOnly || end.isPending}
                  onClick={() => {
                    takeBack('lost');
                  }}
                >
                  {t('card.lost')}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('card.none')}</p>
        )}
        <HrError error={error} />
      </CardContent>
      {giving && (
        <GiveCardDialog
          member={member}
          onClose={() => {
            setGiving(false);
          }}
        />
      )}
    </Card>
  );
}

function GiveCardDialog({
  member,
  onClose,
}: {
  readonly member: StaffMember;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('hr');
  const id = useId();
  const { online, readOnly } = useAdminWriteState();
  const give = useGiveStaffCard();
  const [cardId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<HrErrorKey | null>(null);

  const send = (uid: string, signal?: (signal: 'ok' | 'error') => void) => {
    setError(null);
    give.mutate(
      { id: cardId, staffId: member.id, uid },
      {
        onSuccess: () => {
          signal?.('ok');
          toast.success(t('card.given'));
          onClose();
        },
        onError: (thrown) => {
          signal?.('error');
          setError(hrErrorKey(thrown, 'give_card'));
        },
      },
    );
  };
  const number = useCardNumber((uid, signal) => {
    send(uid, signal);
  });

  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('card.giveTitle', { name: member.fullName })}
      footer={
        <>
          <Button
            disabled={!online || readOnly || give.isPending}
            onClick={() => {
              const uid = number.readTyped();
              if (uid) send(uid, number.signalFor(uid));
            }}
          >
            {give.isPending && <Spinner />}
            {t('card.confirm')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </>
      }
    >
      <FieldGroup data-testid="staff-card-form">
        <ScanPrompt />
        <CardNumberField id={`${id}-uid`} label={t('card.number')} number={number} />
        <HrError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}

function RecentClockCard({
  member,
  mayManage,
}: {
  readonly member: StaffMember;
  readonly mayManage: boolean;
}) {
  const { t } = useTranslation('hr');
  const [since] = useState(() => new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString());
  const [until] = useState(() => new Date(Date.now() + 86_400_000).toISOString());
  const records = useClockRecords({ staffId: member.id }, since, until);
  const [clocking, setClocking] = useState<'in' | 'out' | null>(null);
  const open = (records.data ?? []).find(
    (record) => record.clockedOutAt === null && record.voidedAt === null,
  );

  return (
    <Card data-testid="staff-clock">
      <CardHeader>
        <CardTitle>
          <h3>{t('clock.recent')}</h3>
        </CardTitle>
        {mayManage && records.isSuccess && (
          <CardAction>
            <Button
              variant="outline"
              onClick={() => {
                setClocking(open ? 'out' : 'in');
              }}
            >
              {open ? t('clock.manualOut') : t('clock.manualIn')}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {records.isError ? (
          <HrError error={hrErrorKey(records.error, 'load_clock')} />
        ) : (
          <ClockList records={records.data ?? []} showNames={false} mayManage={mayManage} />
        )}
      </CardContent>
      {clocking && (
        <ManualClockDialog
          staffId={member.id}
          name={member.fullName}
          branchIds={member.branchIds}
          clockIn={clocking === 'in'}
          onClose={() => {
            setClocking(null);
          }}
        />
      )}
    </Card>
  );
}
