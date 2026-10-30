import { PlusIcon } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

/**
 * The way to add something new (a member, a product, a plan…), asked for by the user on
 * 2026-10-30 (step D-4): a dashed, brand-tinted card with a round plus and the label. `tile` is
 * one card of a grid, as tall as its neighbours and placed first; `row` is a full-width row at the
 * top of a list or table, or in a card's header. A button, or (asChild) a link; the label is its
 * accessible name.
 */
export function AddTile({
  label,
  shape = 'row',
  asChild = false,
  className,
  children,
  ...props
}: ComponentProps<'button'> & {
  readonly label: string;
  readonly shape?: 'tile' | 'row';
  readonly asChild?: boolean;
}) {
  const content = (
    <>
      <span
        aria-hidden
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-primary bg-(image:--gradient-primary) text-primary-foreground shadow-[0_8px_20px_-6px_var(--glow)] transition-transform duration-200 ease-spring group-hover/add:scale-105 group-active/add:scale-95 motion-reduce:transition-none',
          shape === 'tile' ? 'size-18' : 'size-10',
        )}
      >
        <PlusIcon className={shape === 'tile' ? 'size-9' : 'size-6'} strokeWidth={2.5} />
      </span>
      <span className={cn('min-w-0 text-primary', shape === 'tile' ? 'text-lg' : 'text-base')}>
        {label}
      </span>
    </>
  );

  const classes = cn(
    'group/add flex items-center justify-center rounded-card border-2 border-dashed border-primary/35 bg-accent/45 text-center shadow-sm transition-colors duration-200 outline-none hover:border-primary/60 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none',
    shape === 'tile'
      ? 'min-h-48 w-full flex-col gap-3 p-6'
      : 'min-h-16 w-full gap-3 px-4 py-3 pointer-coarse:min-h-18',
    className,
  );

  // asChild: the link (the only child) becomes the tile, with the plus and the label inside it.
  if (asChild) {
    return (
      <Slot.Root data-slot="add-tile" data-shape={shape} className={classes} {...props}>
        <Slot.Slottable>{children}</Slot.Slottable>
        {content}
      </Slot.Root>
    );
  }
  return (
    <button data-slot="add-tile" data-shape={shape} type="button" className={classes} {...props}>
      {content}
    </button>
  );
}
