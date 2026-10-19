import { createFileRoute } from '@tanstack/react-router';
import { BranchPage } from '@/features/branches/branch-page';

export const Route = createFileRoute('/branches/$branchId')({
  component: BranchPage,
});
