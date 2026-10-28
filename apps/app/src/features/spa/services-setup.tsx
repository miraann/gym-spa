import { SPA_GENDERS, SPA_KINDS, SPA_LIMITS } from '@gym/core';
import { localizedName } from '@gym/i18n';
import { ChoiceGroup } from '@gym/ui/blocks/choice-group';
import { GroupedList, GroupedListItem, RowChevron } from '@gym/ui/blocks/list-group';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Button } from '@gym/ui/components/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { Spinner } from '@gym/ui/components/spinner';
import { groupedRowClass } from '@gym/ui/lib/grouped-list';
import { zodResolver } from '@hookform/resolvers/zod';
import { BathIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { InactiveBadge, SetupSection } from './setup-section';
import {
  useSaveSpaService,
  useSpaServices,
  type SpaService,
  type SpaServiceDraft,
} from './spa-data';
import { SpaError } from './spa-error';
import { spaErrorKey, type SpaErrorKey } from './spa-errors';
import { CheckField, FormMessage, NameFields } from './spa-fields';
import { serviceFormSchema, serviceFormValues, type ServiceFormValues } from './spa-forms';

/** /spa/setup/services: the gym's services, added and changed in a dialog. */
export function ServicesSetup() {
  const { t } = useTranslation('spa');
  const { language } = usePreferences();
  const format = useFormat();
  const services = useSpaServices();
  const [editing, setEditing] = useState<SpaService | 'new' | null>(null);

  return (
    <>
      <SetupSection
        addLabel={t('services.add')}
        onAdd={() => {
          setEditing('new');
        }}
        canAdd
        pending={services.isPending}
        error={services.isError ? spaErrorKey(services.error, 'load_services') : null}
        empty={t('services.empty')}
        emptyIcon={<BathIcon />}
        isEmpty={services.data?.length === 0}
      >
        <GroupedList aria-label={t('setup.tabs.services')}>
          {services.data?.map((service) => (
            <GroupedListItem key={service.id}>
              <button
                type="button"
                className={groupedRowClass()}
                data-spa-service={service.nameCkb}
                onClick={() => {
                  setEditing(service);
                }}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{localizedName(service, language)}</span>
                    <span className="shrink-0 tabular-nums">{format.money(service.price)}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                    <span>{t(`kinds.${service.kind}`)}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {t('services.minutes', { count: format.number(service.durationMinutes) })}
                    </span>
                    {service.gender !== 'any' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{t(`genders.${service.gender}`)}</span>
                      </>
                    )}
                    {!service.needsTherapist && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{t('services.noTherapist')}</span>
                      </>
                    )}
                    {!service.isActive && <InactiveBadge />}
                  </span>
                </span>
                <RowChevron />
              </button>
            </GroupedListItem>
          ))}
        </GroupedList>
      </SetupSection>
      {editing && (
        <ServiceDialog
          service={editing === 'new' ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function ServiceDialog({
  service,
  onClose,
}: {
  readonly service: SpaService | null;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('spa');
  const { language } = usePreferences();
  const formId = useId();
  const { online, readOnly } = useAdminWriteState();
  const save = useSaveSpaService();
  const [error, setError] = useState<SpaErrorKey | null>(null);
  const form = useForm<ServiceFormValues, unknown, SpaServiceDraft>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: serviceFormValues(service),
  });
  const { errors } = form.formState;

  const submit = form.handleSubmit((values) => {
    setError(null);
    save.mutate(
      { id: service?.id ?? null, service: values },
      {
        onSuccess: () => {
          toast.success(t('services.saved'));
          onClose();
        },
        onError: (thrown) => {
          setError(spaErrorKey(thrown, 'save_service'));
        },
      },
    );
  });

  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={
        service
          ? t('services.editTitle', { name: localizedName(service, language) })
          : t('services.newTitle')
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
        <FieldGroup data-testid="spa-service-form">
          <NameFields
            register={{
              ckb: form.register('nameCkb'),
              en: form.register('nameEn'),
              ar: form.register('nameAr'),
            }}
            errors={{ ckb: errors.nameCkb, en: errors.nameEn, ar: errors.nameAr }}
            max={SPA_LIMITS.serviceName}
          />
          <Field>
            <FieldLabel htmlFor={`${formId}-kind`}>{t('form.kind')}</FieldLabel>
            <NativeSelect id={`${formId}-kind`} {...form.register('kind')}>
              {SPA_KINDS.map((kind) => (
                <NativeSelectOption key={kind} value={kind}>
                  {t(`kinds.${kind}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldDescription>{t('form.kindHint')}</FieldDescription>
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field data-invalid={Boolean(errors.duration)}>
              <FieldLabel htmlFor={`${formId}-duration`}>{t('form.duration')}</FieldLabel>
              <Input
                id={`${formId}-duration`}
                inputMode="numeric"
                dir="ltr"
                className="tabular-nums"
                {...form.register('duration')}
              />
              <FormMessage
                error={errors.duration}
                min={SPA_LIMITS.minDuration}
                max={SPA_LIMITS.maxDuration}
              />
            </Field>
            <Field data-invalid={Boolean(errors.cleanup)}>
              <FieldLabel htmlFor={`${formId}-cleanup`}>{t('form.cleanup')}</FieldLabel>
              <Input
                id={`${formId}-cleanup`}
                inputMode="numeric"
                dir="ltr"
                className="tabular-nums"
                {...form.register('cleanup')}
              />
              <FormMessage error={errors.cleanup} max={SPA_LIMITS.maxCleanup} />
            </Field>
            <Field data-invalid={Boolean(errors.price)}>
              <FieldLabel htmlFor={`${formId}-price`}>{t('form.price')}</FieldLabel>
              <Input
                id={`${formId}-price`}
                inputMode="numeric"
                dir="ltr"
                className="tabular-nums"
                {...form.register('price')}
              />
              <FormMessage error={errors.price} />
            </Field>
          </div>
          <FieldDescription>{t('form.cleanupHint')}</FieldDescription>
          <Field>
            <FieldLabel>{t('form.gender')}</FieldLabel>
            <Controller
              control={form.control}
              name="gender"
              render={({ field }) => (
                <ChoiceGroup
                  label={t('form.gender')}
                  value={field.value}
                  choices={SPA_GENDERS.map((each) => ({
                    value: each,
                    label: t(`genders.${each}`),
                  }))}
                  onChange={field.onChange}
                />
              )}
            />
          </Field>
          <Controller
            control={form.control}
            name="needsTherapist"
            render={({ field }) => (
              <CheckField
                label={t('form.needsTherapist')}
                hint={t('form.needsTherapistHint')}
                checked={field.value}
                onChange={field.onChange}
              />
            )}
          />
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
