import { PageHeader } from '@gym/ui/blocks/page-header';
import { useTranslation } from 'react-i18next';
import { LogList } from './log-list';

/** Every seller action: who, when, which gym or admin, what, and the reason. */
export function LogPage() {
  const { t } = useTranslation('seller');
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('log.title')} />
      <LogList gymId={null} />
    </div>
  );
}
