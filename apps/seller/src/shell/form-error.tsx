import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { CircleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PanelErrorKey } from '@/lib/errors';

/** Why the last action failed, translated; nothing while there is no error. */
export function FormError({ error }: { readonly error: PanelErrorKey | null }) {
  const { t } = useTranslation('seller');
  if (error === null) return null;
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
    </Alert>
  );
}

/** A message from a key of the seller namespace (e.g. login.invalid). */
export function FormMessage({ text }: { readonly text: string | null }) {
  if (text === null) return null;
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}
