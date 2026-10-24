import { createFileRoute } from '@tanstack/react-router';
import { NewPlanPage } from '@/features/plans/plan-page';

export const Route = createFileRoute('/plans/new')({
  component: NewPlanPage,
});
