import { createFileRoute } from '@tanstack/react-router';
import { NewStaffPage } from '@/features/staff/new-staff-page';

export const Route = createFileRoute('/staff/new')({
  component: NewStaffPage,
});
