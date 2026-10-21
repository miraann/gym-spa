import { createFileRoute } from '@tanstack/react-router';
import { NewMemberPage } from '@/features/members/member-form-pages';

export const Route = createFileRoute('/members/new')({
  component: NewMemberPage,
});
