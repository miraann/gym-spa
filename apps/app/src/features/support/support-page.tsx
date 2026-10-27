import { Chip, ChipRow } from '@gym/ui/blocks/chip-row';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { Alert, AlertDescription, AlertTitle } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Field, FieldError, FieldLabel } from '@gym/ui/components/field';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Textarea } from '@gym/ui/components/textarea';
import { Link } from '@tanstack/react-router';
import { ShieldCheckIcon, TriangleAlertIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { RequirePermission } from '@/components/no-access';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import {
  useGrantSupport,
  useRevokeSupport,
  useRunningSupportGrant,
  useSupportGrants,
  useSupportReads,
  type SupportGrant,
} from './support-data';
import { supportErrorKey, type SupportErrorKey } from './support-errors';

/** How long Click Group may look, in hours: the choices on the page (1 hour to 7 days). */
const DURATIONS = [1, 24, 72, 168] as const;
type Duration = (typeof DURATIONS)[number];

function SupportError({ error }: { readonly error: SupportErrorKey | null }) {
  const { t } = useTranslation('support');
  if (error === null) return null;
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlertIcon />
      <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
    </Alert>
  );
}

/** /settings/support (support.grant): letting Click Group see the gym's data for a while. */
export function SupportPage() {
  return (
    <RequirePermission permission="support.grant">
      <Support />
    </RequirePermission>
  );
}

function Support() {
  const { t } = useTranslation('support');
  const grants = useSupportGrants();
  const running = useRunningSupportGrant();
  const ended = grants.data?.filter((grant) => grant !== running) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('page.title')} description={t('page.description')} />
      <Card>
        <CardContent className="flex flex-col gap-4">
          {grants.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : grants.isError ? (
            <SupportError error={supportErrorKey(grants.error, 'load_grants')} />
          ) : running ? (
            <RunningGrant grant={running} />
          ) : (
            <GrantForm />
          )}
        </CardContent>
      </Card>
      <Reads />
      {ended.length > 0 && <EarlierGrants grants={ended} />}
    </div>
  );
}

function RunningGrant({ grant }: { readonly grant: SupportGrant }) {
  const { t } = useTranslation('support');
  const format = useFormat();
  const { online } = useAdminWriteState();
  const revoke = useRevokeSupport();
  const [error, setError] = useState<SupportErrorKey | null>(null);

  return (
    <div className="flex flex-col gap-3" data-testid="support-running">
      <Alert>
        <ShieldCheckIcon />
        <AlertTitle>{t('notice.text', { date: format.dateTime(grant.endsAt) })}</AlertTitle>
        <AlertDescription>{t('page.reason', { reason: grant.reason })}</AlertDescription>
      </Alert>
      <SupportError error={error} />
      <Button
        variant="destructive"
        className="self-start"
        // Ending it must work even in a read-only gym; only a connection is needed.
        disabled={!online || revoke.isPending}
        onClick={() => {
          setError(null);
          revoke.mutate(grant.id, {
            onSuccess: () => {
              toast.success(t('page.ended'));
            },
            onError: (thrown) => {
              setError(supportErrorKey(thrown, 'revoke'));
            },
          });
        }}
      >
        {t('page.end')}
      </Button>
    </div>
  );
}

function GrantForm() {
  const { t } = useTranslation('support');
  const id = useId();
  const { online } = useAdminWriteState();
  const grant = useGrantSupport();
  const [hours, setHours] = useState<Duration>(24);
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<SupportErrorKey | null>(null);
  const missing = reason.trim() === '';

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setSent(true);
        if (missing) return;
        setError(null);
        grant.mutate(
          { id: crypto.randomUUID(), hours, reason: reason.trim() },
          {
            onSuccess: () => {
              toast.success(t('page.granted'));
              setReason('');
              setSent(false);
            },
            onError: (thrown) => {
              setError(supportErrorKey(thrown, 'grant'));
            },
          },
        );
      }}
    >
      <p className="text-muted-foreground">{t('page.none')}</p>
      <ChipRow label={t('page.for')}>
        {DURATIONS.map((each) => (
          <Chip
            key={each}
            type="button"
            selected={hours === each}
            aria-pressed={hours === each}
            onClick={() => {
              setHours(each);
            }}
          >
            {t(`durations.${String(each) as '1' | '24' | '72' | '168'}`)}
          </Chip>
        ))}
      </ChipRow>
      <Field data-invalid={(sent && missing) || undefined}>
        <FieldLabel htmlFor={`${id}-reason`}>{t('page.reasonLabel')}</FieldLabel>
        <Textarea
          id={`${id}-reason`}
          value={reason}
          maxLength={300}
          aria-invalid={(sent && missing) || undefined}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
        {sent && missing && <FieldError>{t('errors.reason_required')}</FieldError>}
      </Field>
      <SupportError error={error} />
      <Button type="submit" className="self-start" disabled={!online || grant.isPending}>
        {t('page.allow')}
      </Button>
    </form>
  );
}

/** What Click Group read, so the gym can check it. */
function Reads() {
  const { t } = useTranslation('support');
  const format = useFormat();
  const reads = useSupportReads(true);
  return (
    <Card data-testid="support-reads">
      <CardHeader>
        <CardTitle>
          <h2>{t('reads.title')}</h2>
        </CardTitle>
        <CardDescription>{t('reads.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {reads.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : reads.isError ? (
          <SupportError error={supportErrorKey(reads.error, 'load_reads')} />
        ) : reads.data.length === 0 ? (
          <p className="text-muted-foreground">{t('reads.none')}</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {reads.data.map((read) => (
              <li
                key={read.id}
                className="flex flex-col gap-0.5 py-2"
                data-support-read={read.what}
              >
                <span>
                  {read.what === 'member' && read.member ? (
                    <>
                      {t('reads.member')}{' '}
                      <Link to="/members/$memberId" params={{ memberId: read.member.id }}>
                        {read.member.fullName}
                      </Link>
                    </>
                  ) : read.search ? (
                    t('reads.search', { search: read.search })
                  ) : (
                    t('reads.list')
                  )}
                </span>
                <span className="text-sm text-muted-foreground">
                  <span className="tabular-nums">{format.dateTime(read.readAt)}</span>
                  {read.adminEmail && (
                    <>
                      {' · '}
                      <span dir="ltr">{read.adminEmail}</span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function EarlierGrants({ grants }: { readonly grants: readonly SupportGrant[] }) {
  const { t } = useTranslation('support');
  const format = useFormat();
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('earlier.title')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {grants.map((grant) => (
            <li key={grant.id} className="flex flex-col gap-0.5 py-2">
              <span>{grant.reason}</span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {t('earlier.period', {
                  from: format.dateTime(grant.startsAt),
                  to: format.dateTime(grant.revokedAt ?? grant.endsAt),
                })}
                {grant.revokedAt && ` · ${t('earlier.endedEarly')}`}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
