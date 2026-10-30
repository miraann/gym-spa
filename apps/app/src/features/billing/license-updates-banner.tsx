import { PackageXIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { useActiveAccount } from '@/features/auth/auth-context';
import { usePermission } from '@/features/auth/use-permissions';
import { useServerInfo } from '@/features/server/server-info';
import { isOfflineEdition } from '@/lib/edition';
import { useFormat } from '@/lib/format';

// A perpetual license never ends, but its updates do (spec §2.6): the offline edition warns staff
// with billing.view 30, 7 and 1 day before "updates until", and once after. Nothing stops working,
// so it can be closed; it comes back at the next stage or with a new date.

const HIDDEN_KEY_PREFIX = 'gym.updatesNotice.hidden.';

function readHidden(staffId: string): string | null {
  try {
    return localStorage.getItem(HIDDEN_KEY_PREFIX + staffId);
  } catch {
    return null;
  }
}

function saveHidden(staffId: string, value: string): void {
  try {
    localStorage.setItem(HIDDEN_KEY_PREFIX + staffId, value);
  } catch {
    // Storage is blocked: the notice just comes back on the next start.
  }
}

export function LicenseUpdatesBanner() {
  const { t } = useTranslation();
  const format = useFormat();
  const server = useServerInfo();
  const canViewBilling = usePermission('billing.view');
  const staffId = useActiveAccount()?.staffId;
  const [hiddenNow, setHiddenNow] = useState<string | null>(null);
  const license = server.data?.license;
  if (!isOfflineEdition || !canViewBilling || staffId === undefined || !license?.updatesUntil) {
    return null;
  }
  const { updates, updatesUntil } = license;
  if (updates === null || updates.kind === 'none') return null;
  const marker = `${updatesUntil}|${updates.kind === 'ending' ? String(updates.stage) : 'ended'}`;
  if (hiddenNow === marker || readHidden(staffId) === marker) return null;

  const ending = updates.kind === 'ending';
  return (
    <Alert
      role="status"
      variant="warning"
      data-updates-notice={updates.kind}
      className="mb-4 md:mb-6"
    >
      <PackageXIcon aria-hidden="true" />
      <AlertTitle>
        {t(ending ? 'license.updatesEndingTitle' : 'license.updatesEndedTitle')}
      </AlertTitle>
      <AlertDescription>
        {ending
          ? t('license.updatesEndingText', {
              date: format.date(`${updatesUntil}T12:00:00+03:00`),
              days: format.number(updates.daysLeft),
            })
          : t('license.updatesEndedText')}
      </AlertDescription>
      <AlertAction>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('billing.hide')}
          onClick={() => {
            saveHidden(staffId, marker);
            setHiddenNow(marker);
          }}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </AlertAction>
    </Alert>
  );
}
