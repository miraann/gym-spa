import {
  CircleCheckIcon,
  CircleHelpIcon,
  CircleAlertIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../components/button';
import { Spinner } from '../components/spinner';
import { cn } from '../lib/utils';
import { ResponsiveDialog } from './responsive-dialog';

export type ConfirmTone = 'primary' | 'destructive' | 'warning' | 'success';

/** The round icon's tint and color: a 10% tint (20% in dark mode), as the tested soft tints. */
const TONES: Readonly<Record<ConfirmTone, { icon: LucideIcon; classes: string }>> = {
  primary: { icon: CircleHelpIcon, classes: 'bg-primary/10 text-primary dark:bg-primary/20' },
  destructive: {
    icon: TriangleAlertIcon,
    classes: 'bg-destructive/10 text-destructive dark:bg-destructive/20',
  },
  warning: { icon: CircleAlertIcon, classes: 'bg-warning/10 text-warning dark:bg-warning/20' },
  success: { icon: CircleCheckIcon, classes: 'bg-success/10 text-success dark:bg-success/20' },
};

/**
 * A question that is answered yes or no (step D-5d): a 64px round icon in its tone, the title and
 * the message centered, then cancel and the main button side by side (the destructive one red).
 * A bottom sheet on phones, like every dialog. `children` is anything the question needs to show
 * (a card number, an error). Dialogs with a form keep ResponsiveDialog.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  tone = 'primary',
  icon,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  pending = false,
  disabled = false,
  children,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  readonly tone?: ConfirmTone;
  /** Instead of the tone's own icon. */
  readonly icon?: LucideIcon;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly onConfirm: () => void;
  /** What cancel does; closing the dialog when not given. */
  readonly onCancel?: () => void;
  /** The answer is being saved: the main button shows a spinner and waits. */
  readonly pending?: boolean;
  readonly disabled?: boolean;
  readonly children?: ReactNode;
}) {
  const Icon = icon ?? TONES[tone].icon;
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      focusFirst={false}
      media={
        <span
          data-slot="confirm-icon"
          data-tone={tone}
          className={cn(
            'mb-1 flex size-16 shrink-0 items-center justify-center rounded-full',
            TONES[tone].classes,
          )}
        >
          <Icon aria-hidden className="size-8" />
        </span>
      }
      footer={
        <>
          <Button
            size="lg"
            variant={tone === 'destructive' ? 'destructive' : 'default'}
            disabled={disabled || pending}
            onClick={onConfirm}
          >
            {pending && <Spinner />}
            {confirmLabel}
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => {
              if (onCancel) onCancel();
              else onOpenChange(false);
            }}
          >
            {cancelLabel}
          </Button>
        </>
      }
    >
      {children}
    </ResponsiveDialog>
  );
}
