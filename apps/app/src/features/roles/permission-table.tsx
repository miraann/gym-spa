import {
  PERMISSION_GROUPS,
  matchesSearch,
  type PermissionGroup,
  type PermissionKey,
} from '@gym/core';
import { Checkbox } from '@gym/ui/components/checkbox';
import { Input } from '@gym/ui/components/input';
import { Label } from '@gym/ui/components/label';
import { cn } from '@gym/ui/lib/utils';
import { LockIcon, SearchIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormat } from '@/lib/format';
import { usePermissionLabel } from './use-permission-label';

const ROW_CLASS =
  'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 font-normal transition-colors hover:bg-muted/50 has-disabled:hover:bg-transparent';

/**
 * The permission table (خشتەی دەسەڵاتەکان) of one role, grouped by module. Only permissions the
 * acting staff member has can be given (canGive); the server checks the same again.
 */
export function PermissionTable({
  selected,
  onChange,
  editable,
  canGive,
}: {
  readonly selected: ReadonlySet<string>;
  readonly onChange: (next: Set<string>) => void;
  readonly editable: boolean;
  readonly canGive: (key: PermissionKey) => boolean;
}) {
  const { t } = useTranslation('permissions');
  const format = useFormat();
  const label = usePermissionLabel();
  const [query, setQuery] = useState('');

  const groups = PERMISSION_GROUPS.map((group) => ({
    ...group,
    keys: group.keys.filter((key) =>
      matchesSearch(query, label(key), t(`modules.${group.module}`)),
    ),
  })).filter((group) => group.keys.length > 0);
  const total = PERMISSION_GROUPS.reduce((sum, group) => sum + group.keys.length, 0);
  const chosen = PERMISSION_GROUPS.flatMap((group) => group.keys).filter((key) =>
    selected.has(key),
  ).length;

  const toggle = (keys: readonly PermissionKey[], on: boolean) => {
    const next = new Set(selected);
    for (const key of keys) {
      if (!canGive(key)) continue;
      if (on) next.add(key);
      else next.delete(key);
    }
    onChange(next);
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="permission-table">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 id="permission-table">{t('table.title')}</h3>
          <p className="text-sm text-muted-foreground">{t('table.hint')}</p>
        </div>
        <span className="text-sm text-muted-foreground tabular-nums" data-testid="permission-count">
          {t('table.count', { chosen: format.number(chosen), total: format.number(total) })}
        </span>
      </div>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          placeholder={t('table.search')}
          aria-label={t('table.search')}
          className="ps-9"
        />
      </div>
      {groups.length === 0 ? (
        <p className="p-4 text-center text-sm text-muted-foreground">{t('table.noMatch')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <ModuleGroup
              key={group.module}
              group={group}
              selected={selected}
              editable={editable}
              canGive={canGive}
              label={label}
              onToggle={toggle}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ModuleGroup({
  group,
  selected,
  editable,
  canGive,
  label,
  onToggle,
}: {
  readonly group: PermissionGroup;
  readonly selected: ReadonlySet<string>;
  readonly editable: boolean;
  readonly canGive: (key: PermissionKey) => boolean;
  readonly label: (key: PermissionKey) => string;
  readonly onToggle: (keys: readonly PermissionKey[], on: boolean) => void;
}) {
  const { t } = useTranslation('permissions');
  const id = useId();
  const givable = group.keys.filter(canGive);
  const allOn = givable.length > 0 && givable.every((key) => selected.has(key));
  const someOn = group.keys.some((key) => selected.has(key));

  return (
    <fieldset className="rounded-2xl bg-card p-2 ring-1 ring-border" data-module={group.module}>
      <legend className="sr-only">{t(`modules.${group.module}`)}</legend>
      <Label htmlFor={`${id}-all`} className={cn(ROW_CLASS, 'border-b pb-3')}>
        <Checkbox
          id={`${id}-all`}
          checked={allOn ? true : someOn ? 'indeterminate' : false}
          disabled={!editable || givable.length === 0}
          onCheckedChange={(checked) => {
            onToggle(group.keys, checked === true);
          }}
          aria-label={t('table.allInModule', { module: t(`modules.${group.module}`) })}
        />
        <span className="text-base" aria-hidden="true">
          {t(`modules.${group.module}`)}
        </span>
      </Label>
      <ul className="flex flex-col">
        {group.keys.map((key) => {
          const itemId = `${id}-${key}`;
          const missing = !canGive(key);
          return (
            <li key={key}>
              <Label htmlFor={itemId} className={ROW_CLASS} data-permission={key}>
                <Checkbox
                  id={itemId}
                  checked={selected.has(key)}
                  disabled={!editable || missing}
                  onCheckedChange={(checked) => {
                    onToggle([key], checked === true);
                  }}
                />
                <span className="flex-1">{label(key)}</span>
                {editable && missing && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <LockIcon className="size-3.5" aria-hidden="true" />
                    {t('table.notYours')}
                  </span>
                )}
              </Label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
