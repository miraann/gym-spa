import { createFileRoute } from '@tanstack/react-router';
import { TillPage } from '@/features/shop/till-page';

export const Route = createFileRoute('/shop/')({
  component: TillPage,
});
