import {
  WEEK_ORDER,
  clockToMinute,
  isCleanText,
  normalizeName,
  parseWholeNumber,
  type Weekday,
} from '@gym/core';
import { localizedName, resources } from '@gym/i18n';
import { GroupedList, GroupedListItem, RowChevron } from '@gym/ui/blocks/list-group';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Badge } from '@gym/ui/components/badge';
import { Button } from '@gym/ui/components/button';
import { Checkbox } from '@gym/ui/components/checkbox';
import { Field, FieldError, FieldGroup, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Label } from '@gym/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Spinner } from '@gym/ui/components/spinner';
import { groupedRowClass } from '@gym/ui/lib/grouped-list';
import { PlusIcon } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BranchSelect } from '@/components/branch-select';
import { DateSelectField } from '@/components/date-select-field';
import { RequirePermission } from '@/components/no-access';
import { useTrainers } from '@/features/hr/hr-data';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useBranchChoice } from '@/lib/use-branch-choice';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { useBaghdadToday } from '@/lib/use-today';
import {
  useClassSchedules,
  useClassTypes,
  useSaveClassSchedule,
  useSaveClassType,
  type ClassSchedule,
  type ClassType,
} from './class-data';
import { ClassError } from './class-error';
import { classErrorKey, type ClassErrorKey } from './class-errors';

/** /classes/setup (classes.manage): the gym's class types and a branch's weekly classes. */
export function ClassesSetupPage() {
  return (
    <RequirePermission permission="classes.manage">
      <Setup />
    </RequirePermission>
  );
}

function Setup() {
  const { t } = useTranslation('classes');
  const { language } = usePreferences();
  const format = useFormat();
  const types = useClassTypes();
  const { branchId, setBranchId, active } = useBranchChoice();
  const schedules = useClassSchedules(branchId);
  const trainers = useTrainers(null);
  const [editingType, setEditingType] = useState<ClassType | 'new' | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<ClassSchedule | 'new' | null>(null);
  const dayName = (day: Weekday) => resources[language].dates.weekdays[day % 7] ?? '';
  const typeName = (id: string) => {
    const type = types.data?.find((each) => each.id === id);
    return type ? localizedName(type, language) : '';
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('setup.title')} description={t('setup.description')} />

      <Section
        title={t('setup.types')}
        add={t('setup.addType')}
        onAdd={() => {
          setEditingType('new');
        }}
      >
        {types.isPending ? (
          <Skeleton className="h-24 rounded-3xl" />
        ) : types.isError ? (
          <ClassError error={classErrorKey(types.error, 'load_types')} />
        ) : types.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('setup.noTypes')}</p>
        ) : (
          <GroupedList aria-label={t('setup.types')}>
            {types.data.map((type) => (
              <GroupedListItem key={type.id}>
                <button
                  type="button"
                  className={groupedRowClass()}
                  data-class-type={type.nameCkb}
                  onClick={() => {
                    setEditingType(type);
                  }}
                >
                  <span className="flex flex-1 flex-col gap-1">
                    <span className="font-medium">{localizedName(type, language)}</span>
                    <span className="text-sm text-muted-foreground">
                      {`${t('setup.minutes', { count: format.number(type.durationMinutes) })} · ${t('setup.places', { count: format.number(type.capacity) })}`}
                    </span>
                  </span>
                  {!type.isActive && <Badge variant="secondary">{t('setup.inactive')}</Badge>}
                  <RowChevron />
                </button>
              </GroupedListItem>
            ))}
          </GroupedList>
        )}
      </Section>

      <Section
        title={t('setup.schedule')}
        add={t('setup.addSchedule')}
        onAdd={
          (types.data ?? []).some((type) => type.isActive) && branchId !== ''
            ? () => {
                setEditingSchedule('new');
              }
            : undefined
        }
        toolbar={
          <BranchSelect
            label={t('page.branch')}
            branchId={branchId}
            active={active}
            onChange={setBranchId}
          />
        }
      >
        {schedules.isPending ? (
          <Skeleton className="h-24 rounded-3xl" />
        ) : schedules.isError ? (
          <ClassError error={classErrorKey(schedules.error, 'load_schedules')} />
        ) : schedules.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('setup.noSchedule')}</p>
        ) : (
          <GroupedList aria-label={t('setup.schedule')}>
            {schedules.data.map((schedule) => (
              <GroupedListItem key={schedule.id}>
                <button
                  type="button"
                  className={groupedRowClass()}
                  data-class-schedule={typeName(schedule.classTypeId)}
                  onClick={() => {
                    setEditingSchedule(schedule);
                  }}
                >
                  <span className="flex flex-1 flex-col gap-1">
                    <span className="font-medium">{typeName(schedule.classTypeId)}</span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {[
                        `${dayName(schedule.weekday)} ${schedule.startsAt}`,
                        t('setup.minutes', { count: format.number(schedule.durationMinutes) }),
                        t('setup.places', { count: format.number(schedule.capacity) }),
                        trainers.data?.find((each) => each.id === schedule.trainerId)?.fullName ??
                          t('page.noTrainer'),
                        schedule.place,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  {!schedule.isActive && <Badge variant="secondary">{t('setup.inactive')}</Badge>}
                  <RowChevron />
                </button>
              </GroupedListItem>
            ))}
          </GroupedList>
        )}
      </Section>

      {editingType && (
        <TypeDialog
          type={editingType === 'new' ? null : editingType}
          onClose={() => {
            setEditingType(null);
          }}
        />
      )}
      {editingSchedule && types.data && (
        <ScheduleDialog
          schedule={editingSchedule === 'new' ? null : editingSchedule}
          branchId={branchId}
          types={types.data}
          onClose={() => {
            setEditingSchedule(null);
          }}
        />
      )}
    </div>
  );
}

function Section({
  title,
  add,
  onAdd,
  toolbar,
  children,
}: {
  readonly title: string;
  readonly add: string;
  readonly onAdd?: () => void;
  readonly toolbar?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <h2 className="text-lg">{title}</h2>
          {toolbar}
        </div>
        {onAdd && (
          <Button onClick={onAdd}>
            <PlusIcon data-icon="inline-start" />
            {add}
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

/** A dialog's footer: save and cancel. */
function SaveFooter({
  pending,
  onSave,
  onCancel,
}: {
  readonly pending: boolean;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation('classes');
  const { online, readOnly } = useAdminWriteState();
  return (
    <>
      <Button disabled={!online || readOnly || pending} onClick={onSave}>
        {pending && <Spinner />}
        {t('form.save')}
      </Button>
      <Button variant="outline" onClick={onCancel}>
        {t('form.cancel')}
      </Button>
    </>
  );
}

function ActiveField({
  value,
  onChange,
}: {
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
}) {
  const { t } = useTranslation('classes');
  const id = useId();
  return (
    <div className="flex items-center gap-3">
      <Checkbox
        id={id}
        checked={value}
        onCheckedChange={(checked) => {
          onChange(checked === true);
        }}
      />
      <Label htmlFor={id} className="font-normal">
        {t('form.active')}
      </Label>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  invalid,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly invalid: boolean;
}) {
  const { t } = useTranslation('classes');
  const id = useId();
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        inputMode="numeric"
        dir="ltr"
        className="tabular-nums"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      {invalid && <FieldError>{t('form.numberProblem')}</FieldError>}
    </Field>
  );
}

function TypeDialog({
  type,
  onClose,
}: {
  readonly type: ClassType | null;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('classes');
  const id = useId();
  const save = useSaveClassType();
  const [nameCkb, setNameCkb] = useState(type?.nameCkb ?? '');
  const [nameEn, setNameEn] = useState(type?.nameEn ?? '');
  const [nameAr, setNameAr] = useState(type?.nameAr ?? '');
  const [duration, setDuration] = useState(String(type?.durationMinutes ?? 60));
  const [capacity, setCapacity] = useState(String(type?.capacity ?? 20));
  const [isActive, setIsActive] = useState(type?.isActive ?? true);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<ClassErrorKey | null>(null);
  const name = normalizeName(nameCkb);
  const durationValue = parseWholeNumber(duration);
  const capacityValue = parseWholeNumber(capacity);
  const nameProblem = !isCleanText(name, 80);
  const durationProblem = durationValue === null || durationValue < 15 || durationValue > 240;
  const capacityProblem = capacityValue === null || capacityValue < 1 || capacityValue > 200;

  const confirm = () => {
    setSent(true);
    if (nameProblem || durationProblem || capacityProblem) return;
    setError(null);
    save.mutate(
      {
        id: type?.id ?? null,
        type: {
          nameCkb: name,
          nameEn: normalizeName(nameEn) || null,
          nameAr: normalizeName(nameAr) || null,
          durationMinutes: durationValue,
          capacity: capacityValue,
          isActive,
        },
      },
      {
        onSuccess: () => {
          toast.success(t('setup.typeSaved'));
          onClose();
        },
        onError: (thrown) => {
          setError(classErrorKey(thrown, 'save_type'));
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
      title={type ? localizedName(type, 'ckb') : t('setup.typeTitle')}
      footer={<SaveFooter pending={save.isPending} onSave={confirm} onCancel={onClose} />}
    >
      <FieldGroup data-testid="class-type-form">
        <Field data-invalid={(sent && nameProblem) || undefined}>
          <FieldLabel htmlFor={`${id}-ckb`}>{t('form.nameCkb')}</FieldLabel>
          <Input
            id={`${id}-ckb`}
            value={nameCkb}
            onChange={(event) => {
              setNameCkb(event.target.value);
            }}
          />
          {sent && nameProblem && <FieldError>{t('form.nameProblem')}</FieldError>}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${id}-en`}>{t('form.nameEn')}</FieldLabel>
            <Input
              id={`${id}-en`}
              dir="ltr"
              lang="en"
              value={nameEn}
              onChange={(event) => {
                setNameEn(event.target.value);
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-ar`}>{t('form.nameAr')}</FieldLabel>
            <Input
              id={`${id}-ar`}
              dir="rtl"
              lang="ar"
              value={nameAr}
              onChange={(event) => {
                setNameAr(event.target.value);
              }}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label={t('form.duration')}
            value={duration}
            onChange={setDuration}
            invalid={sent && durationProblem}
          />
          <NumberField
            label={t('form.capacity')}
            value={capacity}
            onChange={setCapacity}
            invalid={sent && capacityProblem}
          />
        </div>
        <ActiveField value={isActive} onChange={setIsActive} />
        <ClassError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}

function ScheduleDialog({
  schedule,
  branchId,
  types,
  onClose,
}: {
  readonly schedule: ClassSchedule | null;
  readonly branchId: string;
  readonly types: readonly ClassType[];
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('classes');
  const { language } = usePreferences();
  const id = useId();
  const today = useBaghdadToday();
  const trainers = useTrainers(schedule?.branchId ?? branchId);
  const save = useSaveClassSchedule();
  const choices = types.filter((type) => type.isActive || type.id === schedule?.classTypeId);
  const [typeId, setTypeId] = useState(schedule?.classTypeId ?? choices[0]?.id ?? '');
  const type = choices.find((each) => each.id === typeId);
  const [weekday, setWeekday] = useState<Weekday>(schedule?.weekday ?? 6);
  const [time, setTime] = useState(schedule?.startsAt ?? '18:00');
  const [duration, setDuration] = useState(
    String(schedule?.durationMinutes ?? type?.durationMinutes ?? 60),
  );
  const [capacity, setCapacity] = useState(String(schedule?.capacity ?? type?.capacity ?? 20));
  const [trainerId, setTrainerId] = useState(schedule?.trainerId ?? '');
  const [place, setPlace] = useState(schedule?.place ?? '');
  const [startsOn, setStartsOn] = useState(schedule?.startsOn ?? today);
  const [endsOn, setEndsOn] = useState(schedule?.endsOn ?? '');
  const [isActive, setIsActive] = useState(schedule?.isActive ?? true);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<ClassErrorKey | null>(null);
  const minute = clockToMinute(time);
  const durationValue = parseWholeNumber(duration);
  const capacityValue = parseWholeNumber(capacity);
  const durationProblem =
    durationValue === null ||
    durationValue < 15 ||
    durationValue > 240 ||
    (minute ?? 0) + durationValue >= 1440;
  const capacityProblem = capacityValue === null || capacityValue < 1 || capacityValue > 200;
  const years = [Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1];

  const confirm = () => {
    setSent(true);
    if (minute === null || durationProblem || capacityProblem || typeId === '') return;
    setError(null);
    save.mutate(
      {
        id: schedule?.id ?? null,
        schedule: {
          branchId: schedule?.branchId ?? branchId,
          classTypeId: typeId,
          weekday,
          startsAt: time,
          durationMinutes: durationValue,
          capacity: capacityValue,
          trainerId: trainerId === '' ? null : trainerId,
          place: place.trim() === '' ? null : place.trim(),
          startsOn,
          endsOn: endsOn === '' ? null : endsOn,
          isActive,
        },
      },
      {
        onSuccess: () => {
          toast.success(t('setup.scheduleSaved'));
          onClose();
        },
        onError: (thrown) => {
          setError(classErrorKey(thrown, 'save_schedule'));
        },
      },
    );
  };

  return (
    <ResponsiveDialog
      open
      wide
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('setup.scheduleTitle')}
      footer={<SaveFooter pending={save.isPending} onSave={confirm} onCancel={onClose} />}
    >
      <FieldGroup data-testid="class-schedule-form">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${id}-type`}>{t('form.type')}</FieldLabel>
            <NativeSelect
              id={`${id}-type`}
              value={typeId}
              onChange={(event) => {
                setTypeId(event.target.value);
              }}
            >
              {choices.map((each) => (
                <NativeSelectOption key={each.id} value={each.id}>
                  {localizedName(each, language)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-trainer`}>{t('form.trainer')}</FieldLabel>
            <NativeSelect
              id={`${id}-trainer`}
              value={trainerId}
              onChange={(event) => {
                setTrainerId(event.target.value);
              }}
            >
              <NativeSelectOption value="">{t('form.noTrainer')}</NativeSelectOption>
              {(trainers.data ?? []).map((each) => (
                <NativeSelectOption key={each.id} value={each.id}>
                  {each.fullName}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${id}-weekday`}>{t('form.weekday')}</FieldLabel>
            <NativeSelect
              id={`${id}-weekday`}
              value={String(weekday)}
              onChange={(event) => {
                setWeekday(WEEK_ORDER.find((day) => String(day) === event.target.value) ?? 6);
              }}
            >
              {WEEK_ORDER.map((day) => (
                <NativeSelectOption key={day} value={String(day)}>
                  {resources[language].dates.weekdays[day % 7]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field data-invalid={(sent && minute === null) || undefined}>
            <FieldLabel htmlFor={`${id}-time`}>{t('form.time')}</FieldLabel>
            <Input
              id={`${id}-time`}
              type="time"
              dir="ltr"
              value={time}
              onChange={(event) => {
                setTime(event.target.value);
              }}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label={t('form.duration')}
            value={duration}
            onChange={setDuration}
            invalid={sent && durationProblem}
          />
          <NumberField
            label={t('form.capacity')}
            value={capacity}
            onChange={setCapacity}
            invalid={sent && capacityProblem}
          />
        </div>
        <Field>
          <FieldLabel htmlFor={`${id}-place`}>{t('form.place')}</FieldLabel>
          <Input
            id={`${id}-place`}
            maxLength={60}
            value={place}
            onChange={(event) => {
              setPlace(event.target.value);
            }}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <DateSelectField
            label={t('form.startsOn')}
            value={startsOn}
            onChange={setStartsOn}
            years={years}
            allowEmpty={false}
          />
          <DateSelectField
            label={t('form.endsOn')}
            value={endsOn}
            onChange={setEndsOn}
            years={years}
          />
        </div>
        <ActiveField value={isActive} onChange={setIsActive} />
        <ClassError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}
