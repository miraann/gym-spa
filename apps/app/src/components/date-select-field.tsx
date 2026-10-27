import { localizeDigits, resources } from '@gym/i18n';
import { Field, FieldDescription, FieldError, FieldLabel } from '@gym/ui/components/field';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import type { ReactNode } from 'react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '@/lib/preferences';

/**
 * A date as three choices (day, Sorani month name, year), the same on every platform: browsers'
 * date pickers differ, and their Kurdish month names too. The value is YYYY-MM-DD, empty for no
 * date, or a partial date the form reports as invalid. `years` in the order they are listed.
 */
export function DateSelectField({
  label,
  value,
  onChange,
  years,
  error,
  description,
  allowEmpty = true,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly years: readonly number[];
  readonly error?: string | null;
  readonly description?: ReactNode;
  /** false: no empty choice, for a date that is always set. */
  readonly allowEmpty?: boolean;
}) {
  const { t } = useTranslation('dates');
  const { language, digits } = usePreferences();
  const id = useId();
  const [year = '', month = '', day = ''] = value.split('-');
  const months = resources[language].dates.months;

  const change = (part: 'year' | 'month' | 'day', next: string) => {
    const parts = { year, month, day, [part]: next };
    onChange(
      parts.year === '' && parts.month === '' && parts.day === ''
        ? ''
        : `${parts.year}-${parts.month}-${parts.day}`,
    );
  };

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel id={`${id}-label`}>{label}</FieldLabel>
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        className="grid grid-cols-[5rem_1fr_6rem] gap-2"
      >
        <NativeSelect
          aria-label={t('parts.day')}
          value={day}
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            change('day', event.target.value);
          }}
        >
          {(allowEmpty || day === '') && (
            <NativeSelectOption value="">{t('parts.day')}</NativeSelectOption>
          )}
          {Array.from({ length: 31 }, (_, index) => index + 1).map((number) => (
            <NativeSelectOption key={number} value={String(number).padStart(2, '0')}>
              {localizeDigits(String(number), digits)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label={t('parts.month')}
          value={month}
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            change('month', event.target.value);
          }}
        >
          {(allowEmpty || month === '') && (
            <NativeSelectOption value="">{t('parts.month')}</NativeSelectOption>
          )}
          {months.map((name, index) => (
            <NativeSelectOption key={name} value={String(index + 1).padStart(2, '0')}>
              {name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label={t('parts.year')}
          value={year}
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            change('year', event.target.value);
          }}
        >
          {(allowEmpty || year === '') && (
            <NativeSelectOption value="">{t('parts.year')}</NativeSelectOption>
          )}
          {years.map((number) => (
            <NativeSelectOption key={number} value={String(number)}>
              {localizeDigits(String(number), digits)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {description && <FieldDescription>{description}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}
