import { Slot } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A row of chips that is never clipped (CLAUDE.md → Layout guards): on phones it scrolls sideways
 * from edge to edge, with the page's padding at both ends; on wider screens it wraps.
 */
export function ChipRow({
  label,
  children,
  className,
}: {
  /** Names the row for screen readers (e.g. the setting the chips choose). */
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      data-slot="chip-row"
      role="group"
      aria-label={label}
      className={cn(
        // Phones: bleed into the page padding (main is p-4) and scroll, keeping that padding.
        '-mx-4 [scrollbar-width:none] overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0',
        className,
      )}
    >
      <div className="flex w-max gap-2 py-0.5 md:w-auto md:flex-wrap">{children}</div>
    </div>
  );
}

/** One chip: a pill, brand-colored when selected. A button, or (asChild) a link. */
export function Chip({
  selected,
  asChild = false,
  className,
  ...props
}: ComponentProps<'button'> & { readonly selected: boolean; readonly asChild?: boolean }) {
  const Component = asChild ? Slot.Root : 'button';
  return (
    <Component
      data-slot="chip"
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-4 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none pointer-coarse:h-11',
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-foreground hover:bg-muted',
        className,
      )}
      {...props}
    />
  );
}
