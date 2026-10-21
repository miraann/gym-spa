import {
  MEMBER_LIMITS,
  MIN_BIRTH_DATE,
  formatMemberNumber,
  formatMemberPhone,
  normalizeMemberTag,
} from '@gym/core';
import { localizeDigits, resources } from '@gym/i18n';
import { Alert, AlertDescription, AlertTitle } from '@gym/ui/components/alert';
import { Badge } from '@gym/ui/components/badge';
import { Button } from '@gym/ui/components/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { Link } from '@tanstack/react-router';
import { CircleAlertIcon, PhoneOffIcon, PlusIcon, XIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '@/lib/preferences';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useBaghdadToday } from '@/lib/use-today';
import { MemberStatusBadge } from './member-badges';
import { useMemberDuplicates, useMemberTags } from './member-data';

/**
 * A birth date as three choices (day, Sorani month name, year), the same on every platform:
 * browsers' date pickers differ, and their Kurdish month names too. The value is YYYY-MM-DD, empty
 * for no date, or a partial date the form reports as invalid.
 */
export function BirthDateField({
  value,
  onChange,
  error,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string;
}) {
  const { t } = useTranslation('members');
  const { language, digits } = usePreferences();
  const id = useId();
  const [year = '', month = '', day = ''] = value.split('-');
  const thisYear = Number(useBaghdadToday().slice(0, 4));
  const firstYear = Number(MIN_BIRTH_DATE.slice(0, 4));
  const years = Array.from({ length: thisYear - firstYear + 1 }, (_, index) => thisYear - index);
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
      <FieldLabel id={`${id}-label`}>{t('form.birthDate')}</FieldLabel>
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        className="grid grid-cols-[5rem_1fr_6rem] gap-2"
      >
        <NativeSelect
          aria-label={t('form.day')}
          value={day}
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            change('day', event.target.value);
          }}
        >
          <NativeSelectOption value="">{t('form.day')}</NativeSelectOption>
          {Array.from({ length: 31 }, (_, index) => index + 1).map((number) => (
            <NativeSelectOption key={number} value={String(number).padStart(2, '0')}>
              {localizeDigits(String(number), digits)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label={t('form.month')}
          value={month}
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            change('month', event.target.value);
          }}
        >
          <NativeSelectOption value="">{t('form.month')}</NativeSelectOption>
          {months.map((name, index) => (
            <NativeSelectOption key={name} value={String(index + 1).padStart(2, '0')}>
              {name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label={t('form.year')}
          value={year}
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            change('year', event.target.value);
          }}
        >
          <NativeSelectOption value="">{t('form.year')}</NativeSelectOption>
          {years.map((number) => (
            <NativeSelectOption key={number} value={String(number)}>
              {localizeDigits(String(number), digits)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}

/** Tags as chips: type one and press Enter (or the add button); the gym's tags are suggested. */
export function TagInput({
  value,
  onChange,
  error,
}: {
  readonly value: readonly string[];
  readonly onChange: (tags: string[]) => void;
  readonly error?: string;
}) {
  const { t } = useTranslation('members');
  const id = useId();
  const suggestions = useMemberTags();
  const [draft, setDraft] = useState('');

  const add = () => {
    const tag = normalizeMemberTag(draft);
    setDraft('');
    if (tag === '' || value.includes(tag)) return;
    onChange([...value, tag]);
  };

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={`${id}-input`}>{t('form.tags')}</FieldLabel>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label={t('form.tags')}>
          {value.map((tag) => (
            <li key={tag}>
              <Badge variant="secondary" className="gap-1 pe-1">
                {tag}
                <button
                  type="button"
                  aria-label={t('form.removeTag', { tag })}
                  className="inline-flex size-5 items-center justify-center rounded-full hover:bg-muted pointer-coarse:size-7"
                  onClick={() => {
                    onChange(value.filter((each) => each !== tag));
                  }}
                >
                  <XIcon className="size-3" aria-hidden="true" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          id={`${id}-input`}
          list={`${id}-suggestions`}
          value={draft}
          maxLength={MEMBER_LIMITS.tag}
          autoComplete="off"
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',' || event.key === '،') {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={add} aria-label={t('form.addTag')}>
          <PlusIcon aria-hidden="true" />
        </Button>
      </div>
      <datalist id={`${id}-suggestions`}>
        {(suggestions.data ?? [])
          .filter((tag) => !value.includes(tag))
          .map((tag) => (
            <option key={tag} value={tag} />
          ))}
      </datalist>
      <FieldDescription>{t('form.tagsHint')}</FieldDescription>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}

/**
 * Members who might be the same person, while the name and phone are typed. The same phone would
 * be refused when saving; a similar name is only a warning.
 */
export function DuplicateWarning({
  fullName,
  phone,
  excludeId,
}: {
  readonly fullName: string;
  /** The stored form of the typed phone, or null while it isn't a valid number. */
  readonly phone: string | null;
  readonly excludeId?: string;
}) {
  const { t } = useTranslation('members');
  const name = useDebouncedValue(fullName, 400);
  const settledPhone = useDebouncedValue(phone, 400);
  const duplicates = useMemberDuplicates(name, settledPhone, excludeId);
  const found = duplicates.data ?? [];
  if (found.length === 0) return null;
  const samePhone = found.filter((each) => each.match === 'phone');
  const sameName = found.filter((each) => each.match !== 'phone');

  return (
    <div className="flex flex-col gap-2" data-testid="member-duplicates">
      {samePhone.length > 0 && (
        <Alert variant="destructive">
          <PhoneOffIcon />
          <AlertTitle>{t('duplicates.phoneTitle')}</AlertTitle>
          <AlertDescription>
            <p>{t('duplicates.phoneText')}</p>
            <DuplicateList members={samePhone} />
          </AlertDescription>
        </Alert>
      )}
      {sameName.length > 0 && (
        <Alert variant="warning">
          <CircleAlertIcon />
          <AlertTitle>{t('duplicates.nameTitle')}</AlertTitle>
          <AlertDescription>
            <p>{t('duplicates.nameText')}</p>
            <DuplicateList members={sameName.slice(0, 5)} />
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function DuplicateList({
  members,
}: {
  readonly members: readonly {
    readonly id: string;
    readonly memberNumber: number;
    readonly fullName: string;
    readonly phone: string | null;
    readonly status: 'active' | 'suspended' | 'banned' | 'archived';
  }[];
}) {
  const { t } = useTranslation('members');
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {members.map((member) => (
        <li key={member.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-foreground">
          <span>{member.fullName}</span>
          <span dir="ltr" className="text-muted-foreground tabular-nums">
            {formatMemberNumber(member.memberNumber)}
          </span>
          {member.phone !== null && (
            <span dir="ltr" className="text-muted-foreground tabular-nums">
              {formatMemberPhone(member.phone)}
            </span>
          )}
          <MemberStatusBadge status={member.status} />
          <Button asChild variant="outline" size="sm">
            <Link to="/members/$memberId" params={{ memberId: member.id }}>
              {t('duplicates.open')}
            </Link>
          </Button>
          {member.status === 'archived' && (
            <span className="w-full text-sm text-muted-foreground">{t('duplicates.archived')}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
