import { createFileRoute } from '@tanstack/react-router';
import { PackagesSetup } from '@/features/spa/packages-setup';

export const Route = createFileRoute('/spa/setup/packages')({
  component: PackagesSetup,
});
