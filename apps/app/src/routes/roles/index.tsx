import { createFileRoute } from '@tanstack/react-router';
import { RolePlaceholder } from '@/features/roles/roles-layout';

export const Route = createFileRoute('/roles/')({
  component: RolePlaceholder,
});
