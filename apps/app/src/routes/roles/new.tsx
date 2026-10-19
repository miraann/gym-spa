import { createFileRoute } from '@tanstack/react-router';
import { NewRolePage } from '@/features/roles/role-editor';

export const Route = createFileRoute('/roles/new')({
  component: NewRolePage,
});
