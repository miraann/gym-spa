import { createFileRoute } from '@tanstack/react-router';
import { SpaCommissionsPage } from '@/features/spa/spa-commissions-page';

export const Route = createFileRoute('/spa/commissions')({
  component: SpaCommissionsPage,
});
