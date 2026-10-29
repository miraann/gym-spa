import { baghdadDateOf } from '@gym/core';
import { getDirection, localizedName } from '@gym/i18n';
import { printPage, saveFile } from '@gym/platform';
import { Chip, ChipRow } from '@gym/ui/blocks/chip-row';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@gym/ui/components/empty';
import { Field, FieldLabel } from '@gym/ui/components/field';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { Skeleton } from '@gym/ui/components/skeleton';
import { cn } from '@gym/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { ChartColumnIcon, FileSpreadsheetIcon, PrinterIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { RequirePermission } from '@/components/no-access';
import { DateSelectField } from '@/components/date-select-field';
import { useDeviceGym } from '@/features/auth/auth-context';
import { usePermission } from '@/features/auth/use-permissions';
import { useAdminBranches } from '@/features/staff/admin-data';
import { useFormat } from '@/lib/format';
import { logError } from '@/lib/logger';
import { usePreferences } from '@/lib/preferences';
import { useBaghdadToday } from '@/lib/use-today';
import { errorField } from '@/lib/save-error';
import { writeXlsx, type Cell } from '@/lib/xlsx-writer';
import { DayChart, PeakHoursHeatmap } from './report-charts';
import {
  MONEY_REPORTS,
  REPORT_KEYS,
  useReport,
  type ReportFilter,
  type ReportKey,
  type ReportRows,
} from './report-data';
import { useReportTable, type ColumnKind, type ReportTable } from './report-table';

/** The longest range a report covers (the database checks it too). */
const MAX_DAYS = 366;
const DAY_MS = 86_400_000;

type Preset = 'today' | 'last7' | 'thisMonth' | 'lastMonth';
const PRESETS: readonly Preset[] = ['today', 'last7', 'thisMonth', 'lastMonth'];

function presetRange(preset: Preset, today: string): { from: string; to: string } {
  const at = Date.parse(`${today}T12:00:00+03:00`);
  const monthStart = `${today.slice(0, 8)}01`;
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'last7':
      return { from: baghdadDateOf(at - 6 * DAY_MS), to: today };
    case 'thisMonth':
      return { from: monthStart, to: today };
    case 'lastMonth': {
      const lastDay = baghdadDateOf(Date.parse(`${monthStart}T12:00:00+03:00`) - DAY_MS);
      return { from: `${lastDay.slice(0, 8)}01`, to: lastDay };
    }
  }
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS);
}

type ReportErrorKey =
  'permission_denied' | 'no_branch_access' | 'invalid_range' | 'network' | 'unexpected';

function reportErrorKey(error: unknown, key: ReportKey): ReportErrorKey {
  const message = errorField(error, 'message');
  if (error instanceof TypeError || message === 'Failed to fetch') return 'network';
  if (
    message === 'permission_denied' ||
    message === 'no_branch_access' ||
    message === 'invalid_range'
  ) {
    return message;
  }
  if (errorField(error, 'code') === '42501') return 'permission_denied';
  logError(error, { area: 'reports', action: key });
  return 'unexpected';
}

/** /reports (reports.view): the gym's numbers for a range and a branch. */
export function ReportsPage() {
  return (
    <RequirePermission permission="reports.view">
      <Reports />
    </RequirePermission>
  );
}

function Reports() {
  const { t } = useTranslation('reports');
  const id = useId();
  const { language } = usePreferences();
  const today = useBaghdadToday();
  const year = Number(today.slice(0, 4));
  const money = usePermission('reports.financial.view');
  const spaCommissions = usePermission('spa.manage');
  const trainersReport = usePermission('hr.view');
  const branches = useAdminBranches();
  const active = (branches.data ?? []).filter((branch) => branch.isActive);
  const allowed = REPORT_KEYS.filter((key) => money || !MONEY_REPORTS.has(key));
  const [report, setReport] = useState<ReportKey>(allowed[0] ?? 'attendance');
  const [range, setRange] = useState(() => presetRange('thisMonth', today));
  const [branchId, setBranchId] = useState('');
  const length = daysBetween(range.from, range.to);
  const validRange =
    /^\d{4}-\d{2}-\d{2}$/.test(range.from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(range.to) &&
    length >= 0 &&
    length <= MAX_DAYS;
  const preset = PRESETS.find((each) => {
    const candidate = presetRange(each, today);
    return candidate.from === range.from && candidate.to === range.to;
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />

      <ChipRow label={t('report')}>
        {allowed.map((key) => (
          <Chip
            key={key}
            type="button"
            selected={report === key}
            aria-pressed={report === key}
            onClick={() => {
              setReport(key);
            }}
          >
            {t(`names.${key}`)}
          </Chip>
        ))}
      </ChipRow>

      <section className="flex flex-col gap-4 rounded-card bg-card p-4 shadow-sm ring-1 ring-foreground/6 md:p-5">
        <ChipRow label={t('range')}>
          {PRESETS.map((each) => (
            <Chip
              key={each}
              type="button"
              selected={preset === each}
              aria-pressed={preset === each}
              onClick={() => {
                setRange(presetRange(each, today));
              }}
            >
              {t(`presets.${each}`)}
            </Chip>
          ))}
        </ChipRow>
        <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
          <DateSelectField
            label={t('from')}
            value={range.from}
            years={[year, year - 1, year - 2]}
            allowEmpty={false}
            onChange={(from) => {
              setRange((current) => ({ ...current, from }));
            }}
          />
          <DateSelectField
            label={t('to')}
            value={range.to}
            years={[year, year - 1, year - 2]}
            allowEmpty={false}
            onChange={(to) => {
              setRange((current) => ({ ...current, to }));
            }}
          />
          {active.length > 1 && (
            <Field className="md:w-64">
              <FieldLabel htmlFor={`${id}-branch`}>{t('branch')}</FieldLabel>
              <NativeSelect
                id={`${id}-branch`}
                value={branchId}
                onChange={(event) => {
                  setBranchId(event.target.value);
                }}
              >
                <NativeSelectOption value="">{t('allBranches')}</NativeSelectOption>
                {active.map((branch) => (
                  <NativeSelectOption key={branch.id} value={branch.id}>
                    {localizedName(branch, language)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          )}
        </div>
        {!validRange && (
          <Alert variant="destructive" role="alert">
            <TriangleAlertIcon />
            <AlertDescription>{t('invalidRange', { days: MAX_DAYS })}</AlertDescription>
          </Alert>
        )}
      </section>

      {validRange && (
        <ReportView
          key={report}
          reportKey={report}
          filter={{ from: range.from, to: range.to, branchId }}
        />
      )}

      {(spaCommissions || trainersReport) && (
        <nav aria-label={t('others')} className="flex flex-wrap gap-2">
          {spaCommissions && (
            <Button asChild variant="outline">
              <Link to="/spa/commissions">{t('commissions')}</Link>
            </Button>
          )}
          {trainersReport && (
            <Button asChild variant="outline">
              <Link to="/trainers/report">{t('trainers')}</Link>
            </Button>
          )}
        </nav>
      )}
    </div>
  );
}

/** A cell as the screen and print show it. */
function useCellText() {
  const format = useFormat();
  return (value: Cell, kind: ColumnKind): string => {
    if (value === null || value === '') return '';
    if (typeof value === 'number') {
      if (kind === 'money') return format.money(value);
      if (kind === 'ltr') return String(value);
      return format.number(value, kind === 'number' && !Number.isInteger(value) ? 2 : undefined);
    }
    if (kind === 'date' && /^\d{4}-\d{2}-\d{2}/.test(value)) return format.date(value);
    if (kind === 'dateTime' && /^\d{4}-\d{2}-\d{2}/.test(value)) return format.dateTime(value);
    return value;
  };
}

function ReportView({
  reportKey,
  filter,
}: {
  readonly reportKey: ReportKey;
  readonly filter: ReportFilter;
}) {
  const { t } = useTranslation('reports');
  const format = useFormat();
  const mayExport = usePermission('reports.export');
  const { language } = usePreferences();
  const toTable = useReportTable();
  const report = useReport(reportKey, filter, true);
  const [printing, setPrinting] = useState(false);

  if (report.isPending) return <Skeleton className="h-80 w-full rounded-2xl" />;
  if (report.isError) {
    return (
      <Alert variant="destructive" role="alert">
        <TriangleAlertIcon />
        <AlertDescription>
          {t(`errors.${reportErrorKey(report.error, reportKey)}`)}
        </AlertDescription>
      </Alert>
    );
  }
  const table = toTable(report.data);
  const title = t(`names.${reportKey}`);
  const note = NOTES[reportKey];
  const fileName = `${reportKey}-${filter.from}-${filter.to}.xlsx`;

  return (
    <section className="flex flex-col gap-4" aria-label={title} data-report={reportKey}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="me-auto text-xl">{title}</h2>
        {mayExport && table.rows.length > 0 && (
          <Button
            variant="outline"
            onClick={() => {
              void saveFile({
                name: fileName,
                content: writeXlsx({
                  name: title,
                  headings: table.columns.map((column) => column.label),
                  rows: table.total ? [...table.rows, table.total] : table.rows,
                  rightToLeft: getDirection(language) === 'rtl',
                }),
              });
            }}
          >
            <FileSpreadsheetIcon data-icon="inline-start" />
            {t('excel')}
          </Button>
        )}
        {mayExport && table.rows.length > 0 && (
          <Button
            variant="outline"
            onClick={() => {
              setPrinting(true);
            }}
          >
            <PrinterIcon data-icon="inline-start" />
            {t('print')}
          </Button>
        )}
      </div>
      {note && <p className="text-muted-foreground">{t(`notes.${note}`)}</p>}
      {table.rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ChartColumnIcon />
            </EmptyMedia>
            <EmptyDescription>{t('empty')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <ReportVisual report={report.data} />
          {report.data.key === 'retention' && <RetentionShare report={report.data} />}
          <div className="overflow-x-auto rounded-card bg-card shadow-sm ring-1 ring-foreground/6">
            <ReportTableView table={table} />
          </div>
        </>
      )}
      {printing && (
        <ReportPrint
          title={title}
          subtitle={`${format.date(filter.from)} – ${format.date(filter.to)}`}
          table={table}
          onDone={() => {
            setPrinting(false);
          }}
        />
      )}
    </section>
  );
}

const NOTES: Partial<Record<ReportKey, 'debts' | 'inventory' | 'retention'>> = {
  debts: 'debts',
  inventory: 'inventory',
  retention: 'retention',
};

function ReportVisual({ report }: { readonly report: ReportRows }) {
  const { t } = useTranslation('reports');
  const box =
    'flex flex-col gap-2 rounded-card bg-card p-4 shadow-sm ring-1 ring-foreground/6 md:p-5';
  if (report.key === 'attendance') {
    return (
      <figure className={box}>
        <figcaption className="text-sm font-semibold">{t('perDay')}</figcaption>
        <DayChart
          label={t('columns.visits')}
          points={report.rows.map((row) => ({ day: row.day, value: row.visits }))}
        />
      </figure>
    );
  }
  if (report.key === 'revenue') {
    const byDay = new Map<string, number>();
    for (const row of report.rows) byDay.set(row.day, (byDay.get(row.day) ?? 0) + row.amount);
    return (
      <figure className={box}>
        <figcaption className="text-sm font-semibold">{t('perDay')}</figcaption>
        <DayChart
          money
          label={t('columns.amount')}
          points={[...byDay].map(([day, value]) => ({ day, value }))}
        />
      </figure>
    );
  }
  if (report.key === 'peakHours') {
    return (
      <figure className={box}>
        <PeakHoursHeatmap rows={report.rows} />
      </figure>
    );
  }
  return null;
}

function RetentionShare({
  report,
}: {
  readonly report: Extract<ReportRows, { key: 'retention' }>;
}) {
  const { t } = useTranslation('reports');
  const format = useFormat();
  const renewed = report.rows.filter((row) => row.renewedOn !== null).length;
  const total = report.rows.length;
  return (
    <p className="text-lg" data-testid="retention-share">
      {t('renewedShare', {
        renewed: format.number(renewed),
        total: format.number(total),
        percent: `${format.number(Math.round((renewed / total) * 100))}%`,
      })}
    </p>
  );
}

function ReportTableView({
  table,
  print = false,
}: {
  readonly table: ReportTable;
  readonly print?: boolean;
}) {
  const cellText = useCellText();
  const numeric = (kind: ColumnKind) => kind === 'number' || kind === 'money';
  const cellClass = (kind: ColumnKind) =>
    cn('px-3 py-2', numeric(kind) && 'text-end tabular-nums', kind === 'ltr' && 'tabular-nums');
  return (
    <table
      className={cn('w-full border-collapse text-sm', print && 'text-xs')}
      data-testid="report-table"
    >
      <thead>
        <tr className="border-b">
          {table.columns.map((column, index) => (
            <th
              key={index}
              scope="col"
              className={cn(cellClass(column.kind), 'font-semibold text-muted-foreground')}
            >
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, rowIndex) => (
          <tr key={rowIndex} className="border-b last:border-b-0">
            {row.map((value, index) => {
              const kind = table.columns[index]?.kind ?? 'text';
              return (
                <td
                  key={index}
                  className={cellClass(kind)}
                  dir={kind === 'ltr' ? 'ltr' : undefined}
                >
                  {cellText(value, kind)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
      {table.total && (
        <tfoot>
          <tr className="border-t-2">
            {table.total.map((value, index) => {
              const kind = index === 0 ? 'text' : (table.columns[index]?.kind ?? 'text');
              return (
                <td key={index} className={cn(cellClass(kind), 'font-semibold')} data-total>
                  {cellText(value, kind)}
                </td>
              );
            })}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

/** The printed page. */
const A4_PAGE = '@page { size: A4; margin: 12mm; }';

/** Prints the report on A4 (or saves it as a PDF from the print dialog). */
function ReportPrint({
  title,
  subtitle,
  table,
  onDone,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly table: ReportTable;
  readonly onDone: () => void;
}) {
  const gym = useDeviceGym();
  const { language } = usePreferences();

  useEffect(() => {
    let cancelled = false;
    window.addEventListener('afterprint', onDone, { once: true });
    void document.fonts.ready.then(() => {
      if (!cancelled) void printPage(null);
    });
    return () => {
      cancelled = true;
      window.removeEventListener('afterprint', onDone);
    };
  }, [onDone]);

  return createPortal(
    <div id="print-root">
      <style>{A4_PAGE}</style>
      <article
        dir={getDirection(language)}
        lang={language}
        className="flex flex-col gap-3 bg-white text-black"
      >
        <header className="flex flex-col gap-0.5">
          {gym && <span className="text-sm">{localizedName(gym, language)}</span>}
          <h1 className="text-xl">{title}</h1>
          <span className="text-sm">{subtitle}</span>
        </header>
        <ReportTableView table={table} print />
      </article>
    </div>,
    document.body,
  );
}
