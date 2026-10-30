import {
  findServers,
  linkThisPcAsServer,
  pairWithServer,
  probeServer,
  type ProbedServer,
  type ServerLinkStatus,
} from '@gym/platform';
import { useQuery } from '@tanstack/react-query';
import { RefreshCwIcon, ServerIcon, ShieldCheckIcon } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Spinner } from '@gym/ui/components/spinner';
import { ListGroup, ListRow, ListRowIcon } from '@gym/ui/blocks/list-group';
import { AuthLayout } from '@/features/auth/screens/auth-layout';
import { FormError } from '@/features/auth/screens/form-error';

// The offline edition's first screen on a PC that isn't linked to the gym's server yet (step
// OF-d): the server PC itself links to the server running on it; any other PC picks a server the
// network found (or types its address), checks that the identity matches the server's screen, and
// types the code made there. The Windows app keeps the link; this page never sees its token.

/** The servers the network found, the server PC's own, or one typed in. */
export function ConnectScreen({
  status,
  onLinked,
}: {
  readonly status: ServerLinkStatus;
  readonly onLinked: () => void;
}) {
  const { t } = useTranslation('server');
  const [chosen, setChosen] = useState<ProbedServer | null>(null);
  const [address, setAddress] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const found = useQuery({ queryKey: ['server-find'], queryFn: findServers, staleTime: Infinity });

  if (chosen) {
    return (
      <PairStep
        server={chosen}
        computerName={status.computerName}
        onBack={() => {
          setChosen(null);
        }}
        onLinked={onLinked}
      />
    );
  }

  const check = async (target: string) => {
    setBusy(true);
    setProblem(null);
    const probed = await probeServer(target);
    setBusy(false);
    if (probed) setChosen(probed);
    else setProblem(t('connect.notFound'));
  };
  const thisPc = async () => {
    setBusy(true);
    setProblem(null);
    const linked = await linkThisPcAsServer();
    setBusy(false);
    if (linked) onLinked();
    else setProblem(t('connect.notThisPc'));
  };
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (address.trim() !== '') void check(address.trim());
  };

  return (
    <AuthLayout title={t('connect.title')} description={t('connect.description')}>
      <FieldGroup>
        <Button variant="outline" disabled={busy} onClick={() => void thisPc()}>
          <ServerIcon data-icon="inline-start" />
          {t('connect.thisPc')}
        </Button>

        <section aria-labelledby="found-servers" className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 id="found-servers" className="text-base text-foreground">
              {t('connect.found')}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              disabled={found.isFetching}
              onClick={() => void found.refetch()}
            >
              <RefreshCwIcon data-icon="inline-start" />
              {t('connect.searchAgain')}
            </Button>
          </div>
          {found.isFetching ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              {t('connect.searching')}
            </p>
          ) : (found.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('connect.noneFound')}</p>
          ) : (
            <ListGroup>
              {(found.data ?? []).map((server) => (
                <ListRow
                  key={server.address}
                  asChild
                  leading={
                    <ListRowIcon>
                      <ServerIcon />
                    </ListRowIcon>
                  }
                  title={server.gym?.name ?? t('connect.noGym')}
                  description={<span dir="ltr">{`${server.address} · ${server.identity}`}</span>}
                >
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void check(`${server.address}:${String(server.port)}`)}
                  />
                </ListRow>
              ))}
            </ListGroup>
          )}
        </section>

        <form noValidate onSubmit={submit} className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="server-address">{t('connect.address')}</FieldLabel>
            <Input
              id="server-address"
              dir="ltr"
              autoComplete="off"
              value={address}
              onChange={(event) => {
                setAddress(event.target.value);
              }}
            />
            <FieldDescription>{t('connect.addressHint')}</FieldDescription>
          </Field>
          <Button type="submit" disabled={busy || address.trim() === ''}>
            {busy && <Spinner data-icon="inline-start" />}
            {t('connect.check')}
          </Button>
        </form>
        <FormError message={problem} />
      </FieldGroup>
    </AuthLayout>
  );
}

/** A checked server: its identity to compare, this PC's name and the code from its screen. */
function PairStep({
  server,
  computerName,
  onBack,
  onLinked,
}: {
  readonly server: ProbedServer;
  readonly computerName: string;
  readonly onBack: () => void;
  readonly onLinked: () => void;
}) {
  const { t } = useTranslation('server');
  const [name, setName] = useState(computerName);
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    const result = await pairWithServer(server, code, name.trim());
    setBusy(false);
    if (result.ok) onLinked();
    else setProblem(t(`connect.errors.${result.error}`));
  };

  return (
    <AuthLayout
      title={server.gym?.name ?? t('connect.noGym')}
      description={t('connect.version', { version: server.version })}
    >
      <form noValidate onSubmit={(event) => void submit(event)}>
        <FieldGroup>
          <Alert>
            <ShieldCheckIcon />
            <AlertTitle>{t('connect.identity')}</AlertTitle>
            <AlertDescription>
              <p
                dir="ltr"
                data-server-identity
                className="text-2xl tracking-widest text-foreground tabular-nums"
              >
                {server.identity}
              </p>
              <p>{t('connect.identityHint')}</p>
            </AlertDescription>
          </Alert>
          <Field>
            <FieldLabel htmlFor="pc-name">{t('connect.pcName')}</FieldLabel>
            <Input
              id="pc-name"
              maxLength={60}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="pairing-code">{t('connect.code')}</FieldLabel>
            <Input
              id="pairing-code"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={12}
              autoFocus
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
              }}
            />
            <FieldDescription>{t('connect.codeHint')}</FieldDescription>
          </Field>
          <FormError message={problem} />
          <Button type="submit" disabled={busy || code.trim() === '' || name.trim() === ''}>
            {busy && <Spinner data-icon="inline-start" />}
            {t('connect.connect')}
          </Button>
          <Button type="button" variant="ghost" onClick={onBack}>
            {t('connect.back')}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}
