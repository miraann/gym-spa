import { createFileRoute } from '@tanstack/react-router';
import { SellPage } from '@/features/subscriptions/sell-page';

export const Route = createFileRoute('/members/$memberId/sell')({
  component: SellPage,
});
