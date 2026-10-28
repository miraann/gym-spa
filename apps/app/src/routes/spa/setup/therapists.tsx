import { createFileRoute } from '@tanstack/react-router';
import { TherapistsSetup } from '@/features/spa/therapists-setup';

export const Route = createFileRoute('/spa/setup/therapists')({
  component: TherapistsSetup,
});
