import { cn } from './utils';

/**
 * The classes of a grouped list row's link or button (blocks/list-group.tsx): a press and hover
 * tint, and the open row (`selected`) tinted with the brand.
 */
export function groupedRowClass(selected = false): string {
  return cn(
    'flex w-full items-center gap-3 px-4 py-3 text-start transition-colors duration-150 outline-none hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-muted',
    selected && 'bg-accent hover:bg-accent',
  );
}
