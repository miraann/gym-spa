import {
  formatMemberPhone,
  importIssueLevel,
  importRowStatus,
  type ImportRow,
  type ImportStatus,
} from '@gym/core';
import { Chip, ChipRow } from '@gym/ui/blocks/chip-row';
import { Badge } from '@gym/ui/components/badge';
import { Button } from '@gym/ui/components/button';
import { Checkbox } from '@gym/ui/components/checkbox';
import { cn } from '@gym/ui/lib/utils';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleXIcon,
  InfoIcon,
  TriangleAlertIcon,
  UserCheckIcon,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { importIssueText, importServerText } from './import-texts';

const PAGE_SIZE = 50;
const FILTERS = ['all', 'valid', 'warning', 'error', 'exists'] as const;
type Filter = (typeof FILTERS)[number];

const STATUS_LOOK: Readonly<
  Record<
    ImportStatus,
    { variant: 'success' | 'warning' | 'destructive' | 'secondary'; icon: LucideIcon }
  >
> = {
  valid: { variant: 'success', icon: CircleCheckIcon },
  warning: { variant: 'warning', icon: TriangleAlertIcon },
  error: { variant: 'destructive', icon: CircleXIcon },
  exists: { variant: 'secondary', icon: UserCheckIcon },
};

/** A row's status, with what the server refused counting as an error. */
function previewStatus(row: ImportRow, refused: readonly string[] | undefined): ImportStatus {
  return refused && refused.length > 0 ? 'error' : importRowStatus(row);
}

/** Every row of the file, what it would become and why, with a tick to import it. */
export function ImportPreview({
  rows,
  refused,
  selected,
  branchName,
  onToggle,
  onSelectAll,
  onSelectNone,
}: {
  readonly rows: readonly ImportRow[];
  readonly refused: ReadonlyMap<number, readonly string[]>;
  readonly selected: ReadonlySet<number>;
  readonly branchName: (id: string | null) => string;
  readonly onToggle: (row: number, ticked: boolean) => void;
  readonly onSelectAll: () => void;
  readonly onSelectNone: () => void;
}) {
  const { t } = useTranslation('memberImport');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const statusOf = (row: ImportRow) => previewStatus(row, refused.get(row.row));
  const counts = new Map<Filter, number>(FILTERS.map((each) => [each, 0]));
  for (const row of rows) {
    counts.set('all', (counts.get('all') ?? 0) + 1);
    const status = statusOf(row);
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  const shown = rows.filter((row) => filter === 'all' || statusOf(row) === filter);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const pageRows = shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-3" data-testid="import-preview">
      <ChipRow label={t('preview.filter')}>
        {FILTERS.map((each) => (
          <Chip
            key={each}
            selected={filter === each}
            aria-pressed={filter === each}
            onClick={() => {
              setFilter(each);
              setPage(1);
            }}
          >
            {t(`preview.filters.${each}`, { count: counts.get(each) ?? 0 })}
          </Chip>
        ))}
      </ChipRow>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground" data-testid="import-selected">
          {t('preview.selected', { count: selected.size, total: rows.length })}
        </span>
        <Button variant="outline" size="sm" onClick={onSelectAll}>
          {t('preview.selectAll')}
        </Button>
        <Button variant="ghost" size="sm" onClick={onSelectNone}>
          {t('preview.selectNone')}
        </Button>
      </div>

      <ul className="flex flex-col divide-y rounded-2xl border bg-card">
        {pageRows.map((row) => {
          const status = statusOf(row);
          const look = STATUS_LOOK[status];
          const StatusIcon = look.icon;
          // A row the server refused can be ticked again (once fixed elsewhere, say).
          const own = importRowStatus(row);
          const tickable = own === 'valid' || own === 'warning';
          const phone = row.draft.phone ?? row.draft.emergencyPhone;
          return (
            <li
              key={row.row}
              className="flex gap-3 p-3"
              data-import-row={row.row}
              data-status={status}
            >
              <Checkbox
                className="mt-1"
                checked={selected.has(row.row)}
                disabled={!tickable}
                aria-label={t('preview.tick', { row: row.row })}
                onCheckedChange={(checked) => {
                  onToggle(row.row, checked === true);
                }}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {t('preview.row', { row: row.row })}
                  </span>
                  <span className="font-medium">{row.draft.fullName ?? t('preview.noName')}</span>
                  {phone !== null && (
                    <span dir="ltr" className="text-sm text-muted-foreground tabular-nums">
                      {formatMemberPhone(phone)}
                    </span>
                  )}
                  <span className="text-sm text-muted-foreground">
                    {branchName(row.draft.branchId)}
                  </span>
                  <Badge variant={look.variant} className="ms-auto">
                    <StatusIcon aria-hidden="true" />
                    {t(`preview.status.${status}`)}
                  </Badge>
                </div>
                {(row.issues.length > 0 || refused.has(row.row)) && (
                  <ul className="flex flex-col gap-0.5 text-sm">
                    {(refused.get(row.row) ?? []).map((key) => (
                      <li
                        key={`server-${key}`}
                        className="flex items-start gap-1.5 text-destructive"
                      >
                        <CircleXIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                        <span>{importServerText(t, key)}</span>
                      </li>
                    ))}
                    {row.issues.map((issue, index) => {
                      const level = importIssueLevel(issue.key);
                      const Icon =
                        level === 'error'
                          ? CircleXIcon
                          : level === 'warning'
                            ? TriangleAlertIcon
                            : InfoIcon;
                      return (
                        <li
                          key={index}
                          className={cn(
                            'flex items-start gap-1.5',
                            level === 'error' ? 'text-destructive' : 'text-muted-foreground',
                          )}
                          data-issue={issue.key}
                        >
                          <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                          <span>{importIssueText(t, issue)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {pages > 1 && (
        <nav
          aria-label={t('preview.page', { page: current, pages })}
          className="flex items-center justify-between gap-2"
        >
          <Button
            variant="outline"
            disabled={current <= 1}
            onClick={() => {
              setPage(current - 1);
            }}
          >
            <ChevronRightIcon className="ltr:rotate-180" aria-hidden="true" />
            {t('preview.previous')}
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">
            {t('preview.page', { page: current, pages })}
          </span>
          <Button
            variant="outline"
            disabled={current >= pages}
            onClick={() => {
              setPage(current + 1);
            }}
          >
            {t('preview.next')}
            <ChevronLeftIcon className="ltr:rotate-180" aria-hidden="true" />
          </Button>
        </nav>
      )}
    </div>
  );
}
