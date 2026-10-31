import { DumbbellIcon } from 'lucide-react';
import { useGymLogo } from '@/lib/appearance';
import { cn } from '@gym/ui/lib/utils';

/**
 * The gym's logo, or the app's mark in the brand color when the gym has none (its name is shown
 * next to it). Decorative: the name beside it is what screen readers read. Sized by className
 * (size-10 by default); the logo keeps its own shape and sharpness (it is stored up to 512px).
 */
export function GymMark({
  className,
  onBrand = false,
}: {
  readonly className?: string;
  /** Drawn on a brand-colored background (the login's brand panel). */
  readonly onBrand?: boolean;
}) {
  const logo = useGymLogo();
  const box = cn(
    'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl shadow-sm',
    className,
  );

  if (logo) {
    return (
      // Logos are made for white paper (receipts print them too), so they sit on white in dark
      // mode as well; a dark logo would vanish on the dark background.
      <span className={cn(box, 'bg-white p-[8%] ring-1 ring-black/5')}>
        <img
          src={logo}
          alt=""
          decoding="async"
          data-slot="gym-logo"
          className="size-full object-contain"
        />
      </span>
    );
  }
  return (
    <span
      className={cn(
        box,
        onBrand
          ? 'bg-primary-foreground/15 text-primary-foreground ring-1 ring-primary-foreground/25'
          : 'bg-[linear-gradient(140deg,color-mix(in_oklch,var(--primary),white_18%),var(--primary)_55%,color-mix(in_oklch,var(--primary),black_18%))] text-primary-foreground',
      )}
    >
      <DumbbellIcon aria-hidden className="size-[55%] -rotate-45" />
    </span>
  );
}
