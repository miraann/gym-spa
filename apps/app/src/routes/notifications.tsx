import { createFileRoute } from '@tanstack/react-router';
import { RemindersPage } from '@/features/notifications/reminders-page';

export const Route = createFileRoute('/notifications')({
  component: RemindersPage,
});
