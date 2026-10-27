import { formatCardUid, formatMemberNumber } from '@gym/core';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Field, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, EyeIcon, ShieldCheckIcon, ShieldOffIcon } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { panelErrorKey } from '@/lib/errors';
import { useFormat } from '@/lib/format';
import { FormError } from '@/shell/form-error';
import {
  useSupportGyms,
  useSupportMember,
  useSupportMembers,
  useSupportReads,
  type SupportMember,
} from './support-api';

// Support access in the seller panel (MT-4c): which gyms let Click Group in, and their members,
// read only through the audited seller_support_* functions.

/** A label the panel has for a value, or the value itself (a new status the panel doesn't know). */
function useLabel() {
  const { t, i18n } = useTranslation('seller');
  return (group: string, value: string): string => {
    const key = `support.${group}.${value}`;
    return i18n.exists(key, { ns: 'seller' }) ? t(key as 'support.title') : value;
  };
}

function BackLink({
  to,
  params,
  children,
}: {
  readonly to: '/gyms/$gymId' | '/gyms/$gymId/support';
  readonly params: { gymId: string };
  readonly children: ReactNode;
}) {
  return (
    <Link
      to={to}
      params={params}
      className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowRightIcon className="size-4 ltr:rotate-180" aria-hidden="true" />
      {children}
    </Link>
  );
}

/** On a gym's page: whether it lets Click Group in now, and the way to its members. */
export function SupportCard({
  gymId,
  online,
}: {
  readonly gymId: string;
  readonly online: boolean;
}) {
  const { t } = useTranslation('seller');
  const format = useFormat();
  const gyms = useSupportGyms();
  const grant = gyms.data?.find((each) => each.gym_id === gymId);

  return (
    <Card data-testid="support-card">
      <CardHeader>
        <CardTitle>{t('support.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!online ? (
          <p className="text-muted-foreground">{t('support.offline')}</p>
        ) : gyms.isPending ? (
          <Skeleton className="h-12 w-full" />
        ) : gyms.isError ? (
          <FormError error={panelErrorKey(gyms.error)} />
        ) : grant ? (
          <>
            <p className="flex items-center gap-2">
              <ShieldCheckIcon aria-hidden="true" className="size-5 shrink-0 text-primary" />
              {t('support.granted', { date: format.dateTime(grant.ends_at) })}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('support.reason', { reason: grant.reason })}
            </p>
            <Button asChild className="self-start">
              <Link to="/gyms/$gymId/support" params={{ gymId }}>
                <EyeIcon data-icon="inline-start" />
                {t('support.open')}
              </Link>
            </Button>
          </>
        ) : (
          <p className="flex items-center gap-2 text-muted-foreground">
            <ShieldOffIcon aria-hidden="true" className="size-5 shrink-0" />
            {t('support.notGranted')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** /gyms/$gymId/support: search the gym's members (each search is recorded for the gym). */
export function SupportMembersPage({ gymId }: { readonly gymId: string }) {
  const { t } = useTranslation('seller');
  const label = useLabel();
  const id = useId();
  const [typed, setTyped] = useState('');
  // Nothing is read until a search is sent: each read is recorded.
  const [search, setSearch] = useState<string | null>(null);
  const members = useSupportMembers(gymId, search);

  return (
    <div className="flex flex-col gap-4">
      <BackLink to="/gyms/$gymId" params={{ gymId }}>
        {t('support.back')}
      </BackLink>
      <h1 className="text-2xl">{t('support.title')}</h1>
      <Alert>
        <EyeIcon />
        <AlertDescription>{t('support.recorded')}</AlertDescription>
      </Alert>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(typed.trim());
        }}
      >
        <Field className="min-w-60 flex-1">
          <FieldLabel htmlFor={`${id}-search`}>{t('support.search')}</FieldLabel>
          <Input
            id={`${id}-search`}
            type="search"
            autoComplete="off"
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
            }}
          />
        </Field>
        <Button type="submit">
          {typed.trim() === '' ? t('support.all') : t('support.searchButton')}
        </Button>
      </form>
      {search !== null &&
        (members.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : members.isError ? (
          <FormError error={panelErrorKey(members.error)} />
        ) : members.data.length === 0 ? (
          <p className="text-muted-foreground">{t('support.noMembers')}</p>
        ) : (
          <>
            <ul
              className="flex flex-col divide-y rounded-2xl border bg-card"
              data-testid="support-members"
            >
              {members.data.map((member) => (
                <li key={member.id}>
                  <Link
                    to="/gyms/$gymId/support/$memberId"
                    params={{ gymId, memberId: member.id }}
                    className="flex flex-col gap-0.5 p-3 hover:bg-muted"
                  >
                    <span>{member.full_name}</span>
                    <span className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
                      <span dir="ltr" className="tabular-nums">
                        {formatMemberNumber(member.member_number)}
                      </span>
                      {member.phone && (
                        <span dir="ltr" className="tabular-nums">
                          {member.phone}
                        </span>
                      )}
                      <span>{member.branch_code}</span>
                      <span>{label('memberStatus', member.status)}</span>
                      <span>{label('memberships', member.membership)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {members.data.length >= 50 && (
              <p className="text-sm text-muted-foreground">{t('support.limit')}</p>
            )}
          </>
        ))}
      <SupportReads gymId={gymId} />
    </div>
  );
}

/** What was read in this gym (the same list the gym sees). */
function SupportReads({ gymId }: { readonly gymId: string }) {
  const { t } = useTranslation('seller');
  const format = useFormat();
  const reads = useSupportReads(gymId);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg">{t('support.reads')}</h2>
      {reads.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : reads.isError ? (
        <FormError error={panelErrorKey(reads.error)} />
      ) : reads.data.length === 0 ? (
        <p className="text-muted-foreground">{t('support.readsNone')}</p>
      ) : (
        <ul className="flex flex-col divide-y" data-testid="support-reads">
          {reads.data.map((read) => {
            const search =
              typeof read.details === 'object' && read.details !== null && 'search' in read.details
                ? read.details.search
                : null;
            return (
              <li
                key={`${read.read_at}-${read.what}-${read.member_id ?? ''}`}
                className="flex flex-col py-2"
              >
                <span>
                  {read.what === 'member'
                    ? t('support.readMember')
                    : typeof search === 'string' && search !== ''
                      ? t('support.readSearch', { search })
                      : t('support.readMembers')}
                </span>
                <span className="text-sm text-muted-foreground">
                  <span className="tabular-nums">{format.dateTime(read.read_at)}</span>
                  {' · '}
                  <span dir="ltr">{read.admin_email}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Rows({
  items,
}: {
  readonly items: readonly { key: string; main: ReactNode; sub: ReactNode }[];
}) {
  const { t } = useTranslation('seller');
  if (items.length === 0) return <p className="text-muted-foreground">{t('support.none')}</p>;
  return (
    <ul className="flex flex-col divide-y">
      {items.map((item) => (
        <li key={item.key} className="flex flex-col gap-0.5 py-2">
          <span>{item.main}</span>
          <span className="text-sm text-muted-foreground">{item.sub}</span>
        </li>
      ))}
    </ul>
  );
}

/** /gyms/$gymId/support/$memberId: one member, read once (recorded for the gym). */
export function SupportMemberPage({
  gymId,
  memberId,
}: {
  readonly gymId: string;
  readonly memberId: string;
}) {
  const { t } = useTranslation('seller');
  const member = useSupportMember(gymId, memberId);
  return (
    <div className="flex flex-col gap-4">
      <BackLink to="/gyms/$gymId/support" params={{ gymId }}>
        {t('support.backToMembers')}
      </BackLink>
      {member.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : member.isError ? (
        <FormError error={panelErrorKey(member.error)} />
      ) : (
        <MemberDetails data={member.data} />
      )}
    </div>
  );
}

function MemberDetails({ data }: { readonly data: SupportMember }) {
  const { t } = useTranslation('seller');
  const format = useFormat();
  const label = useLabel();
  const { member } = data;
  const voided = (at: string | null) => (at ? ` · ${t('support.voided')}` : '');

  return (
    <>
      <h1 className="text-2xl" data-testid="support-member-name">
        {member.full_name}
      </h1>
      <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-card p-4 md:grid-cols-4">
        <div>
          <dt className="text-sm text-muted-foreground">{t('support.number')}</dt>
          <dd dir="ltr" className="text-start tabular-nums">
            {formatMemberNumber(member.member_number)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{t('support.phone')}</dt>
          <dd dir="ltr" className="text-start tabular-nums">
            {member.phone ?? '–'}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{t('support.status')}</dt>
          <dd>{label('memberStatus', member.status)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{t('support.membership')}</dt>
          <dd>{label('memberships', member.membership)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{t('support.branch')}</dt>
          <dd>{member.branch_code ?? '–'}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{t('support.joined')}</dt>
          <dd className="tabular-nums">{format.date(member.created_at)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{t('support.birthDate')}</dt>
          <dd className="tabular-nums">
            {member.birth_date ? format.date(member.birth_date) : '–'}
          </dd>
        </div>
      </dl>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('support.subscriptions')}>
          <Rows
            items={data.subscriptions.map((each) => ({
              key: each.id,
              main: `${each.name_ckb} · ${label('subscriptionStatus', each.status)}`,
              sub: [
                t('support.period', {
                  from: format.date(each.start_date),
                  to: each.end_date ? format.date(each.end_date) : t('support.noEnd'),
                }),
                each.visit_count !== null
                  ? t('support.visitsUsed', {
                      used: each.used_visits ?? 0,
                      count: each.visit_count,
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(' · '),
            }))}
          />
        </Section>
        <Section title={t('support.invoices')}>
          <Rows
            items={data.invoices.map((each) => ({
              key: each.id,
              main: (
                <span dir="ltr" className="tabular-nums">
                  {each.number}
                </span>
              ),
              sub:
                t('support.invoiceLine', {
                  total: format.money(each.total),
                  paid: format.money(each.paid),
                  due: format.money(each.due),
                }) + voided(each.voided_at),
            }))}
          />
        </Section>
        <Section title={t('support.payments')}>
          <Rows
            items={data.payments.map((each) => ({
              key: each.id,
              main: `${format.money(each.amount)} · ${label('methods', each.method)}${
                each.kind === 'refund' ? ` · ${t('support.refund')}` : ''
              }`,
              sub: `${each.number} · ${format.dateTime(each.created_at)}${voided(each.voided_at)}`,
            }))}
          />
        </Section>
        <Section title={t('support.cards')}>
          <Rows
            items={data.cards.map((each) => ({
              key: each.id,
              main: (
                <span dir="ltr" className="tabular-nums">
                  {formatCardUid(each.uid)}
                </span>
              ),
              sub: `${label('cardStatus', each.status)} · ${format.date(each.created_at)}`,
            }))}
          />
        </Section>
        <Section title={t('support.visits')}>
          <Rows
            items={data.visits.map((each) => ({
              key: each.id,
              main: format.dateTime(each.checked_in_at),
              sub:
                [each.branch_code, label('visitMethods', each.method)].filter(Boolean).join(' · ') +
                voided(each.voided_at),
            }))}
          />
        </Section>
      </div>
    </>
  );
}
