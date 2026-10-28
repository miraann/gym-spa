import { createFileRoute } from '@tanstack/react-router';
import { TrainersPage } from '@/features/pt/trainers-page';

export const Route = createFileRoute('/trainers/')({
  component: TrainersPage,
});
