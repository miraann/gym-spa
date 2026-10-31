import { ChevronRightIcon } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { groupedRowClass } from '../lib/grouped-list';
import { cn } from '../lib/utils';

/**
 * A grouped, inset list like a native app's settings (CLAUDE.md → Design): one rounded card with
 * thin dividers between rows, an optional small heading above and a note below. With room for it,
 * a grid of cards instead (GroupedList).
 */
export function ListGroup({
  title,
  footer,
  children,
  className,
  ...props
}: Omit<ComponentProps<'section'>, 'title'> & {
  readonly title?: ReactNode;
  readonly footer?: ReactNode;
}) {
  return (
    <section data-slot="list-group" className={cn('flex flex-col gap-2', className)} {...props}>
      {title && <h2 className="px-4 text-sm font-semibold text-muted-foreground">{title}</h2>}
      <GroupedList>{children}</GroupedList>
      {footer && <p className="px-4 text-sm text-muted-foreground">{footer}</p>}
    </section>
  );
}

/**
 * One row of a ListGroup. With `asChild`, the row is the given link or button (e.g.
 * `<ListRow asChild title="…"><Link to="/members" /></ListRow>`) and shows a chevron, pointing
 * towards the reading end. The divider starts after the leading icon, like a native list.
 */
export function ListRow({
  asChild = false,
  title,
  description,
  leading,
  trailing,
  chevron = asChild,
  className,
  children,
  ...props
}: Omit<ComponentProps<'div'>, 'title'> & {
  readonly asChild?: boolean;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** An icon (ListRowIcon) or avatar at the start. */
  readonly leading?: ReactNode;
  /** A value, badge or switch at the end. */
  readonly trailing?: ReactNode;
  readonly chevron?: boolean;
}) {
  const Comp = asChild ? Slot.Root : 'div';
  return (
    <GroupedListItem data-slot="list-row" inset={Boolean(leading)}>
      <Comp
        className={cn(
          asChild
            ? cn(groupedRowClass(), 'cursor-pointer')
            : 'flex w-full items-center gap-3 px-4 py-3 text-start',
          'min-h-14 py-2.5',
          className,
        )}
        {...props}
      >
        <Slot.Slottable>{children}</Slot.Slottable>
        {leading}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{title}</span>
          {description && (
            <span className="truncate text-sm text-muted-foreground">{description}</span>
          )}
        </span>
        {trailing && (
          <span className="flex shrink-0 items-center gap-2 text-muted-foreground">{trailing}</span>
        )}
        {chevron && <RowChevron />}
      </Comp>
    </GroupedListItem>
  );
}

// Grouped lists whose rows have their own content (the members, staff, roles, branches and devices
// lists): the same look as ListGroup, built from these pieces.

// Narrow (a phone, a side column, a dialog): one rounded card with thin dividers. From 42rem of
// room: a grid of cards, two or three to a row (step D-4f, asked for by the user on 2026-10-30).
// The room is the list's own (a container query), never the window's.
const GROUP_CLASS = cn(
  'grid overflow-hidden rounded-card bg-card shadow-sm ring-1 ring-foreground/6 dark:ring-foreground/7',
  '@2xl/list:grid-cols-2 @2xl/list:gap-3 @2xl/list:overflow-visible @2xl/list:rounded-none @2xl/list:bg-transparent @2xl/list:shadow-none @2xl/list:ring-0 @5xl/list:grid-cols-3',
);

/** A list of rows in one rounded card with thin dividers, or a grid of cards when there is room. */
export function GroupedList({ className, ...props }: ComponentProps<'ul'>) {
  return (
    <div data-slot="grouped-list-room" className="@container/list">
      <ul data-slot="grouped-list" className={cn(GROUP_CLASS, className)} {...props} />
    </div>
  );
}

/** One row of a GroupedList; `inset` is where its divider starts (after an avatar or icon). */
export function GroupedListItem({
  inset = false,
  className,
  ...props
}: ComponentProps<'li'> & { readonly inset?: boolean }) {
  return (
    <li
      className={cn(
        'relative not-first:before:absolute not-first:before:end-0 not-first:before:top-0 not-first:before:z-10 not-first:before:h-px not-first:before:bg-border',
        inset ? 'not-first:before:start-16' : 'not-first:before:start-4',
        // In the grid: its own card, lifted a little on hover.
        '@2xl/list:overflow-hidden @2xl/list:rounded-card @2xl/list:bg-card @2xl/list:shadow-sm @2xl/list:ring-1 @2xl/list:ring-foreground/6 @2xl/list:transition-shadow @2xl/list:duration-200 @2xl/list:not-first:before:hidden @2xl/list:hover:shadow-md dark:@2xl/list:ring-foreground/7',
        className,
      )}
      {...props}
    />
  );
}

/** The chevron at a row's end, pointing towards the reading end. */
export function RowChevron() {
  return (
    <ChevronRightIcon
      aria-hidden
      className="size-5 shrink-0 text-muted-foreground/60 rtl:rotate-180"
    />
  );
}

/** A grouped list while it loads: rows shaped like the real ones. */
export function GroupedListSkeleton({
  rows = 4,
  avatar = false,
}: {
  readonly rows?: number;
  readonly avatar?: boolean;
}) {
  return (
    <div aria-hidden className={cn(GROUP_CLASS, 'divide-y divide-border')}>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-3 px-4 py-3.5">
          {avatar && (
            <span className="size-10 shrink-0 rounded-full bg-muted motion-safe:animate-pulse" />
          )}
          <span className="flex flex-1 flex-col gap-2">
            <span className="h-4 w-2/5 rounded-md bg-muted motion-safe:animate-pulse" />
            <span className="h-3 w-3/5 rounded-md bg-muted/70 motion-safe:animate-pulse" />
          </span>
        </div>
      ))}
    </div>
  );
}

/** A row's icon on a soft brand-tinted square. */
export function ListRowIcon({ children }: { readonly children: ReactNode }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-[min(var(--radius-xl),0.75rem)] bg-primary/10 text-primary [&_svg]:size-5">
      {children}
    </span>
  );
}
