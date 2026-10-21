import { createFileRoute } from '@tanstack/react-router';
import { MemberPage } from '@/features/members/member-page';

export const Route = createFileRoute('/members/$memberId/')({
  component: MemberPage,
});
