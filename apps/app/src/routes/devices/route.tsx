import { createFileRoute } from '@tanstack/react-router';
import { DevicesLayout } from '@/features/devices/devices-layout';

export const Route = createFileRoute('/devices')({
  component: DevicesLayout,
});
