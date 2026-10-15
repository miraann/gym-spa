import { createFileRoute } from '@tanstack/react-router';
import { StaffDetailPage } from '@/features/staff/staff-detail-page';

export const Route = createFileRoute('/staff/$staffId')({
  component: StaffDetailPage,
});
