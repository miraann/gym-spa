import { createFileRoute } from '@tanstack/react-router';
import { RolePage } from '@/features/roles/role-editor';

export const Route = createFileRoute('/roles/$roleId')({
  component: RolePage,
});
