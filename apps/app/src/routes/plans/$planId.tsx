import { createFileRoute } from '@tanstack/react-router';
import { PlanPage } from '@/features/plans/plan-page';

export const Route = createFileRoute('/plans/$planId')({
  component: PlanPage,
});
