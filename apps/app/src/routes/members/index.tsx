import { createFileRoute } from '@tanstack/react-router';
import { FullMemberList } from '@/features/members/member-list';

export const Route = createFileRoute('/members/')({
  component: FullMemberList,
});
