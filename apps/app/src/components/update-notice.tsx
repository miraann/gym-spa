import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Alert, AlertDescription, AlertTitle } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { Spinner } from '@gym/ui/components/spinner';
import { RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppUpdate } from '@/app/app-update';
import { hasUnsavedChanges } from '@/lib/unsaved-changes';

/**
 * A new version of the web app is waiting (step 3a): says so until staff switch to it. Switching
 * reloads the page, which locks the app (`hint`: say so, where staff are logged in), so a form
 * with changes not saved asks first.
 */
export function UpdateNotice({ hint = true }: { readonly hint?: boolean }) {
  const { t } = useTranslation();
  const applyUpdate = useAppUpdate();
  const [confirming, setConfirming] = useState(false);
  const [updating, setUpdating] = useState(false);
  if (applyUpdate === null) return null;

  const update = () => {
    setConfirming(false);
    setUpdating(true);
    void applyUpdate();
  };

  return (
    <>
      <Alert data-testid="update-notice">
        <RefreshCwIcon />
        <AlertTitle>{t('pwa.updateAvailable')}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          {hint && <span>{t('pwa.updateHint')}</span>}
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
      <ResponsiveDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('pwa.unsavedTitle')}
        description={t('pwa.unsavedText')}
        footer={
          <>
            <Button variant="destructive" onClick={update}>
              {t('pwa.updateAnyway')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setConfirming(false);
              }}
            >
              {t('actions.later')}
            </Button>
          </>
        }
      />
    </>
  );
}
