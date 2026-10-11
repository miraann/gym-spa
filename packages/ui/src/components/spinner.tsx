import { cn } from 'cn';
import { Loader2Icon } from 'lucide-react';

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <Loader2Icon
      data-slot="spinner"
      // Decorative: the button or text next to it says what is happening.
      aria-hidden
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  );
}

export { Spinner };
