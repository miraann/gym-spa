import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CardErrorKey } from './card-errors';

/** A failed load or change of a card screen, in words (cards:errors). */
export function CardError({ error }: { readonly error: CardErrorKey | null }) {
  const { t } = useTranslation('cards');
  if (error === null) return null;
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlertIcon />
      <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
    </Alert>
  );
}
