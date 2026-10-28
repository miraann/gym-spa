import { createFileRoute } from '@tanstack/react-router';
import { ClassesPage } from '@/features/classes/classes-page';

export const Route = createFileRoute('/classes/')({
  component: ClassesPage,
});
