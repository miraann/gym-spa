import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MemberErrorKey } from './member-errors';

/** A failed load or change of a members screen, in words (members:errors). */
export function MemberError({ error }: { readonly error: MemberErrorKey | null }) {
  const { t } = useTranslation('members');
  if (error === null) return null;
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlertIcon />
      <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
    </Alert>
  );
}
