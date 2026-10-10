import { DumbbellIcon } from 'lucide-react';
import { useGymLogo } from '@/lib/appearance';
import { cn } from '@/lib/utils';

/**
 * The gym's logo, or the app's mark in the brand color when the gym has none (its name is shown
 * next to it). Decorative: the name beside it is what screen readers read.
 */
export function GymMark({ className }: { readonly className?: string }) {
  const logo = useGymLogo();
  const box = cn('flex size-8 shrink-0 items-center justify-center rounded-xl', className);

  if (logo) {
    return (
      // Logos are made for white paper (receipts print them too), so they sit on white in dark
      // mode as well; a dark logo would vanish on the dark background.
      <span className={cn(box, 'overflow-hidden bg-white p-0.5 ring-1 ring-foreground/10')}>
        <img src={logo} alt="" className="size-full object-contain" />
      </span>
    );
  }
  return (
    <span className={cn(box, 'bg-primary text-primary-foreground')}>
      <DumbbellIcon aria-hidden className="size-1/2" />
    </span>
  );
}
