import { PageHeader } from '@gym/ui/blocks/page-header';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Badge } from '@gym/ui/components/badge';
import { Button } from '@gym/ui/components/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@gym/ui/components/empty';
import { Field, FieldLabel } from '@gym/ui/components/field';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { Skeleton } from '@gym/ui/components/skeleton';
import { HistoryIcon, TriangleAlertIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RequirePermission } from '@/components/no-access';
import { DateSelectField } from '@/components/date-select-field';
import { useStaffDirectory } from '@/features/staff/admin-data';
import { useFormat } from '@/lib/format';
import { useBaghdadToday } from '@/lib/use-today';
import {
  entryColumns,
  useAuditLog,
  useAuditTables,
  valueText,
  type AuditEntry,
  type AuditFilter,
} from './audit-data';

/** /audit (audit.view): who changed what, and when. Read only. */
export function AuditPage() {
  return (
    <RequirePermission permission="audit.view">
      <AuditLog />
    </RequirePermission>
  );
}

function AuditLog() {
  const { t } = useTranslation('audit');
  const id = useId();
  const today = useBaghdadToday();
  const year = Number(today.slice(0, 4));
  const tables = useAuditTables();
  const staff = useStaffDirectory();
  const [filter, setFilter] = useState<AuditFilter>({ table: '', actorId: '', from: '', to: '' });
  const log = useAuditLog(filter);
  const names = new Map((staff.data ?? []).map((member) => [member.id, member.fullName]));
  const entries = log.data?.pages.flat() ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <section className="flex flex-col gap-4 rounded-card bg-card p-4 shadow-sm ring-1 ring-foreground/6 md:flex-row md:flex-wrap md:items-end md:p-5">
        <Field className="md:w-56">
          <FieldLabel htmlFor={`${id}-table`}>{t('table')}</FieldLabel>
          <NativeSelect
            id={`${id}-table`}
            value={filter.table}
            onChange={(event) => {
              setFilter((current) => ({ ...current, table: event.target.value }));
            }}
          >
            <NativeSelectOption value="">{t('allTables')}</NativeSelectOption>
            {(tables.data ?? []).map((table) => (
              <NativeSelectOption key={table} value={table}>
                {table}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className="md:w-56">
          <FieldLabel htmlFor={`${id}-actor`}>{t('who')}</FieldLabel>
          <NativeSelect
            id={`${id}-actor`}
            value={filter.actorId}
            onChange={(event) => {
              setFilter((current) => ({ ...current, actorId: event.target.value }));
            }}
          >
            <NativeSelectOption value="">{t('everyone')}</NativeSelectOption>
            {(staff.data ?? []).map((member) => (
              <NativeSelectOption key={member.id} value={member.id}>
                {member.fullName}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <DateSelectField
          label={t('from')}
          value={filter.from}
          years={[year, year - 1, year - 2]}
          onChange={(from) => {
            setFilter((current) => ({ ...current, from }));
          }}
        />
        <DateSelectField
          label={t('to')}
          value={filter.to}
          years={[year, year - 1, year - 2]}
          onChange={(to) => {
            setFilter((current) => ({ ...current, to }));
          }}
        />
      </section>

      {log.isPending ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : log.isError ? (
        <Alert variant="destructive" role="alert">
          <TriangleAlertIcon />
          <AlertDescription>{t('loadFailed')}</AlertDescription>
        </Alert>
      ) : entries.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HistoryIcon />
            </EmptyMedia>
            <EmptyDescription>{t('empty')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="audit-entries">
          {entries.map((entry) => (
            <AuditRow
              key={entry.id}
              entry={entry}
              who={entry.actorId ? (names.get(entry.actorId) ?? t('unknownStaff')) : t('system')}
            />
          ))}
        </ul>
      )}
      {log.hasNextPage && (
        <Button
          variant="outline"
          className="self-center"
          disabled={log.isFetchingNextPage}
          onClick={() => {
            void log.fetchNextPage();
          }}
        >
          {t('more')}
        </Button>
      )}
    </div>
  );
}

function AuditRow({ entry, who }: { readonly entry: AuditEntry; readonly who: string }) {
  const { t } = useTranslation('audit');
  const format = useFormat();
  const [open, setOpen] = useState(false);
  const columns = entryColumns(entry);

  return (
    <li
      className="rounded-card bg-card shadow-sm ring-1 ring-foreground/6"
      data-audit-table={entry.table}
    >
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        onClick={() => {
          setOpen(!open);
        }}
      >
        <Badge variant={entry.action === 'delete' ? 'destructive' : 'secondary'}>
          {t(`actions.${entry.action}`)}
        </Badge>
        <span dir="ltr" className="font-mono text-sm">
          {entry.table}
        </span>
        <span>{who}</span>
        <span className="ms-auto text-sm text-muted-foreground tabular-nums">
          {format.dateTime(entry.occurredAt)}
        </span>
      </button>
      {open && (
        <div className="overflow-x-auto border-t px-4 py-3">
          <p className="mb-2 text-sm text-muted-foreground">
            {t('row')}{' '}
            <span dir="ltr" className="font-mono">
              {entry.rowId}
            </span>
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th scope="col" className="py-1 pe-3 text-start font-normal">
                  {t('column')}
                </th>
                {entry.action !== 'insert' && (
                  <th scope="col" className="py-1 pe-3 text-start font-normal">
                    {t('before')}
                  </th>
                )}
                {entry.action !== 'delete' && (
                  <th scope="col" className="py-1 text-start font-normal">
                    {t('after')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {columns.map((column) => (
                <tr key={column} className="border-t align-top">
                  <td dir="ltr" className="py-1 pe-3 text-start font-mono">
                    {column}
                  </td>
                  {entry.action !== 'insert' && (
                    <td dir="auto" className="max-w-80 py-1 pe-3 break-words">
                      {valueText(entry.oldValues?.[column])}
                    </td>
                  )}
                  {entry.action !== 'delete' && (
                    <td dir="auto" className="max-w-80 py-1 break-words">
                      {valueText(entry.newValues?.[column])}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}
