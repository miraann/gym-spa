import { createFileRoute } from '@tanstack/react-router';
import { VisitsPage } from '@/features/checkin/visits-page';

export const Route = createFileRoute('/checkin/visits')({
  component: VisitsPage,
});
