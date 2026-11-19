import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { TONE_CLASSES, type Tone } from '../lib/tones';

/**
 * A white icon on a rounded tile of a section tone (step D-5b): 48px on cards, 40px in rows. The
 * warning color is for something that is a warning (low stock), never decoration.
 */
export function IconTile({
  icon: Icon,
  tone,
  size = 'md',
  className,
}: {
  readonly icon: LucideIcon;
  readonly tone: Tone | 'warning';
  readonly size?: 'md' | 'sm';
  readonly className?: string;
}) {
  return (
    <span
      aria-hidden
      data-slot="icon-tile"
      className={cn(
        'flex shrink-0 items-center justify-center',
        size === 'md' ? 'size-12 rounded-2xl shadow-md' : 'size-10 rounded-xl',
        tone === 'warning'
          ? 'bg-warning text-warning-foreground'
          : cn(TONE_CLASSES[tone].fill, 'text-tone-foreground'),
        className,
      )}
    >
      <Icon className={size === 'md' ? 'size-6' : 'size-5'} />
    </span>
  );
}
