import { localizedName, resources } from '@gym/i18n';
import { useTranslation } from 'react-i18next';
import { useAdminBranches } from '@/features/staff/admin-data';
import type { Cell } from '@/lib/xlsx-writer';
import { usePreferences } from '@/lib/preferences';
import type { ReportRows } from './report-data';

// One shape for every report: the columns and their rows as plain values. The screen formats them
// (money, dates, digits), Excel keeps numbers as numbers, and print shows what the screen shows.

export type ColumnKind = 'text' | 'number' | 'money' | 'date' | 'dateTime' | 'ltr';

export interface ReportColumn {
  readonly label: string;
  readonly kind: ColumnKind;
}

export interface ReportTable {
  readonly columns: readonly ReportColumn[];
  readonly rows: readonly (readonly Cell[])[];
  /** The totals row, if the report has one. */
  readonly total: readonly Cell[] | null;
}

const sum = (values: readonly number[]) => values.reduce((all, value) => all + value, 0);

/** Turns a report's rows into its table, in the screen's language. */
export function useReportTable(): (report: ReportRows) => ReportTable {
  const { t } = useTranslation(['reports', 'subscriptions']);
  const { language } = usePreferences();
  const branches = useAdminBranches();
  const branchName = (id: string) => {
    const branch = branches.data?.find((each) => each.id === id);
    return branch ? localizedName(branch, language) : '';
  };
  const named = (row: { nameCkb: string; nameEn: string | null; nameAr: string | null }) =>
    localizedName(row, language);
  const col = (key: string, kind: ColumnKind): ReportColumn => ({
    label: t(`columns.${key}` as 'columns.amount'),
    kind,
  });
  const weekdays = resources[language].dates.weekdays;

  return (report) => {
    switch (report.key) {
      case 'revenue': {
        const bySource = new Map<string, number>();
        for (const row of report.rows) {
          bySource.set(row.source, (bySource.get(row.source) ?? 0) + row.amount);
        }
        const rows = [...bySource].map(([source, amount]) => [
          t(`sources.${source}` as 'sources.other', { defaultValue: source }),
          amount,
        ]);
        return {
          columns: [col('source', 'text'), col('amount', 'money')],
          rows,
          total: [t('total'), sum([...bySource.values()])],
        };
      }
      case 'payments':
        return {
          columns: [
            col('method', 'text'),
            col('currency', 'text'),
            col('count', 'number'),
            col('amount', 'money'),
            col('refunds', 'money'),
            col('dollars', 'number'),
          ],
          rows: report.rows.map((row) => [
            t(`subscriptions:sell.methods.${row.method}` as 'subscriptions:sell.methods.cash', {
              defaultValue: row.method,
            }),
            t(
              `subscriptions:sell.currencies.${row.currency}` as 'subscriptions:sell.currencies.IQD',
              {
                defaultValue: row.currency,
              },
            ),
            row.payments,
            row.amount,
            row.refunds,
            row.dollars,
          ]),
          total: [
            t('total'),
            null,
            sum(report.rows.map((row) => row.payments)),
            sum(report.rows.map((row) => row.amount)),
            sum(report.rows.map((row) => row.refunds)),
            sum(report.rows.map((row) => row.dollars)),
          ],
        };
      case 'attendance':
        return {
          columns: [col('day', 'date'), col('visits', 'number'), col('members', 'number')],
          rows: report.rows.map((row) => [row.day, row.visits, row.members]),
          total: [t('total'), sum(report.rows.map((row) => row.visits)), null],
        };
      case 'peakHours': {
        const hours = Array.from({ length: 24 }, (_, hour) => hour);
        const grid = new Map(
          report.rows.map((row) => [`${String(row.weekday)}:${String(row.hour)}`, row.visits]),
        );
        return {
          columns: [
            col('weekday', 'text'),
            ...hours.map((hour) => ({
              label: String(hour).padStart(2, '0'),
              kind: 'number' as const,
            })),
          ],
          // Saturday first, as the week starts in Iraq.
          rows: [6, 0, 1, 2, 3, 4, 5].map((weekday) => [
            weekdays[weekday] ?? '',
            ...hours.map((hour) => grid.get(`${String(weekday)}:${String(hour)}`) ?? 0),
          ]),
          total: null,
        };
      }
      case 'plans':
        return {
          columns: [col('plan', 'text'), col('sold', 'number'), col('revenue', 'money')],
          rows: report.rows.map((row) => [named(row), row.sold, row.revenue]),
          total: [
            t('total'),
            sum(report.rows.map((row) => row.sold)),
            sum(report.rows.map((row) => row.revenue)),
          ],
        };
      case 'retention':
        return {
          columns: [
            col('member', 'text'),
            col('memberNumber', 'ltr'),
            col('endedOn', 'date'),
            col('renewedOn', 'date'),
          ],
          rows: report.rows.map((row) => [
            row.fullName,
            row.memberNumber,
            row.endedOn,
            row.renewedOn ?? t('notRenewed'),
          ]),
          total: null,
        };
      case 'debts':
        return {
          columns: [
            col('member', 'text'),
            col('memberNumber', 'ltr'),
            col('phone', 'ltr'),
            col('owedNow', 'money'),
            col('due', 'money'),
            col('nextDue', 'date'),
          ],
          rows: report.rows.map((row) => [
            row.fullName,
            row.memberNumber,
            row.phone,
            row.owedNow,
            row.due,
            row.nextDueDate,
          ]),
          total: [
            t('total'),
            null,
            null,
            sum(report.rows.map((row) => row.owedNow)),
            sum(report.rows.map((row) => row.due)),
            null,
          ],
        };
      case 'inventory': {
        const costs = report.rows.some((row) => row.unitCost !== null);
        return {
          columns: [
            col('product', 'text'),
            col('branch', 'text'),
            col('quantity', 'number'),
            col('lowStock', 'number'),
            ...(costs ? [col('unitCost', 'money'), col('value', 'money')] : []),
          ],
          rows: report.rows.map((row) => [
            named(row),
            branchName(row.branchId),
            row.quantity,
            row.lowStockLevel,
            ...(costs ? [row.unitCost, row.value] : []),
          ]),
          total: costs
            ? [t('total'), null, null, null, null, sum(report.rows.map((row) => row.value ?? 0))]
            : null,
        };
      }
      case 'cash':
        return {
          columns: [
            col('closedAt', 'dateTime'),
            col('branch', 'text'),
            col('openedBy', 'text'),
            col('closedBy', 'text'),
            col('expected', 'money'),
            col('counted', 'money'),
            col('difference', 'money'),
            col('differenceUsd', 'number'),
          ],
          rows: report.rows.map((row) => [
            row.closedAt,
            branchName(row.branchId),
            row.openedBy,
            row.closedBy,
            row.expectedIqd,
            row.countedIqd,
            row.differenceIqd,
            row.differenceUsd,
          ]),
          total: [
            t('total'),
            null,
            null,
            null,
            null,
            null,
            sum(report.rows.map((row) => row.differenceIqd)),
            sum(report.rows.map((row) => row.differenceUsd)),
          ],
        };
      case 'discounts':
        return {
          columns: [
            col('staffMember', 'text'),
            col('invoices', 'number'),
            col('discount', 'money'),
          ],
          rows: report.rows.map((row) => [row.fullName, row.invoices, row.discount]),
          total: [
            t('total'),
            sum(report.rows.map((row) => row.invoices)),
            sum(report.rows.map((row) => row.discount)),
          ],
        };
      case 'staff':
        return {
          columns: [
            col('staffMember', 'text'),
            col('count', 'number'),
            col('amount', 'money'),
            col('subscriptions', 'number'),
            col('manualCheckins', 'number'),
          ],
          rows: report.rows.map((row) => [
            row.fullName,
            row.payments,
            row.amount,
            row.subscriptions,
            row.manualCheckins,
          ]),
          total: null,
        };
    }
  };
}
