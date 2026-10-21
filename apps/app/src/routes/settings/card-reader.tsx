import { createFileRoute } from '@tanstack/react-router';
import { CardReaderSettingsPage } from '@/features/cards/card-reader-settings-page';

export const Route = createFileRoute('/settings/card-reader')({
  component: CardReaderSettingsPage,
});
