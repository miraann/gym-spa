import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '../components/sheet';
import { cn } from '../lib/utils';
import { useLayout } from '../hooks/use-layout';

/** Keeps the focus on the dialog itself instead of its first field (no keyboard pops up). */
function focusDialog(event: Event) {
  event.preventDefault();
  if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
}

/** The confirm dialog's darker backdrop (step D-5d); no blur, which is only for floating bars. */
const CONFIRM_OVERLAY = 'bg-black/40 dark:bg-black/60';

/**
 * A dialog that becomes a bottom sheet on phones (CLAUDE.md → Design), so its buttons are in reach
 * of the thumb. `footer` holds the actions, the main one first. `focusFirst` false: the dialog
 * opens without focusing its first field, e.g. on touch screens, where that opens the keyboard
 * before staff have read what the dialog says. `media` (the confirm dialog, step D-5d) is a round
 * icon above a centered title and message, on a darker backdrop, with equal buttons; the dialog
 * springs in.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  focusFirst = true,
  wide = false,
  media,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  readonly children?: ReactNode;
  readonly footer: ReactNode;
  readonly focusFirst?: boolean;
  /** A wider dialog on larger screens, for long forms. */
  readonly wide?: boolean;
  readonly media?: ReactNode;
}) {
  const confirm = media !== undefined;
  const phone = useLayout() === 'phone';
  const onOpenAutoFocus = focusFirst ? undefined : focusDialog;

  if (phone) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[85svh] gap-0 rounded-t-3xl"
          overlayClassName={confirm ? CONFIRM_OVERLAY : undefined}
          {...(confirm ? { role: 'alertdialog' } : {})}
          onOpenAutoFocus={onOpenAutoFocus}
        >
          <SheetHeader className={confirm ? 'items-center px-12 text-center' : 'pe-12'}>
            {media}
            <SheetTitle>{title}</SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
          {children && (
            <div className="overflow-y-auto overscroll-contain px-4 pb-2">{children}</div>
          )}
          <SheetFooter className={confirm ? 'flex-row *:flex-1' : '*:w-full'}>{footer}</SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-h-[90svh] grid-rows-[auto_minmax(0,1fr)_auto]',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
          confirm && 'ease-spring motion-reduce:animate-none',
        )}
        overlayClassName={confirm ? CONFIRM_OVERLAY : undefined}
        {...(confirm ? { role: 'alertdialog' } : {})}
        onOpenAutoFocus={onOpenAutoFocus}
      >
        <DialogHeader className={cn(confirm && 'items-center pt-2 text-center')}>
          {media}
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {/* A long form scrolls between the title and the buttons; the padding keeps focus rings visible. */}
        {children && <div className="-mx-5 overflow-y-auto px-5 py-1">{children}</div>}
        <DialogFooter className={cn(confirm && 'sm:*:flex-1')}>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
