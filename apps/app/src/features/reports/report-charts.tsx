import { getDirection, resources } from '@gym/i18n';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';

/**
 * One number per day as bars: one series, so no legend (the heading names it); thin bars with
 * rounded tops in the brand color, a recessive grid and a tooltip per bar. Days run in the reading
 * direction. The table under it holds the same numbers.
 */
export function DayChart({
  points,
  money = false,
  label,
}: {
  readonly points: readonly { readonly day: string; readonly value: number }[];
  readonly money?: boolean;
  readonly label: string;
}) {
  const format = useFormat();
  const { language } = usePreferences();
  const rtl = getDirection(language) === 'rtl';
  const show = (value: number) => (money ? format.money(value) : format.number(value));
  const data = points.map((point) => ({
    day: point.day,
    tick: format.number(Number(point.day.slice(8, 10))),
    value: point.value,
  }));

  return (
    <div className="h-56 w-full" aria-hidden dir="ltr" data-testid="report-chart">
      <BarChart
        responsive
        data={data}
        margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
        barCategoryGap="24%"
        style={{ width: '100%', height: '100%' }}
      >
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="tick"
          reversed={rtl}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
        />
        <YAxis
          orientation={rtl ? 'right' : 'left'}
          allowDecimals={false}
          width={money ? 72 : 32}
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
          labelFormatter={(_, payload) => {
            const entry: unknown = payload[0]?.payload;
            const day =
              typeof entry === 'object' && entry !== null && 'day' in entry ? entry.day : null;
            return typeof day === 'string' ? format.date(day) : '';
          }}
          formatter={(value) => [show(Number(value)), label]}
        />
        <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={18} />
      </BarChart>
    </div>
  );
}

/**
 * Check-ins per weekday and hour: a sequential scale of the brand color, from the muted surface
 * (none) to full (the busiest hour). Each cell names its weekday, hour and count for screen readers
 * and on hover; the numbers are in the Excel file too.
 */
export function PeakHoursHeatmap({
  rows,
}: {
  readonly rows: readonly {
    readonly weekday: number;
    readonly hour: number;
    readonly visits: number;
  }[];
}) {
  const { t } = useTranslation('reports');
  const format = useFormat();
  const { language } = usePreferences();
  const rtl = getDirection(language) === 'rtl';
  const weekdays = resources[language].dates.weekdays;
  const grid = new Map(
    rows.map((row) => [`${String(row.weekday)}:${String(row.hour)}`, row.visits]),
  );
  const busiest = Math.max(1, ...rows.map((row) => row.visits));
  const busyHours = rows.filter((row) => row.visits > 0).map((row) => row.hour);
  const first = Math.min(6, ...busyHours);
  const last = Math.max(22, ...busyHours);
  const hours = Array.from({ length: last - first + 1 }, (_, index) => first + index);

  return (
    <div className="flex flex-col gap-3" data-testid="peak-hours">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5">
          <thead>
            <tr>
              <th />
              {hours.map((hour) => (
                <th
                  key={hour}
                  scope="col"
                  className="w-7 text-xs font-normal text-muted-foreground tabular-nums"
                >
                  {format.number(hour)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[6, 0, 1, 2, 3, 4, 5].map((weekday) => (
              <tr key={weekday}>
                <th scope="row" className="pe-2 text-start text-sm font-normal whitespace-nowrap">
                  {weekdays[weekday]}
                </th>
                {hours.map((hour) => {
                  const visits = grid.get(`${String(weekday)}:${String(hour)}`) ?? 0;
                  const share = Math.round((visits / busiest) * 100);
                  const label = t('heatCell', {
                    weekday: weekdays[weekday] ?? '',
                    hour: format.number(hour),
                    visits: format.number(visits),
                  });
                  return (
                    <td
                      key={hour}
                      title={label}
                      aria-label={label}
                      className="size-7 rounded-md"
                      style={{
                        background:
                          visits === 0
                            ? 'var(--muted)'
                            : `color-mix(in oklch, var(--chart-1) ${String(Math.max(share, 12))}%, var(--muted))`,
                      }}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-hidden>
        <span>{t('heatLow')}</span>
        <span
          className="h-3 w-32 rounded-full"
          style={{
            background: `linear-gradient(to ${rtl ? 'left' : 'right'}, var(--muted), var(--chart-1))`,
          }}
        />
        <span>{t('heatHigh')}</span>
      </div>
    </div>
  );
}
