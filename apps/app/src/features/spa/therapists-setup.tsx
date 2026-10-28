import { SPA_LIMITS, WEEK_ORDER, formatMemberPhone, type Weekday } from '@gym/core';
import { localizedName, resources } from '@gym/i18n';
import { ChoiceGroup } from '@gym/ui/blocks/choice-group';
import { GroupedList, GroupedListItem, RowChevron } from '@gym/ui/blocks/list-group';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Button } from '@gym/ui/components/button';
import { Checkbox } from '@gym/ui/components/checkbox';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Label } from '@gym/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { Spinner } from '@gym/ui/components/spinner';
import { groupedRowClass } from '@gym/ui/lib/grouped-list';
import { zodResolver } from '@hookform/resolvers/zod';
import { PlusIcon, UsersIcon, XIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePermission } from '@/features/auth/use-permissions';
import { useStaffDirectory } from '@/features/staff/admin-data';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { InactiveBadge, SetupSection } from './setup-section';
import {
  useSaveSpaTherapist,
  useSpaServices,
  useSpaTherapists,
  type SpaTherapist,
  type SpaTherapistDraft,
} from './spa-data';
import { SpaError } from './spa-error';
import { spaErrorKey, type SpaErrorKey } from './spa-errors';
import { useBranchChoice } from '@/lib/use-branch-choice';
import { BranchSelect } from '@/components/branch-select';
import { CheckField, FormMessage } from './spa-fields';
import { therapistFormSchema, therapistFormValues, type TherapistFormValues } from './spa-forms';

/** How many decimals a percent like 12.5 needs (0 for 10, at most 2). */
function decimals(value: number): number {
  if (Number.isInteger(value)) return 0;
  return Number.isInteger(value * 10) ? 1 : 2;
}

/** /spa/setup/therapists: a branch's spa staff, with what they do and when they work. */
export function TherapistsSetup() {
  const { t } = useTranslation('spa');
  const format = useFormat();
  const { branchId, setBranchId, active, loaded } = useBranchChoice();
  const therapists = useSpaTherapists(branchId);
  const [editing, setEditing] = useState<SpaTherapist | 'new' | null>(null);

  if (loaded && branchId === '') {
    return <p className="text-muted-foreground">{t('setup.noBranch')}</p>;
  }
  return (
    <>
      <SetupSection
        addLabel={t('therapists.add')}
        onAdd={() => {
          setEditing('new');
        }}
        canAdd={branchId !== ''}
        pending={therapists.isPending}
        error={therapists.isError ? spaErrorKey(therapists.error, 'load_therapists') : null}
        empty={t('therapists.empty')}
        emptyIcon={<UsersIcon />}
        isEmpty={therapists.data?.length === 0}
        toolbar={
          <BranchSelect
            label={t('setup.branch')}
            branchId={branchId}
            active={active}
            onChange={setBranchId}
          />
        }
      >
        <GroupedList aria-label={t('setup.tabs.therapists')}>
          {therapists.data?.map((therapist) => (
            <GroupedListItem key={therapist.id}>
              <button
                type="button"
                className={groupedRowClass()}
                data-spa-therapist={therapist.fullName}
                onClick={() => {
                  setEditing(therapist);
                }}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate font-medium">{therapist.fullName}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                    <span>
                      {t('therapists.serviceCount', {
                        count: format.number(therapist.serviceIds.length),
                      })}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {t('therapists.commission', {
                        percent: `${format.number(therapist.commissionPercent, decimals(therapist.commissionPercent))}%`,
                      })}
                    </span>
                    {therapist.hours.length === 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{t('therapists.noHours')}</span>
                      </>
                    )}
                    {!therapist.isActive && <InactiveBadge />}
                  </span>
                </span>
                <RowChevron />
              </button>
            </GroupedListItem>
          ))}
        </GroupedList>
      </SetupSection>
      {editing && (
        <TherapistDialog
          branchId={branchId}
          therapist={editing === 'new' ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function TherapistDialog({
  branchId,
  therapist,
  onClose,
}: {
  readonly branchId: string;
  readonly therapist: SpaTherapist | null;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('spa');
  const { language } = usePreferences();
  const formId = useId();
  const { online, readOnly } = useAdminWriteState();
  const save = useSaveSpaTherapist();
  const services = useSpaServices();
  const mayViewStaff = usePermission('staff.view');
  const staff = useStaffDirectory();
  const [error, setError] = useState<SpaErrorKey | null>(null);
  const form = useForm<TherapistFormValues, unknown, SpaTherapistDraft>({
    resolver: zodResolver(therapistFormSchema(therapist?.branchId ?? branchId)),
    defaultValues: therapistFormValues(therapist),
  });
  const { errors } = form.formState;
  const logins = mayViewStaff ? (staff.data ?? []).filter((each) => each.isActive) : [];

  const submit = form.handleSubmit((values) => {
    setError(null);
    save.mutate(
      { id: therapist?.id ?? null, therapist: values },
      {
        onSuccess: () => {
          toast.success(t('therapists.saved', { name: values.fullName }));
          onClose();
        },
        onError: (thrown) => {
          setError(spaErrorKey(thrown, 'save_therapist'));
        },
      },
    );
  });

  return (
    <ResponsiveDialog
      open
      wide
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={
        therapist
          ? t('therapists.editTitle', { name: therapist.fullName })
          : t('therapists.newTitle')
      }
      footer={
        <>
          <Button type="submit" form={formId} disabled={!online || readOnly || save.isPending}>
            {save.isPending && <Spinner />}
            {t('actions.save')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={(event) => void submit(event)}>
        <FieldGroup data-testid="spa-therapist-form">
          <Field data-invalid={Boolean(errors.fullName)}>
            <FieldLabel htmlFor={`${formId}-name`}>{t('form.fullName')}</FieldLabel>
            <Input id={`${formId}-name`} autoComplete="off" {...form.register('fullName')} />
            <FormMessage error={errors.fullName} max={SPA_LIMITS.therapistName} />
          </Field>
          <Field>
            <FieldLabel>{t('form.gender2')}</FieldLabel>
            <Controller
              control={form.control}
              name="gender"
              render={({ field }) => (
                <ChoiceGroup
                  label={t('form.gender2')}
                  value={field.value}
                  choices={(['female', 'male'] as const).map((each) => ({
                    value: each,
                    label: t(`therapistGenders.${each}`),
                  }))}
                  onChange={field.onChange}
                />
              )}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.phone)}>
              <FieldLabel htmlFor={`${formId}-phone`}>{t('form.phone')}</FieldLabel>
              <Input
                id={`${formId}-phone`}
                type="tel"
                dir="ltr"
                autoComplete="off"
                {...form.register('phone')}
                placeholder={formatMemberPhone('+9647501234567')}
              />
              <FormMessage error={errors.phone} />
            </Field>
            <Field data-invalid={Boolean(errors.commission)}>
              <FieldLabel htmlFor={`${formId}-commission`}>{t('form.commission')}</FieldLabel>
              <Input
                id={`${formId}-commission`}
                inputMode="decimal"
                dir="ltr"
                className="tabular-nums"
                {...form.register('commission')}
              />
              <FieldDescription>{t('form.commissionHint')}</FieldDescription>
              <FormMessage error={errors.commission} />
            </Field>
          </div>
          {logins.length > 0 && (
            <Field>
              <FieldLabel htmlFor={`${formId}-login`}>{t('form.staffLogin')}</FieldLabel>
              <NativeSelect id={`${formId}-login`} {...form.register('staffUserId')}>
                <NativeSelectOption value="">{t('form.noStaffLogin')}</NativeSelectOption>
                {logins.map((each) => (
                  <NativeSelectOption key={each.id} value={each.id}>
                    {each.fullName}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>{t('form.staffLoginHint')}</FieldDescription>
            </Field>
          )}
          <Controller
            control={form.control}
            name="serviceIds"
            render={({ field }) => (
              <FieldSet>
                <FieldLegend variant="label">{t('form.servicesDone')}</FieldLegend>
                {services.data?.length === 0 ? (
                  <FieldDescription>{t('form.noServices')}</FieldDescription>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {services.data
                      ?.filter(
                        (service) => service.needsTherapist || field.value.includes(service.id),
                      )
                      .map((service) => {
                        const id = `${formId}-service-${service.id}`;
                        return (
                          <div key={service.id} className="flex items-center gap-3">
                            <Checkbox
                              id={id}
                              checked={field.value.includes(service.id)}
                              onCheckedChange={(checked) => {
                                field.onChange(
                                  checked === true
                                    ? [...field.value, service.id]
                                    : field.value.filter((each) => each !== service.id),
                                );
                              }}
                            />
                            <Label htmlFor={id} className="font-normal">
                              {localizedName(service, language)}
                            </Label>
                          </div>
                        );
                      })}
                  </div>
                )}
              </FieldSet>
            )}
          />
          <Controller
            control={form.control}
            name="hours"
            render={({ field }) => (
              <HoursEditor
                value={field.value}
                onChange={field.onChange}
                invalid={Boolean(errors.hours)}
              />
            )}
          />
          <FormMessage error={errors.hours} />
          <Controller
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <CheckField
                label={t('form.active')}
                hint={t('form.activeHint')}
                checked={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <SpaError error={error} />
        </FieldGroup>
      </form>
    </ResponsiveDialog>
  );
}

type HoursValue = TherapistFormValues['hours'];

/** The weekly hours: each weekday in the gym's week order, with its windows or "day off". */
function HoursEditor({
  value,
  onChange,
  invalid,
}: {
  readonly value: HoursValue;
  readonly onChange: (value: HoursValue) => void;
  readonly invalid: boolean;
}) {
  const { t } = useTranslation('spa');
  const { language } = usePreferences();
  const id = useId();
  const dayName = (day: Weekday) => resources[language].dates.weekdays[day % 7] ?? '';

  const change = (index: number, key: 'from' | 'until', clock: string) => {
    onChange(value.map((window, each) => (each === index ? { ...window, [key]: clock } : window)));
  };

  return (
    <FieldSet data-invalid={invalid || undefined} data-testid="spa-hours">
      <FieldLegend variant="label">{t('form.hours')}</FieldLegend>
      <FieldDescription>{t('form.hoursHint')}</FieldDescription>
      <ul className="flex flex-col gap-2">
        {WEEK_ORDER.map((day) => {
          const windows = value.flatMap((window, index) =>
            window.weekday === day ? [{ window, index }] : [],
          );
          return (
            <li
              key={day}
              className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 px-3 py-2"
              data-weekday={day}
            >
              <span className="w-24 shrink-0 text-sm">{dayName(day)}</span>
              <div className="flex flex-1 flex-col gap-2">
                {windows.length === 0 && (
                  <span className="text-sm text-muted-foreground">{t('form.dayOff')}</span>
                )}
                {windows.map(({ window, index }) => (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <Label htmlFor={`${id}-${String(index)}-from`} className="sr-only">
                      {`${dayName(day)} ${t('form.from')}`}
                    </Label>
                    <Input
                      id={`${id}-${String(index)}-from`}
                      type="time"
                      dir="ltr"
                      className="w-32"
                      value={window.from}
                      onChange={(event) => {
                        change(index, 'from', event.target.value);
                      }}
                    />
                    <span aria-hidden="true" className="text-muted-foreground">
                      {t('form.until')}
                    </span>
                    <Label htmlFor={`${id}-${String(index)}-until`} className="sr-only">
                      {`${dayName(day)} ${t('form.until')}`}
                    </Label>
                    <Input
                      id={`${id}-${String(index)}-until`}
                      type="time"
                      dir="ltr"
                      className="w-32"
                      value={window.until === '24:00' ? '23:59' : window.until}
                      onChange={(event) => {
                        // The time input can't say 24:00: its last minute stands for midnight.
                        change(
                          index,
                          'until',
                          event.target.value === '23:59' ? '24:00' : event.target.value,
                        );
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('form.removeHours')}
                      onClick={() => {
                        onChange(value.filter((_, each) => each !== index));
                      }}
                    >
                      <XIcon aria-hidden />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={t('form.addHours', { day: dayName(day) })}
                onClick={() => {
                  const last = windows.at(-1)?.window;
                  onChange([
                    ...value,
                    last
                      ? {
                          weekday: day,
                          from: last.until === '24:00' ? '23:00' : last.until,
                          until: '24:00',
                        }
                      : { weekday: day, from: '09:00', until: '17:00' },
                  ]);
                }}
              >
                <PlusIcon aria-hidden />
              </Button>
            </li>
          );
        })}
      </ul>
    </FieldSet>
  );
}
