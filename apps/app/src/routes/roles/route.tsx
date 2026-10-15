import { createFileRoute } from '@tanstack/react-router';
import { RolesLayout } from '@/features/roles/roles-layout';

export const Route = createFileRoute('/roles')({
  component: RolesLayout,
});
