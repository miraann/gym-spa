import { SPA_LIMITS } from '@gym/core';
import { localizedName } from '@gym/i18n';
import { GroupedList, GroupedListItem, RowChevron } from '@gym/ui/blocks/list-group';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Button } from '@gym/ui/components/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { Spinner } from '@gym/ui/components/spinner';
import { groupedRowClass } from '@gym/ui/lib/grouped-list';
import { zodResolver } from '@hookform/resolvers/zod';
import { PackageIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { InactiveBadge, SetupSection } from './setup-section';
import {
  useSaveSpaPackage,
  useSpaPackages,
  useSpaServices,
  type SpaPackage,
  type SpaPackageDraft,
  type SpaService,
} from './spa-data';
import { SpaError } from './spa-error';
import { spaErrorKey, type SpaErrorKey } from './spa-errors';
import { CheckField, FormMessage, NameFields } from './spa-fields';
import { packageFormSchema, packageFormValues, type PackageFormValues } from './spa-forms';

/** /spa/setup/packages: the gym's spa packages (N sessions of a service), sold to members. */
export function PackagesSetup() {
  const { t } = useTranslation('spa');
  const { language } = usePreferences();
  const format = useFormat();
  const packages = useSpaPackages();
  const services = useSpaServices();
  const [editing, setEditing] = useState<SpaPackage | 'new' | null>(null);
  const serviceName = (id: string) => {
    const service = services.data?.find((each) => each.id === id);
    return service ? localizedName(service, language) : '';
  };
  const noServices = services.isSuccess && services.data.length === 0;

  return (
    <>
      <SetupSection
        addLabel={t('packages.add')}
        onAdd={() => {
          setEditing('new');
        }}
        canAdd={services.isSuccess && !noServices}
        pending={packages.isPending}
        error={packages.isError ? spaErrorKey(packages.error, 'load_packages') : null}
        empty={noServices ? t('packages.needService') : t('packages.empty')}
        emptyIcon={<PackageIcon />}
        isEmpty={packages.data?.length === 0}
      >
        <GroupedList aria-label={t('setup.tabs.packages')}>
          {packages.data?.map((pack) => (
            <GroupedListItem key={pack.id}>
              <button
                type="button"
                className={groupedRowClass()}
                data-spa-package={pack.nameCkb}
                onClick={() => {
                  setEditing(pack);
                }}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{localizedName(pack, language)}</span>
                    <span className="shrink-0 tabular-nums">{format.money(pack.price)}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                    <span>{serviceName(pack.serviceId)}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {t('packages.sessions', { count: format.number(pack.sessionCount) })}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {pack.validDays === null
                        ? t('packages.noLimit')
                        : t('packages.validFor', { count: format.number(pack.validDays) })}
                    </span>
                    {!pack.isActive && <InactiveBadge />}
                  </span>
                </span>
                <RowChevron />
              </button>
            </GroupedListItem>
          ))}
        </GroupedList>
      </SetupSection>
      {editing && services.data && (
        <PackageDialog
          pack={editing === 'new' ? null : editing}
          services={services.data}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function PackageDialog({
  pack,
  services,
  onClose,
}: {
  readonly pack: SpaPackage | null;
  readonly services: readonly SpaService[];
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('spa');
  const { language } = usePreferences();
  const formId = useId();
  const { online, readOnly } = useAdminWriteState();
  const save = useSaveSpaPackage();
  const [error, setError] = useState<SpaErrorKey | null>(null);
  // An inactive service stays choosable only for the package that already has it.
  const choices = services.filter((service) => service.isActive || service.id === pack?.serviceId);
  const form = useForm<PackageFormValues, unknown, SpaPackageDraft>({
    resolver: zodResolver(packageFormSchema),
    defaultValues: packageFormValues(pack, choices[0]?.id ?? ''),
  });
  const { errors } = form.formState;

  const submit = form.handleSubmit((values) => {
    setError(null);
    save.mutate(
      { id: pack?.id ?? null, pack: values },
      {
        onSuccess: () => {
          toast.success(t('packages.saved'));
          onClose();
        },
        onError: (thrown) => {
          setError(spaErrorKey(thrown, 'save_package'));
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
        pack
          ? t('packages.editTitle', { name: localizedName(pack, language) })
          : t('packages.newTitle')
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
        <FieldGroup data-testid="spa-package-form">
          <NameFields
            register={{
              ckb: form.register('nameCkb'),
              en: form.register('nameEn'),
              ar: form.register('nameAr'),
            }}
            errors={{ ckb: errors.nameCkb, en: errors.nameEn, ar: errors.nameAr }}
            max={SPA_LIMITS.serviceName}
          />
          <Field data-invalid={Boolean(errors.serviceId)}>
            <FieldLabel htmlFor={`${formId}-service`}>{t('form.service')}</FieldLabel>
            <NativeSelect id={`${formId}-service`} {...form.register('serviceId')}>
              {choices.map((service) => (
                <NativeSelectOption key={service.id} value={service.id}>
                  {localizedName(service, language)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FormMessage error={errors.serviceId} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field data-invalid={Boolean(errors.sessions)}>
              <FieldLabel htmlFor={`${formId}-sessions`}>{t('form.sessions')}</FieldLabel>
              <Input
                id={`${formId}-sessions`}
                inputMode="numeric"
                dir="ltr"
                className="tabular-nums"
                {...form.register('sessions')}
              />
              <FormMessage error={errors.sessions} max={SPA_LIMITS.maxSessions} />
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
            <Field data-invalid={Boolean(errors.validDays)}>
              <FieldLabel htmlFor={`${formId}-days`}>{t('form.validDays')}</FieldLabel>
              <Input
                id={`${formId}-days`}
                inputMode="numeric"
                dir="ltr"
                className="tabular-nums"
                {...form.register('validDays')}
              />
              <FieldDescription>{t('form.validDaysHint')}</FieldDescription>
              <FormMessage error={errors.validDays} max={SPA_LIMITS.maxValidDays} />
            </Field>
          </div>
          <Controller
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <CheckField
                label={t('form.active')}
                hint={t('form.packageActiveHint')}
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
