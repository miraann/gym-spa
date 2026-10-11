import { PageHeader } from '@gym/ui/blocks/page-header';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Spinner } from '@gym/ui/components/spinner';
import { TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { NewPasswordForm, RecoveryCodesPanel } from '@/auth/password-screens';
import { useMe, useSession } from '@/auth/session';
import { newRecoveryCodes } from '@/lib/api';
import { useSellerClient } from '@/lib/client';
import { panelErrorKey, type PanelErrorKey } from '@/lib/errors';
import { FormError } from '@/shell/form-error';

/** The signed-in admin's own account: new recovery codes and a new password. */
export function AccountPage() {
  const { t } = useTranslation('seller');
  const client = useSellerClient();
  const me = useMe();
  const { refresh } = useSession();
  const [codes, setCodes] = useState<readonly string[] | null>(null);
  const [making, setMaking] = useState(false);
  const [error, setError] = useState<PanelErrorKey | null>(null);

  const makeCodes = async () => {
    setError(null);
    setMaking(true);
    try {
      setCodes(await newRecoveryCodes(client));
    } catch (thrown) {
      setError(panelErrorKey(thrown));
    } finally {
      setMaking(false);
    }
  };

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title={t('account.title')} description={me.email} />
      <Card>
        <CardHeader>
          <CardTitle>{t('account.twoStepTitle')}</CardTitle>
          <CardDescription>{t('account.newCodesNote')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {codes === null ? (
            <>
              {me.recovery_codes_left === 0 ? (
                <Alert variant="warning">
                  <TriangleAlertIcon />
                  <AlertDescription>{t('account.noCodes')}</AlertDescription>
                </Alert>
              ) : (
                <p>{t('account.codesLeft', { count: me.recovery_codes_left })}</p>
              )}
              <FormError error={error} />
              <Button className="self-start" disabled={making} onClick={() => void makeCodes()}>
                {making && <Spinner />}
                {t('account.newCodes')}
              </Button>
            </>
          ) : (
            <>
              <RecoveryCodesPanel codes={codes} email={me.email} />
              <Button
                className="self-start"
                onClick={() => {
                  setCodes(null);
                  void refresh();
                }}
              >
                {t('recovery.saved')}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('account.passwordTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <NewPasswordForm
            onDone={() => {
              toast.success(t('account.passwordChanged'));
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
