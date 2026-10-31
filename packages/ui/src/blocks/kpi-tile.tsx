import type { LucideIcon } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ReactNode } from 'react';
import { Skeleton } from '../components/skeleton';
import { cn } from '../lib/utils';
import { TONE_CLASSES, type Tone } from '../lib/tones';
import { IconTile } from './icon-tile';

/**
 * A dashboard number (step D-5b): a pastel card in its section tone. The icon tile sits at the
 * reading start with the trend chip at the end; below them the title, the big number in the tone
 * and one muted line. With 18rem of its own room (a container query, not the window) the card
 * gets bigger corners, more padding and a larger number. A link (asChild) or a plain card.
 */
export function KpiTile({
  icon,
  tone,
  label,
  value,
  note,
  trend,
  footer,
  asChild = false,
  className,
  children,
  ...props
}: {
  readonly icon: LucideIcon;
  readonly tone: Tone;
  readonly label: string;
  /** Already formatted; null while loading. */
  readonly value: string | null;
  readonly note?: ReactNode;
  readonly trend?: ReactNode;
  readonly footer?: ReactNode;
  readonly asChild?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
} & Record<`data-${string}`, string | undefined>) {
  const colors = TONE_CLASSES[tone];
  const Comp = asChild ? Slot.Root : 'div';
  return (
    <Comp
      data-slot="kpi-tile"
      className={cn(
        'group/kpi @container flex rounded-3xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
      {...props}
    >
      <Slot.Slottable>{children}</Slot.Slottable>
      <span
        className={cn(
          'flex flex-1 flex-col gap-3 rounded-card p-4 shadow-md ring-1 transition-shadow duration-200 group-hover/kpi:shadow-lg @[18rem]:rounded-3xl @[18rem]:p-6',
          colors.soft,
        )}
      >
        <span className="flex items-start justify-between gap-2">
          <IconTile icon={icon} tone={tone} />
          {trend}
        </span>
        <span className="flex flex-1 flex-col justify-end gap-1">
          <span className="text-base leading-snug">{label}</span>
          {value === null ? (
            <Skeleton className="h-10 w-20" />
          ) : (
            <span
              className={cn(
                'text-4xl leading-none font-extrabold tabular-nums @[18rem]:text-5xl',
                colors.text,
              )}
              data-value
            >
              {value}
            </span>
          )}
          {note && <span className="text-sm text-muted-foreground">{note}</span>}
        </span>
        {footer}
      </span>
    </Comp>
  );
}
