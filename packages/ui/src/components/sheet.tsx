/* eslint-disable gym/no-physical-direction-classes -- the `side` prop is physical by design
   ("left" | "right"); callers pick the side from the text direction. */
'use client';

import * as React from 'react';
import { cn } from 'cn';
import { Dialog as SheetPrimitive } from 'radix-ui';

import { Button } from './button';
import { XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/30 duration-200 dark:bg-black/50 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = 'right',
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: 'top' | 'right' | 'bottom' | 'left';
  showCloseButton?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          // Bottom sheets look like a phone's: rounded top, a grabber, sliding all the way up.
          'fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-base text-popover-foreground shadow-lg transition duration-250 ease-spring data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:mx-auto data-[side=bottom]:h-auto data-[side=bottom]:max-w-2xl data-[side=bottom]:rounded-t-[calc(var(--radius)*1.75)] data-[side=bottom]:pt-2 data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-e data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-s data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-[side=bottom]:data-open:slide-in-from-bottom data-[side=left]:data-open:slide-in-from-left-10 data-[side=right]:data-open:slide-in-from-right-10 data-[side=top]:data-open:slide-in-from-top-10 data-closed:animate-out data-closed:fade-out-0 data-[side=bottom]:data-closed:slide-out-to-bottom data-[side=left]:data-closed:slide-out-to-left-10 data-[side=right]:data-closed:slide-out-to-right-10 data-[side=top]:data-closed:slide-out-to-top-10',
          className,
        )}
        {...props}
      >
        {side === 'bottom' && <SheetGrabber />}
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button variant="ghost" className="absolute end-3 top-3" size="icon-sm">
              <XIcon />
              <span className="sr-only">{t('actions.close')}</span>
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

/** How far (of the sheet's height) or how fast (px per ms) a drag must go down to close it. */
const DRAG_CLOSE_SHARE = 0.3;
const DRAG_CLOSE_SPEED = 0.5;

/**
 * A bottom sheet's grabber: dragging it (a 48px strip along the top, so it never fights with
 * scrolling the content) moves the sheet with the finger, and a long or quick drag down closes it,
 * like a phone's own sheets. Esc, the close button and tapping outside still close it too.
 */
function SheetGrabber() {
  const close = React.useRef<HTMLButtonElement>(null);
  const drag = React.useRef<{ y: number; time: number; sheet: HTMLElement } | null>(null);

  const offset = (event: React.PointerEvent) => Math.max(0, event.clientY - (drag.current?.y ?? 0));
  const end = (event: React.PointerEvent, cancelled: boolean) => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    const distance = offset(event);
    const speed = distance / Math.max(1, event.timeStamp - current.time);
    current.sheet.style.transition = '';
    const closing =
      !cancelled &&
      (distance > current.sheet.offsetHeight * DRAG_CLOSE_SHARE ||
        (distance > 24 && speed > DRAG_CLOSE_SPEED));
    if (closing) {
      close.current?.click();
    } else {
      current.sheet.style.translate = '';
    }
  };

  return (
    <>
      <div
        aria-hidden
        data-slot="sheet-grabber"
        className="absolute inset-x-0 top-0 mx-auto flex h-12 w-40 cursor-grab touch-none justify-center pt-2 active:cursor-grabbing"
        onPointerDown={(event) => {
          const sheet = event.currentTarget.closest<HTMLElement>('[data-slot="sheet-content"]');
          if (!sheet || event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { y: event.clientY, time: event.timeStamp, sheet };
          sheet.style.transition = 'none';
        }}
        onPointerMove={(event) => {
          if (drag.current) drag.current.sheet.style.translate = `0 ${offset(event)}px`;
        }}
        onPointerUp={(event) => {
          end(event, false);
        }}
        onPointerCancel={(event) => {
          end(event, true);
        }}
      >
        <span className="h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30" />
      </div>
      {/* The grabber's own way to close the sheet, which Radix then animates as usual. */}
      <SheetPrimitive.Close ref={close} hidden tabIndex={-1} aria-hidden />
      {/* Keeps the room the grabber had when it was part of the layout. */}
      <div aria-hidden className="h-1.5 shrink-0" />
    </>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-0.5 p-4', className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('mt-auto flex flex-col gap-2 p-4', className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('font-heading text-lg font-bold text-foreground', className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
