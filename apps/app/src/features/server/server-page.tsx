import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRoundIcon, MonitorIcon, ShieldCheckIcon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ListGroup, ListRow, ListRowIcon } from '@gym/ui/blocks/list-group';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Alert, AlertDescription, AlertTitle } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Spinner } from '@gym/ui/components/spinner';
import { RequirePermission } from '@/components/no-access';
import { useActingClient } from '@/features/staff/admin-data';
import type { AppSupabaseClient } from '@/lib/backend';
import { useFormat } from '@/lib/format';
import { BackupsCard } from './backups-card';
import {
  fetchPairedPcs,
  newPairingCode,
  removePairedPc,
  type PairedPcs,
  type PairingCode,
} from './server-admin';

// Settings → سێرڤەر (steps OF-d, OF-e): on the server PC of the offline edition, for staff with
// server.manage. A new code pairs one PC (10 minutes; the PC shows the same identity as here); the
// paired PCs can be removed, which refuses them at once; the backups and putting one back.

const PCS_KEY = 'server-pcs';

async function sessionToken(client: AppSupabaseClient | undefined): Promise<string | null> {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

export function ServerPage() {
  return (
    <RequirePermission permission="server.manage">
      <ServerPageContent />
    </RequirePermission>
  );
}

function ServerPageContent() {
  const { t } = useTranslation('server');
  const format = useFormat();
  const queryClient = useQueryClient();
  const { client, actor } = useActingClient();
  const [code, setCode] = useState<PairingCode | null>(null);
  const [removing, setRemoving] = useState<PairedPcs['pcs'][number] | null>(null);
  const pcs = useQuery({
    queryKey: [PCS_KEY, actor],
    enabled: client !== undefined,
    queryFn: async () => fetchPairedPcs(await sessionToken(client)),
    refetchInterval: 30_000,
  });
  const makeCode = useMutation({
    mutationFn: async () => newPairingCode(await sessionToken(client)),
    onSuccess: setCode,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => removePairedPc(id, await sessionToken(client)),
    onSuccess: () => {
      setRemoving(null);
      toast.success(t('page.removed'));
      void queryClient.invalidateQueries({ queryKey: [PCS_KEY] });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('page.title')} description={t('page.description')} />
      {(pcs.isError || makeCode.isError) && (
        <Alert variant="destructive" role="alert">
          <TriangleAlertIcon />
          <AlertDescription>{t('page.error')}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('page.identity')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p dir="ltr" data-server-identity className="text-3xl tracking-widest tabular-nums">
            {pcs.data?.identity ?? '…'}
          </p>
          <Button
            className="self-start"
            disabled={makeCode.isPending || client === undefined}
            onClick={() => {
              makeCode.mutate();
            }}
          >
            {makeCode.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <KeyRoundIcon data-icon="inline-start" />
            )}
            {t('page.newCode')}
          </Button>
          {code && (
            <Alert>
              <ShieldCheckIcon />
              <AlertTitle>
                <span
                  dir="ltr"
                  data-pairing-code
                  className="text-4xl tracking-[0.3em] tabular-nums"
                >
                  {code.code}
                </span>
              </AlertTitle>
              <AlertDescription>
                {t('page.codeHint', { time: format.time(code.expiresAt) })}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <BackupsCard token={() => sessionToken(client)} />

      <section aria-labelledby="paired-pcs" className="flex flex-col gap-3">
        <h2 id="paired-pcs" className="text-lg text-foreground">
          {t('page.pcsTitle')}
        </h2>
        {pcs.isPending ? (
          <Skeleton className="h-24 w-full rounded-2xl" />
        ) : (pcs.data?.pcs ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('page.noPcs')}</p>
        ) : (
          <ListGroup>
            {(pcs.data?.pcs ?? []).map((pc) => (
              <ListRow
                key={pc.id}
                leading={
                  <ListRowIcon>
                    <MonitorIcon />
                  </ListRowIcon>
                }
                title={pc.name}
                description={[
                  t('page.pairedOn', { date: format.date(pc.pairedAt) }),
                  pc.lastSeenAt
                    ? t('page.lastSeen', { date: format.dateTime(pc.lastSeenAt) })
                    : t('page.neverSeen'),
                ].join(' · ')}
                trailing={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRemoving(pc);
                    }}
                  >
                    {t('page.remove')}
                  </Button>
                }
              />
            ))}
          </ListGroup>
        )}
      </section>

      <ResponsiveDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={t('page.removeTitle', { name: removing?.name ?? '' })}
        description={t('page.removeText')}
        footer={
          <>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (removing) remove.mutate(removing.id);
              }}
            >
              {remove.isPending && <Spinner />}
              {t('page.remove')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setRemoving(null);
              }}
            >
              {t('page.cancel')}
            </Button>
          </>
        }
      />
    </div>
  );
}
