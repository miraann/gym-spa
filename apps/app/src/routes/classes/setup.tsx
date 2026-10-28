import { createFileRoute } from '@tanstack/react-router';
import { ClassesSetupPage } from '@/features/classes/classes-setup-page';

export const Route = createFileRoute('/classes/setup')({
  component: ClassesSetupPage,
});
