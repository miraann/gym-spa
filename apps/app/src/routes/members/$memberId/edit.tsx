import { createFileRoute } from '@tanstack/react-router';
import { EditMemberPage } from '@/features/members/member-form-pages';

export const Route = createFileRoute('/members/$memberId/edit')({
  component: EditMemberPage,
});
