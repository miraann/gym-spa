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
import { useLayout } from '../hooks/use-layout';

/** Keeps the focus on the dialog itself instead of its first field (no keyboard pops up). */
function focusDialog(event: Event) {
  event.preventDefault();
  if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
}

/**
 * A dialog that becomes a bottom sheet on phones (CLAUDE.md → Design), so its buttons are in reach
 * of the thumb. `footer` holds the actions, the main one first. `focusFirst` false: the dialog
 * opens without focusing its first field, e.g. on touch screens, where that opens the keyboard
 * before staff have read what the dialog says.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  focusFirst = true,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  readonly children?: ReactNode;
  readonly footer: ReactNode;
  readonly focusFirst?: boolean;
}) {
  const phone = useLayout() === 'phone';
  const onOpenAutoFocus = focusFirst ? undefined : focusDialog;

  if (phone) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[85svh] gap-0 rounded-t-3xl"
          onOpenAutoFocus={onOpenAutoFocus}
        >
          <SheetHeader className="pe-12">
            <SheetTitle>{title}</SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
          {children && <div className="overflow-y-auto px-4 pb-2">{children}</div>}
          <SheetFooter className="*:w-full">{footer}</SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onOpenAutoFocus={onOpenAutoFocus}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
