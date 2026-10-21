import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { EyeIcon, WifiOffIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAdminWriteState } from './write-state';

/**
 * Why the page's buttons are off: no connection, or a read-only gym (on the staff pages, what still
 * works then). Nothing otherwise.
 */
export function WriteStateNotice({
  area,
}: {
  readonly area: 'staff' | 'devices' | 'roles' | 'members';
}) {
  const { t } = useTranslation('staff');
  const { online, readOnly } = useAdminWriteState();
  if (!online) {
    return (
      <Alert variant="warning">
        <WifiOffIcon />
        <AlertDescription>{t('notices.offline')}</AlertDescription>
      </Alert>
    );
  }
  if (readOnly) {
    return (
      <Alert variant="warning">
        <EyeIcon />
        <AlertDescription>
          {t(
            area === 'staff'
              ? 'notices.readOnlyStaff'
              : area === 'devices'
                ? 'notices.readOnlyDevices'
                : 'notices.readOnly',
          )}
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}
