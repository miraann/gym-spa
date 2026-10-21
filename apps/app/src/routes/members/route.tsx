import { createFileRoute } from '@tanstack/react-router';
import { parseMemberListSearch } from '@/features/members/member-list-search';
import { MembersLayout } from '@/features/members/members-layout';

export const Route = createFileRoute('/members')({
  validateSearch: parseMemberListSearch,
  component: MembersLayout,
});
