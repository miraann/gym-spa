import { createFileRoute } from '@tanstack/react-router';
import { RemindersPage } from '@/features/notifications/reminders-page';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const Route = createFileRoute('/notifications')({
  // ?day=YYYY-MM-DD: the bell opens a day's reminders.
  validateSearch: (search: Record<string, unknown>): { day?: string } =>
    typeof search.day === 'string' && DAY.test(search.day) ? { day: search.day } : {},
  component: RemindersPage,
});
