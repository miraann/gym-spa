import { Alert, AlertDescription, AlertTitle } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { Spinner } from '@gym/ui/components/spinner';
import { ConfirmDialog } from '@gym/ui/blocks/confirm-dialog';
import { RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppUpdate } from '@/app/app-update';
import { hasUnsavedChanges } from '@/lib/unsaved-changes';

/**
 * A new version of the app is waiting (step 3a; the Windows app's own updates, step 11c): says so
 * until staff switch to it. Switching reloads the page or restarts the Windows app, which locks
 * the app (`hint`: say so, where staff are logged in), so a form with changes not saved asks first.
 */
export function UpdateNotice({ hint = true }: { readonly hint?: boolean }) {
  const { t } = useTranslation();
  const appUpdate = useAppUpdate();
  const [confirming, setConfirming] = useState(false);
  const [updating, setUpdating] = useState(false);
  if (appUpdate === null) return null;

  const update = () => {
    setConfirming(false);
    setUpdating(true);
    void appUpdate.apply();
  };

  return (
    <>
      <Alert data-testid="update-notice">
        <RefreshCwIcon />
        <AlertTitle>{t('pwa.updateAvailable')}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          {hint && (
            <span>{t(appUpdate.restartsApp ? 'pwa.updateHintRestart' : 'pwa.updateHint')}</span>
          )}
          <Button
            size="sm"
            disabled={updating}
            onClick={() => {
              if (hasUnsavedChanges()) setConfirming(true);
              else update();
            }}
          >
            {updating ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            {t('actions.update')}
          </Button>
        </AlertDescription>
      </Alert>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        tone="destructive"
        title={t('pwa.unsavedTitle')}
        description={t('pwa.unsavedText')}
        confirmLabel={t('pwa.updateAnyway')}
        cancelLabel={t('actions.later')}
        onConfirm={update}
      />
    </>
  );
}
