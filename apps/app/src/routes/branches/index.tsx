import { createFileRoute } from '@tanstack/react-router';
import { BranchPlaceholder } from '@/features/branches/branches-layout';

export const Route = createFileRoute('/branches/')({
  component: BranchPlaceholder,
});
