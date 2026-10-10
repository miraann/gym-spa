import { createFileRoute } from '@tanstack/react-router';
import { AppearancePage } from '@/features/appearance/appearance-page';

export const Route = createFileRoute('/settings/appearance')({
  component: AppearancePage,
});
