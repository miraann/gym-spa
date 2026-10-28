import { createFileRoute } from '@tanstack/react-router';
import { SpaPage } from '@/features/spa/spa-page';

export const Route = createFileRoute('/spa/')({
  component: SpaPage,
});
