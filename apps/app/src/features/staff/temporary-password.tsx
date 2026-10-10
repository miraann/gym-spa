import { CheckIcon, CopyIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

type CopyState = 'idle' | 'copied' | 'failed';

/** How long "Copied" shows before the button reads "Copy" again. */
const COPIED_MS = 2000;

/**
 * A temporary password from the server (a new account, or a password reset), shown once: it lives
 * only in the parent's state while this is open, and is never stored anywhere. Latin and
 * left-to-right in every language, with a copy button and a note that it won't be shown again.
 */
export function TemporaryPasswordPanel({ password }: { readonly password: string }) {
  const { t } = useTranslation('staff');
  const labelId = useId();
  const [copy, setCopy] = useState<CopyState>('idle');

  useEffect(() => {
    if (copy !== 'copied') return;
    const timer = setTimeout(() => {
      setCopy('idle');
    }, COPIED_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [copy]);

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopy('copied');
    } catch {
      // No clipboard (an old WebView, or permission refused): it can still be read and typed.
      setCopy('failed');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <p id={labelId} className="text-sm text-muted-foreground">
          {t('temporaryPassword.label')}
        </p>
        <div className="flex items-center gap-2 rounded-2xl bg-muted p-2 ps-4">
          <output
            aria-labelledby={labelId}
            dir="ltr"
            translate="no"
            className="min-w-0 flex-1 font-mono text-2xl tracking-widest break-all select-all"
          >
            {password}
          </output>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => {
              void copyPassword();
            }}
          >
            {copy === 'copied' ? (
              <CheckIcon data-icon="inline-start" />
            ) : (
              <CopyIcon data-icon="inline-start" />
            )}
            {copy === 'copied' ? t('temporaryPassword.copied') : t('temporaryPassword.copy')}
          </Button>
        </div>
        <p role="status" className="min-h-5 text-sm text-destructive">
          {copy === 'failed' ? t('temporaryPassword.copyFailed') : null}
        </p>
      </div>
      <Alert variant="warning" role="note">
        <TriangleAlertIcon />
        <AlertDescription>{t('temporaryPassword.shownOnce')}</AlertDescription>
      </Alert>
    </div>
  );
}

/**
 * The temporary password in a dialog (a bottom sheet on phones). Closing it in any way drops the
 * password: the parent clears its state in onClose.
 */
export function TemporaryPasswordDialog({
  password,
  staffName,
  onClose,
}: {
  /** null: closed. */
  readonly password: string | null;
  readonly staffName: string;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('staff');
  return (
    <ResponsiveDialog
      open={password !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('temporaryPassword.title')}
      description={t('temporaryPassword.description', { name: staffName })}
      footer={
        <Button type="button" size="lg" onClick={onClose}>
          {t('temporaryPassword.done')}
        </Button>
      }
    >
      {password !== null && <TemporaryPasswordPanel password={password} />}
    </ResponsiveDialog>
  );
}
