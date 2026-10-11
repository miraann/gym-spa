import { useTranslation } from 'react-i18next';
import { CopyableSecret } from '@gym/ui/blocks/copyable-secret';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Button } from '@gym/ui/components/button';

/**
 * A temporary password from the server (a new account, or a password reset), shown once: it lives
 * only in the parent's state while this is open, and is never stored anywhere.
 */
export function TemporaryPasswordPanel({ password }: { readonly password: string }) {
  const { t } = useTranslation('staff');
  return (
    <CopyableSecret
      value={password}
      texts={{
        label: t('temporaryPassword.label'),
        copy: t('temporaryPassword.copy'),
        copied: t('temporaryPassword.copied'),
        copyFailed: t('temporaryPassword.copyFailed'),
        shownOnce: t('temporaryPassword.shownOnce'),
      }}
    />
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
