import { createFileRoute } from '@tanstack/react-router';
import { SellPage } from '@/features/subscriptions/sell-page';

export const Route = createFileRoute('/members/$memberId/sell')({
  // ?plan=: renewing a subscription starts from its plan.
  validateSearch: (search: Record<string, unknown>): { plan?: string } =>
    typeof search.plan === 'string' ? { plan: search.plan } : {},
  component: SellPage,
});
