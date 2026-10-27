import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SubscriptionErrorKey } from './subscription-errors';

/** A failed load or sale, in words (subscriptions:errors). */
export function SubscriptionError({ error }: { readonly error: SubscriptionErrorKey | null }) {
  const { t } = useTranslation('subscriptions');
  if (error === null) return null;
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlertIcon />
      <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
    </Alert>
  );
}
