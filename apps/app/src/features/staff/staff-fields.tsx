import { localizedName } from '@gym/i18n';
import { Badge } from '@gym/ui/components/badge';
import { Checkbox } from '@gym/ui/components/checkbox';
import { FieldDescription, FieldError, FieldLegend, FieldSet } from '@gym/ui/components/field';
import { Label } from '@gym/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@gym/ui/components/radio-group';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '@/lib/preferences';
import { useFormat } from '@/lib/format';
import type { AdminBranch, RoleInfo } from './admin-data';

const OPTION_CLASS =
  'flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-3 font-normal transition-colors hover:bg-muted/50 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted has-disabled:cursor-not-allowed has-disabled:opacity-60';

/**
 * The role to give: every role the acting staff member may give (the server's can_grant), plus
 * the staff member's current one even when it can't be given, so it still shows.
 */
export function RolePicker({
  roles,
  value,
  onChange,
  error,
  disabled = false,
}: {
  readonly roles: readonly RoleInfo[];
  readonly value: string;
  readonly onChange: (roleId: string) => void;
  readonly error?: string;
  readonly disabled?: boolean;
}) {
  const { t } = useTranslation('staff');
  const { language } = usePreferences();
  const format = useFormat();
  const id = useId();
  const shown = roles.filter((role) => role.canGrant || role.id === value);

  return (
    <FieldSet data-invalid={error !== undefined}>
      <FieldLegend variant="label">{t('form.role')}</FieldLegend>
      <FieldDescription>{t('form.roleHint')}</FieldDescription>
      <RadioGroup
        aria-label={t('form.role')}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        className="grid gap-2 sm:grid-cols-2"
      >
        {shown.map((role) => {
          const itemId = `${id}-${role.id}`;
          return (
            <Label key={role.id} htmlFor={itemId} className={OPTION_CLASS}>
              <RadioGroupItem id={itemId} value={role.id} disabled={!role.canGrant} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{localizedName(role, language)}</span>
                <span className="text-xs text-muted-foreground">
                  {role.key === 'owner'
                    ? t('roles.allPermissions')
                    : t('roles.permissionCount', {
                        number: format.number(role.permissionKeys.length),
                      })}
                </span>
              </span>
            </Label>
          );
        })}
      </RadioGroup>
      {error && <FieldError>{error}</FieldError>}
    </FieldSet>
  );
}

/**
 * Where the staff member works: all branches (only someone with all branches can give it), or
 * the listed ones the acting staff member can access. hiddenCount: their branches the acting
 * staff member can't see, which stay as they are.
 */
export function BranchPicker({
  branches,
  allBranches,
  branchIds,
  canGiveAll,
  hiddenCount = 0,
  onChange,
  error,
  disabled = false,
}: {
  readonly branches: readonly AdminBranch[];
  readonly allBranches: boolean;
  readonly branchIds: readonly string[];
  readonly canGiveAll: boolean;
  readonly hiddenCount?: number;
  readonly onChange: (value: { allBranches: boolean; branchIds: string[] }) => void;
  readonly error?: string;
  readonly disabled?: boolean;
}) {
  const { t } = useTranslation('staff');
  const { language } = usePreferences();
  const format = useFormat();
  const id = useId();
  const chosen = new Set(branchIds);

  return (
    <FieldSet data-invalid={error !== undefined}>
      <FieldLegend variant="label">{t('form.branches')}</FieldLegend>
      <FieldDescription>{t('form.branchesHint')}</FieldDescription>
      <div className="grid gap-2 sm:grid-cols-2">
        {(canGiveAll || allBranches) && (
          <Label htmlFor={`${id}-all`} className={`${OPTION_CLASS} sm:col-span-2`}>
            <Checkbox
              id={`${id}-all`}
              checked={allBranches}
              disabled={disabled || !canGiveAll}
              onCheckedChange={(checked) => {
                onChange({ allBranches: checked === true, branchIds: [...branchIds] });
              }}
            />
            <span className="flex flex-col">
              <span>{t('form.allBranches')}</span>
              <span className="text-xs text-muted-foreground">{t('form.allBranchesHint')}</span>
            </span>
          </Label>
        )}
        {!allBranches &&
          branches.map((branch) => {
            const itemId = `${id}-${branch.id}`;
            return (
              <Label key={branch.id} htmlFor={itemId} className={OPTION_CLASS}>
                <Checkbox
                  id={itemId}
                  checked={chosen.has(branch.id)}
                  disabled={disabled}
                  onCheckedChange={(checked) => {
                    const next = new Set(chosen);
                    if (checked === true) next.add(branch.id);
                    else next.delete(branch.id);
                    onChange({ allBranches: false, branchIds: [...next] });
                  }}
                />
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="truncate">{localizedName(branch, language)}</span>
                  <span className="flex items-center gap-1">
                    {!branch.isActive && (
                      <Badge variant="secondary">{t('form.branchInactive')}</Badge>
                    )}
                    <span dir="ltr" className="font-mono text-xs text-muted-foreground">
                      {branch.code}
                    </span>
                  </span>
                </span>
              </Label>
            );
          })}
      </div>
      {!allBranches && hiddenCount > 0 && (
        <FieldDescription>
          {t('form.hiddenBranches', { number: format.number(hiddenCount) })}
        </FieldDescription>
      )}
      {error && <FieldError>{error}</FieldError>}
    </FieldSet>
  );
}
