import { createFileRoute } from '@tanstack/react-router';
import { ProductsPage } from '@/features/shop/products-page';

export const Route = createFileRoute('/shop/products')({
  component: ProductsPage,
});
