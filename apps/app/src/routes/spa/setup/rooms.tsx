import { createFileRoute } from '@tanstack/react-router';
import { RoomsSetup } from '@/features/spa/rooms-setup';

export const Route = createFileRoute('/spa/setup/rooms')({
  component: RoomsSetup,
});
