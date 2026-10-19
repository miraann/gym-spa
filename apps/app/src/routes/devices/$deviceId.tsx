import { createFileRoute } from '@tanstack/react-router';
import { DevicePage } from '@/features/devices/device-page';

export const Route = createFileRoute('/devices/$deviceId')({
  component: DevicePage,
});
