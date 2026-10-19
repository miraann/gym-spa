import { createFileRoute } from '@tanstack/react-router';
import { BranchesLayout } from '@/features/branches/branches-layout';

export const Route = createFileRoute('/branches')({
  component: BranchesLayout,
});
