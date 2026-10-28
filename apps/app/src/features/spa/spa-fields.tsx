import { localizedName } from '@gym/i18n';
import { Checkbox } from '@gym/ui/components/checkbox';
import { Field, FieldDescription, FieldError, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Label } from '@gym/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { useId } from 'react';
import type { FieldError as HookFieldError, UseFormRegisterReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { AdminBranch } from '@/features/staff/admin-data';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';

// Pieces the spa's forms share.

const MESSAGES = [
  'nameRequired',
  'name',
  'duration',
  'cleanup',
  'price',
  'capacity',
  'commission',
  'phone',
  'hours',
  'sessions',
  'validDays',
  'service',
] as const;

/** A field's message (a key of spa:form.errors), with the limits its words name. */
export function FormMessage({
  error,
  min,
  max,
}: {
  readonly error: Pick<HookFieldError, 'message'> | undefined;
  readonly min?: number;
  readonly max?: number;
}) {
  const { t } = useTranslation('spa');
  const format = useFormat();
  const key = MESSAGES.find((each) => each === error?.message);
  if (!key) return null;
  return (
    <FieldError>
      {t(`form.errors.${key}`, {
        min: format.number(min ?? 0),
        max: format.number(max ?? 0),
      })}
    </FieldError>
  );
}

/** A name in Kurdish (required), English and Arabic (optional). */
export function NameFields({
  register,
  errors,
  max,
  label,
}: {
  readonly register: {
    readonly ckb: UseFormRegisterReturn;
    readonly en: UseFormRegisterReturn;
    readonly ar: UseFormRegisterReturn;
  };
  readonly errors: {
    readonly ckb?: Pick<HookFieldError, 'message'>;
    readonly en?: Pick<HookFieldError, 'message'>;
    readonly ar?: Pick<HookFieldError, 'message'>;
  };
  readonly max: number;
  /** The Kurdish name's label, when it isn't just "name in Kurdish". */
  readonly label?: string;
}) {
  const { t } = useTranslation('spa');
  const id = useId();
  return (
    <>
      <Field data-invalid={Boolean(errors.ckb)}>
        <FieldLabel htmlFor={`${id}-ckb`}>{label ?? t('form.nameCkb')}</FieldLabel>
        <Input id={`${id}-ckb`} autoComplete="off" {...register.ckb} />
        <FormMessage error={errors.ckb} max={max} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={Boolean(errors.en)}>
          <FieldLabel htmlFor={`${id}-en`}>{t('form.nameEn')}</FieldLabel>
          <Input id={`${id}-en`} dir="ltr" lang="en" autoComplete="off" {...register.en} />
          <FormMessage error={errors.en} max={max} />
        </Field>
        <Field data-invalid={Boolean(errors.ar)}>
          <FieldLabel htmlFor={`${id}-ar`}>{t('form.nameAr')}</FieldLabel>
          <Input id={`${id}-ar`} dir="rtl" lang="ar" autoComplete="off" {...register.ar} />
          <FormMessage error={errors.ar} max={max} />
        </Field>
      </div>
    </>
  );
}

/** A yes/no field with a hint. */
export function CheckField({
  label,
  hint,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <Field>
      <div className="flex items-center gap-3">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(next) => {
            onChange(next === true);
          }}
        />
        <Label htmlFor={id} className="font-normal">
          {label}
        </Label>
      </div>
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  );
}

/** Picks the branch, when the staff member has more than one. */
export function BranchSelect({
  branchId,
  active,
  onChange,
}: {
  readonly branchId: string;
  readonly active: readonly AdminBranch[];
  readonly onChange: (branchId: string) => void;
}) {
  const { t } = useTranslation('spa');
  const { language } = usePreferences();
  const id = useId();
  if (active.length < 2) return null;
  return (
    <Field className="md:w-72">
      <FieldLabel htmlFor={id}>{t('setup.branch')}</FieldLabel>
      <NativeSelect
        id={id}
        value={branchId}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        {active.map((branch) => (
          <NativeSelectOption key={branch.id} value={branch.id}>
            {localizedName(branch, language)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}
