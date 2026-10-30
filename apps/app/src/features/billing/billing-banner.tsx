import {
  CalendarClockIcon,
  CalendarXIcon,
  CirclePauseIcon,
  ClockAlertIcon,
  EyeIcon,
  KeyRoundIcon,
  XIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { readOnlyReason, useServerInfo } from '@/features/server/server-info';
import { isOfflineEdition } from '@/lib/edition';
import { useFormat } from '@/lib/format';
import { useBillingNotice } from './use-billing-notice';

/**
 * The gym's subscription with Click Group, at the top of every page (spec §2.6): the 30-, 7- and
 * 1-day warnings and the grace period for staff with billing.view, and the read-only state for
 * everyone. Amber while it still works, red when it ended or nothing can be saved; always with an
 * icon and words, never color alone. The offline edition speaks of its license (مۆڵەت) instead,
 * and says why a gym is read-only: the PC isn't activated, the clock was set back, and so on.
 */
export function BillingBanner() {
  const { t } = useTranslation();
  const format = useFormat();
  const shown = useBillingNotice();
  const server = useServerInfo();
  if (shown === null) return null;
  const { notice, hide } = shown;
  const words = isOfflineEdition ? 'license' : 'billing';

  let icon: ReactNode;
  let title: string;
  let text: string;
  let variant: 'warning' | 'destructive';
  switch (notice.kind) {
    case 'ending':
      icon = <CalendarClockIcon aria-hidden="true" />;
      title = t(`${words}.endingTitle`);
      text = t(`${words}.endingText`, {
        date: format.date(notice.lastPaidAt),
        days: format.number(notice.daysLeft),
      });
      variant = 'warning';
      break;
    case 'grace':
      icon = <CalendarXIcon aria-hidden="true" />;
      title = t(`${words}.graceTitle`);
      text = t(`${words}.graceText`, {
        endedOn: format.date(notice.lastPaidAt),
        readOnlyOn: format.date(notice.readOnlyAt),
        days: format.number(notice.daysLeft),
      });
      variant = 'destructive';
      break;
    case 'read_only': {
      const offline = isOfflineEdition ? readOnlyReason(server.data?.license ?? null) : null;
      if (offline !== null) {
        icon =
          offline === 'clock' ? (
            <ClockAlertIcon aria-hidden="true" />
          ) : (
            <KeyRoundIcon aria-hidden="true" />
          );
        title = t(`license.${offline}Title`);
        text = t(`license.${offline}Text`);
      } else if (notice.reason === 'suspended') {
        icon = <CirclePauseIcon aria-hidden="true" />;
        title = t('billing.suspendedTitle');
        text = t('billing.suspendedText');
      } else {
        icon = <EyeIcon aria-hidden="true" />;
        title = t(`${words}.endedTitle`);
        text = t(`${words}.endedText`);
      }
      variant = 'destructive';
      break;
    }
  }

  return (
    <Alert
      role="status"
      variant={variant}
      data-billing-notice={notice.kind === 'ending' ? `ending-${notice.stage}` : notice.kind}
      className="mb-4 md:mb-6"
    >
      {icon}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{text}</AlertDescription>
      {hide && (
        <AlertAction>
          <Button variant="ghost" size="icon" onClick={hide} aria-label={t('billing.hide')}>
            <XIcon aria-hidden="true" />
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}
