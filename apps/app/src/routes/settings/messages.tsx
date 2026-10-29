import { createFileRoute } from '@tanstack/react-router';
import { TemplatesPage } from '@/features/notifications/templates-page';

export const Route = createFileRoute('/settings/messages')({
  component: TemplatesPage,
});
