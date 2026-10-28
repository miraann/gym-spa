import { createFileRoute } from '@tanstack/react-router';
import { ShiftsPage } from '@/features/hr/shifts-page';

export const Route = createFileRoute('/hr/shifts')({
  component: ShiftsPage,
});
