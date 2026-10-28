import { createFileRoute } from '@tanstack/react-router';
import { ClockPage } from '@/features/hr/clock-page';

export const Route = createFileRoute('/hr/clock')({
  component: ClockPage,
});
