import { saveFile } from '@gym/platform';
import { Button } from '@gym/ui/components/button';
import { DownloadIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePermission } from '@/features/auth/use-permissions';
import { useDeviceGym } from '@/features/auth/auth-context';
import { requireClient, useActingClient } from '@/features/staff/admin-data';
import { useAdminWriteState } from '@/features/staff/write-state';
import { logError } from '@/lib/logger';
import { useFormat } from '@/lib/format';
import { useBaghdadToday } from '@/lib/use-today';
import { exportGymData } from './export-data';

/** Exporting all of the gym's data as a zip of CSV files (backups.export, step 10f). */
export function ExportAllData() {
  const { t } = useTranslation('settings');
  const format = useFormat();
  const mayExport = usePermission('backups.export');
  const { client } = useActingClient();
  const { online } = useAdminWriteState();
  const gym = useDeviceGym();
  const today = useBaghdadToday();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  if (!mayExport) return null;

  return (
    <section
      className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-sm ring-1 ring-foreground/6 md:p-5"
      data-testid="export-all"
    >
      <h2 className="text-lg">{t('export.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('export.description')}</p>
      <Button
        variant="outline"
        className="self-start"
        disabled={!online || progress !== null}
        onClick={() => {
          setProgress({ done: 0, total: 1 });
          void (async () => {
            try {
              const zip = await exportGymData(requireClient(client), (done, total) => {
                setProgress({ done, total });
              });
              await saveFile({ name: `${gym?.code ?? 'gym'}-${today}.zip`, content: zip });
              toast.success(t('export.done'));
            } catch (error) {
              logError(error, { area: 'backup', action: 'export' });
              toast.error(t('export.failed'));
            } finally {
              setProgress(null);
            }
          })();
        }}
      >
        <DownloadIcon data-icon="inline-start" />
        {progress
          ? t('export.working', {
              done: format.number(progress.done),
              total: format.number(progress.total),
            })
          : t('export.button')}
      </Button>
    </section>
  );
}
