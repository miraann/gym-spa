import { createFileRoute } from '@tanstack/react-router';
import { GymSettingsPage } from '@/features/settings/gym-settings-page';

export const Route = createFileRoute('/settings/gym')({
  component: GymSettingsPage,
});
