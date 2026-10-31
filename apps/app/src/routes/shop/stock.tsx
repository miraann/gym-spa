import { createFileRoute } from '@tanstack/react-router';
import { StockPage } from '@/features/shop/stock-page';

export const Route = createFileRoute('/shop/stock')({
  // ?low=1 (and ?branch=): the bell opens the products low in stock, in that branch.
  validateSearch: (search: Record<string, unknown>): { low?: boolean; branch?: string } => ({
    ...(search.low === true || search.low === 1 || search.low === '1' ? { low: true } : {}),
    ...(typeof search.branch === 'string' ? { branch: search.branch } : {}),
  }),
  component: StockPage,
});
