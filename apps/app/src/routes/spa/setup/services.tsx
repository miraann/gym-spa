import { createFileRoute } from '@tanstack/react-router';
import { ServicesSetup } from '@/features/spa/services-setup';

export const Route = createFileRoute('/spa/setup/services')({
  component: ServicesSetup,
});
