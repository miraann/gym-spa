import { createFileRoute } from '@tanstack/react-router';
import { DoorScreenPage } from '@/features/checkin/door-screen';

export const Route = createFileRoute('/checkin/door')({
  component: DoorScreenPage,
});
