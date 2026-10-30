import { cn } from '@gym/ui/lib/utils';

/**
 * A menu item's 3D picture (navigation.ts). Decoration only: the item's name is always written
 * next to it or is its accessible name.
 */
export function NavArt({ art, className }: { readonly art: string; readonly className?: string }) {
  return (
    <img
      src={art}
      alt=""
      aria-hidden
      draggable={false}
      width={96}
      height={96}
      className={cn('pointer-events-none shrink-0 object-contain select-none', className)}
    />
  );
}
