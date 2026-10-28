import { createFileRoute } from '@tanstack/react-router';
import { TrainerReportPage } from '@/features/pt/trainer-report-page';

export const Route = createFileRoute('/trainers/report')({
  component: TrainerReportPage,
});
