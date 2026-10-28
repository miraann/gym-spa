import { localizedName } from '@gym/i18n';
import { Field, FieldLabel } from '@gym/ui/components/field';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { useId } from 'react';
import type { AdminBranch } from '@/features/staff/admin-data';
import { usePreferences } from '@/lib/preferences';

/** Picks the branch, when the staff member has more than one. */
export function BranchSelect({
  label,
  branchId,
  active,
  onChange,
}: {
  readonly label: string;
  readonly branchId: string;
  readonly active: readonly AdminBranch[];
  readonly onChange: (branchId: string) => void;
}) {
  const { language } = usePreferences();
  const id = useId();
  if (active.length < 2) return null;
  return (
    <Field className="md:w-72">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
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
