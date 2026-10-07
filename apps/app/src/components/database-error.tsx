import { DatabaseIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

/** Shown instead of the app when the local database can't be opened (the app can't work without it). */
export function DatabaseError() {
  const { t } = useTranslation();
  return (
    <Empty className="min-h-svh">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <DatabaseIcon />
        </EmptyMedia>
        <EmptyTitle>{t('database.openFailedTitle')}</EmptyTitle>
        <EmptyDescription>{t('database.openFailedHint')}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          onClick={() => {
            window.location.reload();
          }}
        >
          {t('actions.tryAgain')}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
