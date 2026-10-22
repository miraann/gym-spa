import { localizedName } from '@gym/i18n';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gym/ui/components/card';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminBranch } from '@/features/staff/admin-data';
import { usePreferences } from '@/lib/preferences';

/**
 * The branch the members of each value in the file's branch column join (or, without that column,
 * the branch all of them join). Values matched by name or code come chosen; staff choose the rest.
 */
export function ImportBranches({
  values,
  counts,
  hasBranchColumn,
  branches,
  branchFor,
  onChoose,
}: {
  readonly values: readonly string[];
  readonly counts: ReadonlyMap<string, number>;
  readonly hasBranchColumn: boolean;
  readonly branches: readonly AdminBranch[];
  readonly branchFor: (value: string) => string | null;
  readonly onChoose: (value: string, branchId: string) => void;
}) {
  const { t } = useTranslation('memberImport');
  const { language } = usePreferences();
  const id = useId();
  const select = (value: string, label: string, index: number) => (
    <NativeSelect
      id={`${id}-${String(index)}`}
      aria-label={label}
      value={branchFor(value) ?? ''}
      onChange={(event) => {
        onChoose(value, event.target.value);
      }}
    >
      <NativeSelectOption value="" disabled>
        {t('branches.choose')}
      </NativeSelectOption>
      {branches.map((branch) => (
        <NativeSelectOption key={branch.id} value={branch.id}>
          {localizedName(branch, language)}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );

  return (
    <Card data-testid="import-branches">
      <CardHeader>
        <CardTitle>{t('branches.title')}</CardTitle>
        <CardDescription>{t('branches.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {hasBranchColumn ? (
          <ul className="flex flex-col divide-y rounded-2xl border">
            {values.map((value, index) => {
              const label = value === '' ? t('branches.empty') : value;
              return (
                <li
                  key={value}
                  className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)] sm:items-center"
                >
                  <label htmlFor={`${id}-${String(index)}`} className="flex flex-col">
                    <span className="font-medium">{label}</span>
                    <span className="text-sm text-muted-foreground">
                      {t('branches.rows', { count: counts.get(value) ?? 0 })}
                    </span>
                  </label>
                  {select(value, label, index)}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col gap-2 sm:max-w-sm">
            <label htmlFor={`${id}-0`} className="text-sm font-medium">
              {t('branches.all')}
            </label>
            {select('', t('branches.all'), 0)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
