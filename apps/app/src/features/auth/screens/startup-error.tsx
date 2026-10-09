import { TriangleAlertIcon } from 'lucide-react';
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

/** Shown when the logins saved on this device can't be read (the details are in the log). */
export function StartupError() {
  const { t } = useTranslation();
  return (
    <Empty className="min-h-svh">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TriangleAlertIcon />
        </EmptyMedia>
        <EmptyTitle>{t('errors.unexpectedTitle')}</EmptyTitle>
        <EmptyDescription>{t('errors.unexpectedHint')}</EmptyDescription>
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
