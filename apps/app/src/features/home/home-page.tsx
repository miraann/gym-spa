import { ChartColumnIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/page-header';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useFormat } from '@/lib/format';

export function HomePage() {
  const { t } = useTranslation('home');
  const format = useFormat();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('today', { date: format.date(new Date(), 'full') })}
      />
      {/* The dashboard (check-ins, revenue, expiring plans) is built in Phase 10. */}
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ChartColumnIcon />
          </EmptyMedia>
          <EmptyTitle>{t('emptyTitle')}</EmptyTitle>
          <EmptyDescription>{t('emptyHint')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
