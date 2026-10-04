import { createFileRoute } from '@tanstack/react-router';
import { DisplaySettingsPage } from '@/features/settings/display-settings-page';

export const Route = createFileRoute('/settings/display')({
  component: DisplaySettingsPage,
});
