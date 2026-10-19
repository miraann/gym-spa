import { createFileRoute } from '@tanstack/react-router';
import { DevicePlaceholder } from '@/features/devices/devices-layout';

export const Route = createFileRoute('/devices/')({
  component: DevicePlaceholder,
});
