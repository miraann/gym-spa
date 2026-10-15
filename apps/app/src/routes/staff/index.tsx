import { createFileRoute } from '@tanstack/react-router';
import { StaffPlaceholder } from '@/features/staff/staff-layout';

export const Route = createFileRoute('/staff/')({
  component: StaffPlaceholder,
});
