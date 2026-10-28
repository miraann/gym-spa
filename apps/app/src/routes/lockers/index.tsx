import { createFileRoute } from '@tanstack/react-router';
import { LockersPage } from '@/features/lockers/lockers-page';

export const Route = createFileRoute('/lockers/')({
  component: LockersPage,
});
