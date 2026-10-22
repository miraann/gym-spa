import { createFileRoute } from '@tanstack/react-router';
import { MemberImportPage } from '@/features/member-import/member-import-page';

export const Route = createFileRoute('/members/import')({
  component: MemberImportPage,
});
