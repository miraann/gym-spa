import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { useSideBySide } from '@gym/ui/hooks/use-side-by-side';
import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AppPath } from '@/app/navigation';
import type { AdminErrorKey } from './admin-errors';

/** A failed load or change of an admin screen, in words (staff:errors). */
export function AdminError({ error }: { readonly error: AdminErrorKey | null }) {
  const { t } = useTranslation('staff');
  if (error === null) return null;
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlertIcon />
      <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
    </Alert>
  );
}

/** Back to the list, when the list isn't beside the open item. */
export function BackToList({ to, label }: { readonly to: AppPath; readonly label: string }) {
  if (useSideBySide()) return null;
  return (
    <Button asChild variant="ghost" className="self-start">
      <Link to={to}>
        {/* Points back to the reading start: right in Kurdish and Arabic, left in English. */}
        <ArrowRightIcon className="ltr:rotate-180" aria-hidden="true" />
        {label}
      </Link>
    </Button>
  );
}
