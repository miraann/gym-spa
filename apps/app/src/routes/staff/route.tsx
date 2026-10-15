import { createFileRoute } from '@tanstack/react-router';
import { StaffLayout } from '@/features/staff/staff-layout';

export const Route = createFileRoute('/staff')({
  component: StaffLayout,
});
