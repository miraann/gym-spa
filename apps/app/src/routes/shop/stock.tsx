import { createFileRoute } from '@tanstack/react-router';
import { StockPage } from '@/features/shop/stock-page';

export const Route = createFileRoute('/shop/stock')({
  component: StockPage,
});
