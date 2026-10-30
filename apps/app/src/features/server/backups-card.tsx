import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestoreIcon, DatabaseBackupIcon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ListGroup, ListRow, ListRowIcon } from '@gym/ui/blocks/list-group';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Field, FieldDescription, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Spinner } from '@gym/ui/components/spinner';
import { usePermission } from '@/features/auth/use-permissions';
import { useFormat } from '@/lib/format';
import {
  backUpNow,
  fetchBackups,
  restoreBackup,
  saveBackupSettings,
  ServerAdminError,
  type Backups,
} from './server-admin';
import { useServerInfo } from './server-info';

// The server's backups on Settings → سێرڤەر (step OF-e): the daily time and a second folder, a
// backup now, the list, and putting one back (backups.restore), confirmed by typing the gym code.

type BackupErrorKey =
  | 'invalid_time'
  | 'invalid_folder'
  | 'confirm_mismatch'
  | 'backup_failed'
  | 'restore_failed'
  | 'backup_other_gym'
  | 'busy'
  | 'backup_not_found'
  | 'unexpected';

const KNOWN: readonly BackupErrorKey[] = [
  'invalid_time',
  'invalid_folder',
  'confirm_mismatch',
  'backup_failed',
  'restore_failed',
  'backup_other_gym',
  'busy',
  'backup_not_found',
];

function errorKey(error: unknown): BackupErrorKey {
  const key = error instanceof ServerAdminError ? error.key : 'unexpected';
  return KNOWN.find((known) => known === key) ?? 'unexpected';
}

export function BackupsCard({ token }: { readonly token: () => Promise<string | null> }) {
  const { t } = useTranslation('server');
  const format = useFormat();
  const queryClient = useQueryClient();
  const canRestore = usePermission('backups.restore');
  const gymCode = useServerInfo().data?.gym?.code ?? '';
  const backups = useQuery({
    queryKey: ['server-backups'],
    queryFn: async () => fetchBackups(await token()),
  });
  const [restoring, setRestoring] = useState<Backups['backups'][number] | null>(null);
  const [confirm, setConfirm] = useState('');
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['server-backups'] });

  const now = useMutation({
    mutationFn: async () => backUpNow(await token()),
    onSuccess: () => {
      toast.success(t('backups.made'));
      void refresh();
    },
  });
  const restore = useMutation({
    mutationFn: async (name: string) => restoreBackup(name, confirm, await token()),
    onSuccess: () => {
      toast.success(t('backups.restored'));
      // Every screen's data changed: the app starts again (and asks for a PIN, as after any reload).
      window.location.reload();
    },
  });
  const failed = now.error ?? backups.error;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('backups.title')}</CardTitle>
        <CardDescription>{t('backups.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {failed && (
          <Alert variant="destructive" role="alert">
            <TriangleAlertIcon />
            <AlertDescription>{t(`backups.errors.${errorKey(failed)}`)}</AlertDescription>
          </Alert>
        )}
        {backups.data && (
          <SettingsForm
            // A fresh form whenever the saved settings change.
            key={`${backups.data.settings.time}|${backups.data.settings.copyTo ?? ''}`}
            settings={backups.data.settings}
            token={token}
            onSaved={() => void refresh()}
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={now.isPending}
            onClick={() => {
              now.mutate();
            }}
          >
            {now.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <DatabaseBackupIcon data-icon="inline-start" />
            )}
            {t('backups.now')}
          </Button>
        </div>
        {(backups.data?.backups ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('backups.none')}</p>
        ) : (
          <ListGroup>
            {(backups.data?.backups ?? []).map((backup) => (
              <ListRow
                key={backup.name}
                leading={
                  <ListRowIcon>
                    <DatabaseBackupIcon />
                  </ListRowIcon>
                }
                title={<span className="tabular-nums">{format.dateTime(backup.createdAt)}</span>}
                description={
                  <span dir="ltr">
                    {`${backup.name} · ${t('backups.size', { size: (backup.size / 1_048_576).toFixed(1) })}`}
                  </span>
                }
                trailing={
                  canRestore && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setConfirm('');
                        restore.reset();
                        setRestoring(backup);
                      }}
                    >
                      <ArchiveRestoreIcon data-icon="inline-start" />
                      {t('backups.restore')}
                    </Button>
                  )
                }
              />
            ))}
          </ListGroup>
        )}
      </CardContent>
      <ResponsiveDialog
        open={restoring !== null}
        onOpenChange={(open) => {
          if (!open) setRestoring(null);
        }}
        title={t('backups.restoreTitle')}
        description={t('backups.restoreText')}
        footer={
          <>
            <Button
              variant="destructive"
              disabled={restore.isPending || confirm.trim().toLowerCase() !== gymCode}
              onClick={() => {
                if (restoring) restore.mutate(restoring.name);
              }}
            >
              {restore.isPending && <Spinner />}
              {t('backups.restore')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setRestoring(null);
              }}
            >
              {t('page.cancel')}
            </Button>
          </>
        }
      >
        <Field>
          <FieldLabel htmlFor="restore-confirm">
            {t('backups.confirmCode', { code: gymCode })}
          </FieldLabel>
          <Input
            id="restore-confirm"
            dir="ltr"
            autoComplete="off"
            value={confirm}
            onChange={(event) => {
              setConfirm(event.target.value);
            }}
          />
        </Field>
        {restore.isError && (
          <Alert variant="destructive" role="alert">
            <TriangleAlertIcon />
            <AlertDescription>{t(`backups.errors.${errorKey(restore.error)}`)}</AlertDescription>
          </Alert>
        )}
      </ResponsiveDialog>
    </Card>
  );
}

/** The daily time and the second folder, as saved; saved again on request. */
function SettingsForm({
  settings,
  token,
  onSaved,
}: {
  readonly settings: Backups['settings'];
  readonly token: () => Promise<string | null>;
  readonly onSaved: () => void;
}) {
  const { t } = useTranslation('server');
  const [time, setTime] = useState(settings.time);
  const [copyTo, setCopyTo] = useState(settings.copyTo ?? '');
  const save = useMutation({
    mutationFn: async () =>
      saveBackupSettings(
        { time, copyTo: copyTo.trim() === '' ? null : copyTo.trim() },
        await token(),
      ),
    onSuccess: () => {
      toast.success(t('backups.saved'));
      onSaved();
    },
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <Field>
          <FieldLabel htmlFor="backup-time">{t('backups.time')}</FieldLabel>
          <Input
            id="backup-time"
            type="time"
            dir="ltr"
            value={time}
            onChange={(event) => {
              setTime(event.target.value);
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="backup-copy-to">{t('backups.copyTo')}</FieldLabel>
          <Input
            id="backup-copy-to"
            dir="ltr"
            value={copyTo}
            onChange={(event) => {
              setCopyTo(event.target.value);
            }}
          />
          <FieldDescription>{t('backups.copyToHint')}</FieldDescription>
        </Field>
      </div>
      {save.isError && (
        <Alert variant="destructive" role="alert">
          <TriangleAlertIcon />
          <AlertDescription>{t(`backups.errors.${errorKey(save.error)}`)}</AlertDescription>
        </Alert>
      )}
      <Button
        variant="outline"
        className="self-start"
        disabled={save.isPending || !time}
        onClick={() => {
          save.mutate();
        }}
      >
        {save.isPending && <Spinner data-icon="inline-start" />}
        {t('backups.save')}
      </Button>
    </div>
  );
}
