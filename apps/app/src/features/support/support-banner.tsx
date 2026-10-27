import { Alert, AlertDescription, AlertTitle } from '@gym/ui/components/alert';
import { Link } from '@tanstack/react-router';
import { ShieldCheckIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePermission } from '@/features/auth/use-permissions';
import { useFormat } from '@/lib/format';
import { useRunningSupportGrant } from './support-data';

/**
 * At the top of every page while Click Group may see the gym's data (spec §2.6): for every staff
 * member, with a way to it for those who may end it (support.grant).
 */
export function SupportBanner() {
  const { t } = useTranslation('support');
  const format = useFormat();
  const grant = useRunningSupportGrant();
  const mayManage = usePermission('support.grant');
  if (grant === null) return null;
  return (
    <Alert role="status" data-support-notice className="mb-4 md:mb-6">
      <ShieldCheckIcon aria-hidden="true" />
      <AlertTitle>{t('notice.text', { date: format.dateTime(grant.endsAt) })}</AlertTitle>
      {mayManage && (
        <AlertDescription>
          <Link to="/settings/support" className="underline underline-offset-4">
            {t('notice.manage')}
          </Link>
        </AlertDescription>
      )}
    </Alert>
  );
}
