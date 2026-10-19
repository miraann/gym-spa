import { createFileRoute } from '@tanstack/react-router';
import { NewBranchPage } from '@/features/branches/branch-page';

export const Route = createFileRoute('/branches/new')({
  component: NewBranchPage,
});
