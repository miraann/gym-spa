import { CalendarClockIcon, CalendarXIcon, CirclePauseIcon, EyeIcon, XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { useFormat } from '@/lib/format';
import { useBillingNotice } from './use-billing-notice';

/**
 * The gym's subscription with Click Group, at the top of every page (spec §2.6): the 30-, 7- and
 * 1-day warnings and the grace period for staff with billing.view, and the read-only state for
 * everyone. Amber while it still works, red when it ended or nothing can be saved; always with an
 * icon and words, never color alone.
 */
export function BillingBanner() {
  const { t } = useTranslation();
  const format = useFormat();
  const shown = useBillingNotice();
  if (shown === null) return null;
  const { notice, hide } = shown;

  let icon;
  let title;
  let text;
  let variant: 'warning' | 'destructive';
  switch (notice.kind) {
    case 'ending':
      icon = <CalendarClockIcon aria-hidden="true" />;
      title = t('billing.endingTitle');
      text = t('billing.endingText', {
        date: format.date(notice.lastPaidAt),
        days: format.number(notice.daysLeft),
      });
      variant = 'warning';
      break;
    case 'grace':
      icon = <CalendarXIcon aria-hidden="true" />;
      title = t('billing.graceTitle');
      text = t('billing.graceText', {
        endedOn: format.date(notice.lastPaidAt),
        readOnlyOn: format.date(notice.readOnlyAt),
        days: format.number(notice.daysLeft),
      });
      variant = 'destructive';
      break;
    case 'read_only':
      if (notice.reason === 'suspended') {
        icon = <CirclePauseIcon aria-hidden="true" />;
        title = t('billing.suspendedTitle');
        text = t('billing.suspendedText');
      } else {
        icon = <EyeIcon aria-hidden="true" />;
        title = t('billing.endedTitle');
        text = t('billing.endedText');
      }
      variant = 'destructive';
      break;
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
