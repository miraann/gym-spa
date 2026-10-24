import { createFileRoute } from '@tanstack/react-router';
import { PlanPlaceholder } from '@/features/plans/plans-layout';

export const Route = createFileRoute('/plans/')({
  component: PlanPlaceholder,
});
