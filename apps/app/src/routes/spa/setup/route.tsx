import { createFileRoute } from '@tanstack/react-router';
import { SpaSetupLayout } from '@/features/spa/spa-setup-layout';

export const Route = createFileRoute('/spa/setup')({
  component: SpaSetupLayout,
});
