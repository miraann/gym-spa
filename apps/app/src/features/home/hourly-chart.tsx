import { getDirection } from '@gym/i18n';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { chartHours } from './dashboard-data';

/**
 * Today's check-ins per hour: one series, so no legend (the title names it); thin bars with
 * rounded tops in the brand color, a recessive grid, a tooltip per bar, and the numbers as a table
 * for screen readers. Hours run in the reading direction.
 */
export function HourlyChart({ hourly }: { readonly hourly: readonly number[] }) {
  const { t } = useTranslation('home');
  const format = useFormat();
  const { language } = usePreferences();
  const rtl = getDirection(language) === 'rtl';
  const data = chartHours(hourly).map((hour) => ({
    hour,
    label: format.number(hour),
    visits: hourly[hour] ?? 0,
  }));

  return (
    <figure className="flex flex-col gap-2">
      <div className="h-48 w-full" aria-hidden dir="ltr">
        <BarChart
          responsive
          data={data}
          margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
          barCategoryGap="28%"
          style={{ width: '100%', height: '100%' }}
        >
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
          <XAxis
            dataKey="label"
            reversed={rtl}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
          />
          <YAxis
            orientation={rtl ? 'right' : 'left'}
            allowDecimals={false}
            width={28}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            tickFormatter={(value: number) => format.number(value)}
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)' }}
            contentStyle={{
              background: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              color: 'var(--popover-foreground)',
            }}
            labelFormatter={(label) =>
              t('chart.hour', {
                hour: typeof label === 'string' || typeof label === 'number' ? String(label) : '',
              })
            }
            formatter={(value) => [format.number(Number(value)), t('chart.visits')]}
          />
          <Bar dataKey="visits" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </div>
      <table className="sr-only">
        <caption>{t('chart.title')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('chart.hourColumn')}</th>
            <th scope="col">{t('chart.visits')}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.hour}>
              <td>{t('chart.hour', { hour: row.label })}</td>
              <td>{format.number(row.visits)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
