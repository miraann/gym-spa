import { createFileRoute } from '@tanstack/react-router';
import { PrinterSettingsPage } from '@/features/payments/printer-settings-page';

export const Route = createFileRoute('/settings/printer')({
  component: PrinterSettingsPage,
});
