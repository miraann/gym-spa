import { createFileRoute } from '@tanstack/react-router';
import { CashPage } from '@/features/cash/cash-page';

export const Route = createFileRoute('/cash')({
  component: CashPage,
});
