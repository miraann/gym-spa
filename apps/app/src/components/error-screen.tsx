import { Link, type ErrorComponentProps } from '@tanstack/react-router';
import { FileQuestionMarkIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect } from 'react';
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
import { logError } from '@/lib/logger';

/** Friendly message for the user; the technical details go to the log. */
export function ErrorScreen({ error, reset }: ErrorComponentProps) {
  const { t } = useTranslation();

  useEffect(() => {
    logError(error, { area: 'route' });
  }, [error]);

  return (
    <Empty className="min-h-[60vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TriangleAlertIcon />
        </EmptyMedia>
        <EmptyTitle>{t('errors.unexpectedTitle')}</EmptyTitle>
        <EmptyDescription>{t('errors.unexpectedHint')}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center">
        <Button onClick={reset}>{t('actions.tryAgain')}</Button>
        <Button
          variant="outline"
          onClick={() => {
            window.location.reload();
          }}
        >
          {t('actions.reload')}
        </Button>
      </EmptyContent>
    </Empty>
  );
}

export function NotFoundScreen() {
  const { t } = useTranslation();

  return (
    <Empty className="min-h-[60vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileQuestionMarkIcon />
        </EmptyMedia>
        <EmptyTitle>{t('errors.notFoundTitle')}</EmptyTitle>
        <EmptyDescription>{t('errors.notFoundHint')}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link to="/">{t('actions.goHome')}</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
