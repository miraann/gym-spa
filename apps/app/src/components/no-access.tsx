import { Button } from '@gym/ui/components/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@gym/ui/components/empty';
import { Link } from '@tanstack/react-router';
import { LockIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermission } from '@/features/auth/use-permissions';

/** A page the staff member may not open (an old link, or a permission taken away). */
export function NoAccess() {
  const { t } = useTranslation('common');
  return (
    <Empty data-testid="no-access">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LockIcon />
        </EmptyMedia>
        <EmptyTitle>{t('noAccess.title')}</EmptyTitle>
        <EmptyDescription>{t('noAccess.description')}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild variant="outline">
          <Link to="/">{t('actions.goHome')}</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

/**
 * Shows the page only to staff with the permission (from the last server check). It only hides:
 * the server refuses the page's reads and writes anyway.
 */
export function RequirePermission({
  permission,
  children,
}: {
  readonly permission: string;
  readonly children: ReactNode;
}) {
  return usePermission(permission) ? children : <NoAccess />;
}
