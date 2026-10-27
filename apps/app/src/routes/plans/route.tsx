import { createFileRoute } from '@tanstack/react-router';
import { PlansLayout } from '@/features/plans/plans-layout';

export const Route = createFileRoute('/plans')({
  component: PlansLayout,
});
