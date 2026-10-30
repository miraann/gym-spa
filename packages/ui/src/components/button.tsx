import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { Slot } from 'radix-ui';

const buttonVariants = cva(
  // Calm Bento (CLAUDE.md → Design): real weight, 40px controls (44px+ on touch screens), soft
  // depth on filled buttons, and a short press that scales down a little (none with reduced motion).
  "group/button inline-flex shrink-0 items-center justify-center rounded-xl border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,scale] duration-150 outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 motion-safe:active:not-aria-[haspopup]:scale-[0.97] dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4.5",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[0_1px_2px_oklch(0_0_0/0.1),0_6px_16px_-6px_color-mix(in_oklch,var(--primary)_60%,transparent),inset_0_1px_0_oklch(1_0_0/0.16)] hover:bg-primary/90',
        outline:
          'border-border bg-card shadow-xs hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default:
          'h-10 gap-2 px-4 has-data-[icon=inline-end]:pe-3 has-data-[icon=inline-start]:ps-3 pointer-coarse:h-12',
        xs: "h-7 gap-1 rounded-[min(var(--radius-md),10px)] px-2.5 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pe-1.5 has-data-[icon=inline-start]:ps-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 gap-1.5 rounded-[min(var(--radius-lg),12px)] px-3 text-[0.875rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pe-2 has-data-[icon=inline-start]:ps-2 pointer-coarse:h-12 pointer-coarse:px-3.5 [&_svg:not([class*='size-'])]:size-4",
        lg: 'h-11 gap-2 px-5 text-base has-data-[icon=inline-end]:pe-4 has-data-[icon=inline-start]:ps-4 pointer-coarse:h-12',
        icon: 'size-10 pointer-coarse:size-12',
        'icon-xs':
          "size-7 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
        'icon-sm':
          'size-8 rounded-[min(var(--radius-lg),12px)] in-data-[slot=button-group]:rounded-lg pointer-coarse:size-12',
        'icon-lg': 'size-11 pointer-coarse:size-12',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
