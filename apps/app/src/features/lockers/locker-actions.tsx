import {
  LOCKER_KINDS,
  LOCKER_NUMBER_PATTERN,
  LOCKER_ZONES,
  formatMemberNumber,
  lockerFitsGender,
  nextDay,
  normalizeLockerNumber,
  planEndDate,
  type LockerKind,
  type LockerZone,
} from '@gym/core';
import { ChoiceGroup } from '@gym/ui/blocks/choice-group';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Button } from '@gym/ui/components/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Label } from '@gym/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { RadioGroup, RadioGroupItem } from '@gym/ui/components/radio-group';
import { Spinner } from '@gym/ui/components/spinner';
import { Textarea } from '@gym/ui/components/textarea';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { DateSelectField } from '@/components/date-select-field';
import { useMemberSearch, type Member } from '@/features/members/member-data';
import { PayNow } from '@/features/payments/pay-now';
import { usePayNow } from '@/features/payments/use-pay-now';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import { useBaghdadToday } from '@/lib/use-today';
import {
  useGiveLocker,
  useLockerSettings,
  useLostLockerKey,
  useRemoveLocker,
  useRenewLocker,
  useRentLocker,
  useSetOutOfOrder,
  useUpdateLocker,
  type Locker,
  type LockerHolder,
} from './locker-data';
import { LockerError } from './locker-error';
import { lockerErrorKey, type LockerErrorKey } from './locker-errors';

interface ActionProps {
  readonly locker: Locker;
  /** Back to the locker's details. */
  readonly onBack: () => void;
  /** Done: the locker's dialogs close. */
  readonly onDone: () => void;
}

/** The longest rental, in months (rent_locker() takes 1 to 12). */
const MAX_MONTHS = 12;
/** A rental starts today or within this many days (rent_locker()). */
const MAX_START_DAYS = 60;

/** One action on a locker: its fields, an error, and confirm / back. */
function ActionDialog({
  title,
  description,
  confirm,
  destructive = false,
  pending,
  error,
  onConfirm,
  onBack,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly confirm: string;
  readonly destructive?: boolean;
  readonly pending: boolean;
  readonly error: LockerErrorKey | null;
  readonly onConfirm: () => void;
  readonly onBack: () => void;
  readonly children?: ReactNode;
}) {
  const { t } = useTranslation('lockers');
  const { online, readOnly } = useAdminWriteState();
  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => {
        if (!next) onBack();
      }}
      title={title}
      description={description}
      footer={
        <>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={!online || readOnly || pending}
            onClick={onConfirm}
          >
            {pending && <Spinner />}
            {confirm}
          </Button>
          <Button variant="outline" onClick={onBack}>
            {t('actions.back')}
          </Button>
        </>
      }
    >
      <FieldGroup data-testid="locker-action">
        {children}
        <LockerError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}

/** Finding the member a locker goes to: those the locker's zone fits, and `allow` lets through. */
function MemberPicker({
  zone,
  allow,
  value,
  onChange,
  showProblem,
}: {
  readonly zone: LockerZone;
  readonly allow: (member: Member) => boolean;
  readonly value: Member | null;
  readonly onChange: (member: Member | null) => void;
  readonly showProblem: boolean;
}) {
  const { t } = useTranslation('lockers');
  const id = useId();
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 1;
  const found = useMemberSearch(query, searching);
  const candidates = (found.data?.members ?? []).filter(
    (member) => allow(member) && lockerFitsGender(zone, member.gender),
  );

  return (
    <>
      <Field data-invalid={(showProblem && value === null) || undefined}>
        <FieldLabel htmlFor={`${id}-search`}>{t('member.search')}</FieldLabel>
        <Input
          id={`${id}-search`}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
        {zone !== 'mixed' && <FieldDescription>{t(`member.zoneHint.${zone}`)}</FieldDescription>}
        {showProblem && value === null && <FieldError>{t('member.required')}</FieldError>}
      </Field>
      {searching && found.isSuccess && candidates.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('member.none')}</p>
      )}
      {candidates.length > 0 && (
        <RadioGroup
          aria-label={t('member.search')}
          value={value?.id ?? ''}
          onValueChange={(chosen) => {
            onChange(candidates.find((each) => each.id === chosen) ?? null);
          }}
          className="grid gap-2"
        >
          {candidates.map((candidate) => (
            <Label
              key={candidate.id}
              htmlFor={`${id}-${candidate.id}`}
              className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 font-normal has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted"
            >
              <RadioGroupItem id={`${id}-${candidate.id}`} value={candidate.id} />
              <span className="flex-1">{candidate.fullName}</span>
              <span dir="ltr" className="text-sm text-muted-foreground tabular-nums">
                {formatMemberNumber(candidate.memberNumber)}
              </span>
            </Label>
          ))}
        </RadioGroup>
      )}
    </>
  );
}

/** A daily locker for an active member, for today. */
export function GiveLockerDialog({ locker, onBack, onDone }: ActionProps) {
  const { t } = useTranslation('lockers');
  const give = useGiveLocker();
  const [assignmentId] = useState(() => crypto.randomUUID());
  const [member, setMember] = useState<Member | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<LockerErrorKey | null>(null);

  const confirm = () => {
    setSent(true);
    if (member === null) return;
    setError(null);
    give.mutate(
      { assignmentId, lockerId: locker.id, memberId: member.id, attendanceId: null },
      {
        onSuccess: () => {
          toast.success(t('give.done', { number: locker.number, name: member.fullName }));
          onDone();
        },
        onError: (thrown) => {
          setError(lockerErrorKey(thrown, 'give'));
        },
      },
    );
  };

  return (
    <ActionDialog
      title={t('give.title', { number: locker.number })}
      description={t('give.description')}
      confirm={t('give.confirm')}
      pending={give.isPending}
      error={error}
      onConfirm={confirm}
      onBack={onBack}
    >
      <MemberPicker
        zone={locker.zone}
        allow={(each) => each.status === 'active'}
        value={member}
        onChange={setMember}
        showProblem={sent}
      />
    </ActionDialog>
  );
}

function MonthsField({
  value,
  onChange,
}: {
  readonly value: number;
  readonly onChange: (months: number) => void;
}) {
  const { t } = useTranslation('lockers');
  const format = useFormat();
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={`${id}-months`}>{t('money.months')}</FieldLabel>
      <NativeSelect
        id={`${id}-months`}
        value={String(value)}
        onChange={(event) => {
          onChange(Number(event.target.value));
        }}
      >
        {Array.from({ length: MAX_MONTHS }, (_, index) => index + 1).map((months) => (
          <NativeSelectOption key={months} value={String(months)}>
            {t('money.monthCount', { count: format.number(months) })}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}

/** What it costs, or that the price isn't set yet. */
function Total({ total, priceSet }: { readonly total: number; readonly priceSet: boolean }) {
  const { t } = useTranslation('lockers');
  const format = useFormat();
  return priceSet ? (
    <p className="flex items-baseline justify-between rounded-2xl bg-muted p-4">
      <span className="text-muted-foreground">{t('money.total')}</span>
      <span className="text-2xl tabular-nums">{format.money(total)}</span>
    </p>
  ) : (
    <p className="text-warning">{t('errors.locker_price_not_set')}</p>
  );
}

/** A rented locker by the month, with its invoice and an optional payment. */
export function RentLockerDialog({
  locker,
  branchId,
  onBack,
  onDone,
}: ActionProps & { readonly branchId: string }) {
  const { t } = useTranslation('lockers');
  const format = useFormat();
  const today = useBaghdadToday();
  const thisYear = Number(today.slice(0, 4));
  const rent = useRentLocker();
  const prices = useLockerSettings(branchId);
  const [ids] = useState(() => ({
    assignment: crypto.randomUUID(),
    invoice: crypto.randomUUID(),
    payment: crypto.randomUUID(),
  }));
  const [member, setMember] = useState<Member | null>(null);
  const [months, setMonths] = useState(1);
  const [startsOn, setStartsOn] = useState(today);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<LockerErrorKey | null>(null);
  const monthPrice = prices.data?.rentMonthPrice ?? 0;
  const total = monthPrice * months;
  const pay = usePayNow(total);
  const lastStart = planEndDate(today, 'day', MAX_START_DAYS + 1);
  const startProblem = startsOn < today || startsOn > lastStart;

  const confirm = () => {
    setSent(true);
    if (member === null || monthPrice <= 0 || startProblem || pay.problem) return;
    setError(null);
    rent.mutate(
      {
        assignmentId: ids.assignment,
        invoiceId: ids.invoice,
        lockerId: locker.id,
        memberId: member.id,
        startsOn,
        months,
        description: t('rent.invoiceText', { number: locker.number, count: months }),
        payment: pay.input(ids.payment),
      },
      {
        onSuccess: (invoiceNumber) => {
          toast.success(t('rent.done', { number: locker.number, invoice: invoiceNumber ?? '' }));
          onDone();
        },
        onError: (thrown) => {
          setError(lockerErrorKey(thrown, 'rent'));
        },
      },
    );
  };

  return (
    <ActionDialog
      title={t('rent.title', { number: locker.number })}
      description={t('rent.description', {
        until: format.date(planEndDate(startsOn, 'month', months)),
      })}
      confirm={t('rent.confirm')}
      pending={rent.isPending}
      error={error}
      onConfirm={confirm}
      onBack={onBack}
    >
      <MemberPicker
        zone={locker.zone}
        allow={(each) => each.status !== 'archived'}
        value={member}
        onChange={setMember}
        showProblem={sent}
      />
      <MonthsField value={months} onChange={setMonths} />
      <DateSelectField
        label={t('rent.startsOn')}
        value={startsOn}
        onChange={setStartsOn}
        years={[thisYear, thisYear + 1]}
        allowEmpty={false}
        error={sent && startProblem ? t('rent.startProblem') : null}
      />
      {prices.isSuccess && <Total total={total} priceSet={monthPrice > 0} />}
      {monthPrice > 0 && (
        <PayNow
          label={t('money.payNow')}
          total={total}
          payNow={pay.payNow}
          onPayNow={pay.setPayNow}
          payment={pay.values}
          onPayment={pay.setPayment}
          showProblems={sent}
        />
      )}
    </ActionDialog>
  );
}

/** More months for a rental, from the day after its last paid day. */
export function RenewLockerDialog({
  locker,
  holder,
  branchId,
  onBack,
  onDone,
}: ActionProps & { readonly holder: LockerHolder; readonly branchId: string }) {
  const { t } = useTranslation('lockers');
  const format = useFormat();
  const renew = useRenewLocker();
  const prices = useLockerSettings(branchId);
  const [ids] = useState(() => ({
    assignment: crypto.randomUUID(),
    invoice: crypto.randomUUID(),
    payment: crypto.randomUUID(),
  }));
  const [months, setMonths] = useState(1);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<LockerErrorKey | null>(null);
  const monthPrice = prices.data?.rentMonthPrice ?? 0;
  const total = monthPrice * months;
  const pay = usePayNow(total);
  const starts = nextDay(holder.endsOn ?? holder.startsOn);

  const confirm = () => {
    setSent(true);
    if (monthPrice <= 0 || pay.problem) return;
    setError(null);
    renew.mutate(
      {
        assignmentId: ids.assignment,
        invoiceId: ids.invoice,
        renewsId: holder.id,
        months,
        description: t('renew.invoiceText', { number: locker.number, count: months }),
        payment: pay.input(ids.payment),
      },
      {
        onSuccess: (invoiceNumber) => {
          toast.success(t('renew.done', { number: locker.number, invoice: invoiceNumber ?? '' }));
          onDone();
        },
        onError: (thrown) => {
          setError(lockerErrorKey(thrown, 'renew'));
        },
      },
    );
  };

  return (
    <ActionDialog
      title={t('renew.title', { number: locker.number })}
      description={t('renew.description', {
        from: format.date(starts),
        until: format.date(planEndDate(starts, 'month', months)),
      })}
      confirm={t('renew.confirm')}
      pending={renew.isPending}
      error={error}
      onConfirm={confirm}
      onBack={onBack}
    >
      <MonthsField value={months} onChange={setMonths} />
      {prices.isSuccess && <Total total={total} priceSet={monthPrice > 0} />}
      {monthPrice > 0 && (
        <PayNow
          label={t('money.payNow')}
          total={total}
          payNow={pay.payNow}
          onPayNow={pay.setPayNow}
          payment={pay.values}
          onPayment={pay.setPayment}
          showProblems={sent}
        />
      )}
    </ActionDialog>
  );
}

/** The key was lost: the locker is released, with the fee when the gym set one. */
export function LostKeyDialog({
  locker,
  holder,
  branchId,
  onBack,
  onDone,
}: ActionProps & { readonly holder: LockerHolder; readonly branchId: string }) {
  const { t } = useTranslation('lockers');
  const format = useFormat();
  const lost = useLostLockerKey();
  const prices = useLockerSettings(branchId);
  const [ids] = useState(() => ({ invoice: crypto.randomUUID(), payment: crypto.randomUUID() }));
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<LockerErrorKey | null>(null);
  const fee = prices.data?.lostKeyFee ?? 0;
  const pay = usePayNow(fee);

  const confirm = () => {
    setSent(true);
    if (!prices.isSuccess || pay.problem) return;
    setError(null);
    lost.mutate(
      {
        assignmentId: holder.id,
        invoiceId: ids.invoice,
        description: t('lostKey.invoiceText', { number: locker.number }),
        payment: pay.input(ids.payment),
      },
      {
        onSuccess: () => {
          toast.success(t('lostKey.done', { number: locker.number }));
          onDone();
        },
        onError: (thrown) => {
          setError(lockerErrorKey(thrown, 'lost_key'));
        },
      },
    );
  };

  return (
    <ActionDialog
      title={t('lostKey.title', { number: locker.number })}
      description={fee > 0 ? t('lostKey.fee', { fee: format.money(fee) }) : t('lostKey.noFee')}
      confirm={t('lostKey.confirm')}
      destructive
      pending={lost.isPending || prices.isPending}
      error={error}
      onConfirm={confirm}
      onBack={onBack}
    >
      {fee > 0 && (
        <PayNow
          label={t('money.payNow')}
          total={fee}
          payNow={pay.payNow}
          onPayNow={pay.setPayNow}
          payment={pay.values}
          onPayment={pay.setPayment}
          showProblems={sent}
        />
      )}
    </ActionDialog>
  );
}

/** Out of order with a note, or back in order. */
export function OutOfOrderDialog({ locker, onBack, onDone }: ActionProps) {
  const { t } = useTranslation('lockers');
  const id = useId();
  const setOutOfOrder = useSetOutOfOrder();
  const backInOrder = locker.outOfOrderNote !== null;
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<LockerErrorKey | null>(null);
  const missing = !backInOrder && note.trim() === '';

  const confirm = () => {
    setSent(true);
    if (missing) return;
    setError(null);
    setOutOfOrder.mutate(
      { lockerId: locker.id, note: backInOrder ? null : note.trim() },
      {
        onSuccess: () => {
          toast.success(
            t(backInOrder ? 'outOfOrder.backDone' : 'outOfOrder.done', { number: locker.number }),
          );
          onDone();
        },
        onError: (thrown) => {
          setError(lockerErrorKey(thrown, 'out_of_order'));
        },
      },
    );
  };

  return (
    <ActionDialog
      title={t(backInOrder ? 'outOfOrder.backTitle' : 'outOfOrder.title', {
        number: locker.number,
      })}
      confirm={t(backInOrder ? 'actions.backInOrder' : 'actions.outOfOrder')}
      pending={setOutOfOrder.isPending}
      error={error}
      onConfirm={confirm}
      onBack={onBack}
    >
      {!backInOrder && (
        <Field data-invalid={(sent && missing) || undefined}>
          <FieldLabel htmlFor={`${id}-note`}>{t('outOfOrder.note')}</FieldLabel>
          <Textarea
            id={`${id}-note`}
            value={note}
            maxLength={200}
            aria-invalid={(sent && missing) || undefined}
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
          {sent && missing && <FieldError>{t('outOfOrder.noteRequired')}</FieldError>}
        </Field>
      )}
    </ActionDialog>
  );
}

/** Taken off the map; its history stays. */
export function RemoveLockerDialog({ locker, onBack, onDone }: ActionProps) {
  const { t } = useTranslation('lockers');
  const remove = useRemoveLocker();
  const [error, setError] = useState<LockerErrorKey | null>(null);
  return (
    <ActionDialog
      title={t('remove.title', { number: locker.number })}
      description={t('remove.description')}
      confirm={t('actions.remove')}
      destructive
      pending={remove.isPending}
      error={error}
      onConfirm={() => {
        setError(null);
        remove.mutate(locker.id, {
          onSuccess: () => {
            toast.success(t('remove.done', { number: locker.number }));
            onDone();
          },
          onError: (thrown) => {
            setError(lockerErrorKey(thrown, 'remove'));
          },
        });
      }}
      onBack={onBack}
    />
  );
}

/** A locker's number, zone and kind (the zone and kind only while nobody holds it). */
export function EditLockerDialog({ locker, onBack, onDone }: ActionProps) {
  const { t } = useTranslation('lockers');
  const id = useId();
  const update = useUpdateLocker();
  const [number, setNumber] = useState(locker.number);
  const [zone, setZone] = useState<LockerZone>(locker.zone);
  const [kind, setKind] = useState<LockerKind>(locker.kind);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<LockerErrorKey | null>(null);
  const normalized = normalizeLockerNumber(number);
  const numberProblem = !LOCKER_NUMBER_PATTERN.test(normalized);

  const confirm = () => {
    setSent(true);
    if (numberProblem) return;
    setError(null);
    update.mutate(
      { lockerId: locker.id, number: normalized, zone, kind },
      {
        onSuccess: () => {
          toast.success(t('edit.done', { number: normalized }));
          onDone();
        },
        onError: (thrown) => {
          setError(lockerErrorKey(thrown, 'update'));
        },
      },
    );
  };

  return (
    <ActionDialog
      title={t('edit.title', { number: locker.number })}
      confirm={t('actions.save')}
      pending={update.isPending}
      error={error}
      onConfirm={confirm}
      onBack={onBack}
    >
      <Field data-invalid={(sent && numberProblem) || undefined}>
        <FieldLabel htmlFor={`${id}-number`}>{t('edit.number')}</FieldLabel>
        <Input
          id={`${id}-number`}
          dir="ltr"
          className="w-32 tabular-nums"
          value={number}
          maxLength={7}
          onChange={(event) => {
            setNumber(event.target.value);
          }}
        />
        <FieldDescription>{t('edit.numberHint')}</FieldDescription>
        {sent && numberProblem && <FieldError>{t('edit.numberProblem')}</FieldError>}
      </Field>
      <ZoneAndKind zone={zone} onZone={setZone} kind={kind} onKind={setKind} />
    </ActionDialog>
  );
}

/** The zone and kind choices, for adding and editing lockers. */
export function ZoneAndKind({
  zone,
  onZone,
  kind,
  onKind,
}: {
  readonly zone: LockerZone;
  readonly onZone: (zone: LockerZone) => void;
  readonly kind: LockerKind;
  readonly onKind: (kind: LockerKind) => void;
}) {
  const { t } = useTranslation('lockers');
  return (
    <>
      <Field>
        <FieldLabel>{t('fields.zone')}</FieldLabel>
        <ChoiceGroup
          label={t('fields.zone')}
          value={zone}
          choices={LOCKER_ZONES.map((each) => ({ value: each, label: t(`zones.${each}`) }))}
          onChange={onZone}
        />
      </Field>
      <Field>
        <FieldLabel>{t('fields.kind')}</FieldLabel>
        <ChoiceGroup
          label={t('fields.kind')}
          value={kind}
          choices={LOCKER_KINDS.map((each) => ({ value: each, label: t(`kinds.${each}`) }))}
          onChange={onKind}
        />
      </Field>
    </>
  );
}
