import { Link } from '@tanstack/react-router';
import { ArrowDownIcon, ArrowUpIcon, EqualIcon, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IconTile } from '@gym/ui/blocks/icon-tile';
import { KpiTile } from '@gym/ui/blocks/kpi-tile';
import { TAP_CARD } from '@gym/ui/lib/tap';
import { TONE_CLASSES as TONES, type Tone } from '@gym/ui/lib/tones';
import { cn } from '@gym/ui/lib/utils';
import type { AppPath } from '@/app/navigation';
import { useFormat } from '@/lib/format';

// The dashboard's widgets (step D-4, the user's reference screens of 2026-10-30): pastel cards in
// a section tone with a solid icon tile, big numbers that count up when they change, a "+12%"
// against yesterday, a 7-day sparkline, a meter, and the clock.

/** A section tone (theme.css): the card's tint, its icon tile and its number. */
export type { Tone };

/** Today against yesterday up to this time: an arrow, the percent, and the sentence for readers. */
export function TrendChip({ percent }: { readonly percent: number | null }) {
  const { t } = useTranslation('home');
  const format = useFormat();
  if (percent === null) return null;
  const amount = `${format.number(Math.abs(percent))}%`;
  const [Icon, label, style] =
    percent > 0
      ? [ArrowUpIcon, t('stats.trend.up', { percent: amount }), 'bg-success/12 text-success']
      : percent < 0
        ? [
            ArrowDownIcon,
            t('stats.trend.down', { percent: amount }),
            'bg-destructive/12 text-destructive',
          ]
        : [EqualIcon, t('stats.trend.same'), 'bg-muted text-muted-foreground'];
  return (
    <span
      data-slot="trend"
      title={label}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-sm tabular-nums',
        style,
      )}
    >
      <Icon aria-hidden className="size-4" />
      <span aria-hidden dir="ltr">
        {percent > 0 ? '+' : percent < 0 ? '−' : ''}
        {amount}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * Seven days as a small line with a soft area under it, today's point marked. One series, so no
 * legend (the label names it); each day's value is a native tooltip and, for readers, a list.
 */
export function Sparkline({
  values,
  label,
  formatValue,
  tone,
}: {
  readonly values: readonly number[];
  readonly label: string;
  readonly formatValue: (value: number) => string;
  readonly tone: Tone;
}) {
  const width = 120;
  const height = 36;
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => ({
    x: values.length === 1 ? width / 2 : (index / (values.length - 1)) * (width - 8) + 4,
    y: height - 4 - (value / max) * (height - 10),
    value,
  }));
  const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const last = points.at(-1);

  return (
    <figure className={cn('relative m-0', TONES[tone].text)} dir="ltr">
      {/* Days run left to right like the numbers on a chart; the figure keeps that in RTL too. */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={cn('h-9 w-full overflow-visible', TONES[tone].text)}
        preserveAspectRatio="none"
        aria-hidden
      >
        <polygon
          points={`4,${height} ${line} ${width - 4},${height}`}
          fill="currentColor"
          opacity="0.12"
        />
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Each day's value on hover (the line is stretched, so these stay invisible). */}
        {points.map((point, index) => (
          <circle key={index} cx={point.x} cy={point.y} r="6" fill="transparent">
            <title>{formatValue(point.value)}</title>
          </circle>
        ))}
      </svg>
      {/* Today's point, drawn outside the stretched drawing so it stays round. */}
      {last && (
        <span
          aria-hidden
          className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-2 ring-card"
          style={{
            left: `${((last.x / width) * 100).toFixed(1)}%`,
            top: `${((last.y / height) * 100).toFixed(1)}%`,
          }}
        />
      )}
      <figcaption className="sr-only">
        {label}: {values.map(formatValue).join('، ')}
      </figcaption>
    </figure>
  );
}

/** How full something is (places taken of all), as a bar in the tone, with its numbers. */
export function Meter({
  value,
  max,
  label,
  tone,
}: {
  readonly value: number;
  readonly max: number;
  readonly label: string;
  readonly tone: Tone;
}) {
  const share = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn('h-2.5 w-full overflow-hidden rounded-full', TONES[tone].soft)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-spring motion-reduce:transition-none',
          TONES[tone].fill,
        )}
        style={{ width: `${(share * 100).toFixed(1)}%` }}
      />
    </div>
  );
}

/** A dashboard number: a pastel card in its tone that opens its page (KpiTile, step D-5b). */
export function StatCard({
  icon,
  tone,
  label,
  value,
  note,
  trend,
  footer,
  to,
  pending,
  testId,
  className,
}: {
  readonly icon: LucideIcon;
  readonly tone: Tone;
  readonly label: string;
  /** Already formatted; null while loading. */
  readonly value: string | null;
  readonly note?: ReactNode;
  readonly trend?: ReactNode;
  readonly footer?: ReactNode;
  readonly to: AppPath;
  readonly pending: boolean;
  readonly testId: string;
  readonly className?: string;
}) {
  if (!pending && value === null) return null;
  return (
    <KpiTile
      asChild
      icon={icon}
      tone={tone}
      label={label}
      value={value}
      note={note}
      trend={trend}
      footer={footer}
      className={cn('md:min-h-44', className)}
    >
      <Link to={to} data-testid={testId} />
    </KpiTile>
  );
}

/** A smaller number as a row (the reference's list cards): icon tile, label and note, number. */
export function StatRow({
  icon,
  tone,
  label,
  value,
  note,
  footer,
  to,
  testId,
}: {
  readonly icon: LucideIcon;
  readonly tone: Tone;
  readonly label: string;
  readonly value: string;
  readonly note?: string;
  readonly footer?: ReactNode;
  readonly to: AppPath;
  readonly testId: string;
}) {
  return (
    <Link
      to={to}
      data-testid={testId}
      className={cn(
        'flex flex-col gap-3 rounded-card bg-card p-4 shadow-sm ring-1 ring-foreground/6 outline-none hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 dark:ring-foreground/7',
        TAP_CARD,
      )}
    >
      <span className="flex items-center gap-3">
        <IconTile icon={icon} tone={tone} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate">{label}</span>
          {note && <span className="truncate text-sm text-muted-foreground">{note}</span>}
        </span>
        <span className={cn('text-3xl font-extrabold tabular-nums', TONES[tone].text)} data-value>
          {value}
        </span>
      </span>
      {footer}
    </Link>
  );
}

/**
 * The clock (the reference's dark tile): the time in large gradient numbers and today's date,
 * Baghdad time, always on a dark surface. Read once a second; nothing moves but the numbers.
 */
export function ClockTile() {
  const { t } = useTranslation('home');
  const format = useFormat();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div
      role="timer"
      aria-label={t('stats.clock')}
      aria-live="off"
      className="dark flex min-w-56 flex-col items-center gap-1 rounded-card bg-background px-6 py-4 text-foreground shadow-xl ring-1 ring-foreground/10"
    >
      <span
        dir="ltr"
        className="bg-linear-to-r from-tone-cyan via-tone-violet to-tone-pink bg-clip-text text-4xl leading-tight font-extrabold text-transparent tabular-nums"
      >
        {format.time(now)}
      </span>
      <span className="bg-linear-to-r from-tone-violet to-tone-pink bg-clip-text text-sm text-transparent">
        {format.date(now, 'full')}
      </span>
    </div>
  );
}
