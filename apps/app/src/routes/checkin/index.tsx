import { createFileRoute } from '@tanstack/react-router';
import { CheckinPage } from '@/features/checkin/checkin-page';

export const Route = createFileRoute('/checkin/')({
  component: CheckinPage,
});
