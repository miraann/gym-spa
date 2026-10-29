import { Link } from '@tanstack/react-router';
import {
  BanknoteIcon,
  BathIcon,
  CalendarClockIcon,
  NfcIcon,
  PaletteIcon,
  UserCogIcon,
  UserPlusIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ListGroup, ListRow, ListRowIcon } from '@gym/ui/blocks/list-group';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { Skeleton } from '@gym/ui/components/skeleton';
import { STRONG_BRAND_TOKENS } from '@/components/brand-surface';
import { useActiveAccount } from '@/features/auth/auth-context';
import { usePermission, usePermissions } from '@/features/auth/use-permissions';
import type { AppPath } from '@/app/navigation';
import { useFormat } from '@/lib/format';
import { useDashboard } from './dashboard-data';
import { HourlyChart } from './hourly-chart';

/**
 * The home page and dashboard (CLAUDE.md → Design: bento tiles; step 10a): today's numbers in every
 * branch the staff member reaches, each tile only with its permission, and check-ins per hour.
 */
export function HomePage() {
  const { t } = useTranslation('home');
  const format = useFormat();
  const account = useActiveAccount();
  const canSeeDashboard = usePermission('dashboard.view');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('today', { date: format.date(new Date(), 'full') })}
      />

      {account && (
        <div className="-mt-2 flex flex-col gap-0.5">
          <p className="text-xl font-bold">{t('welcome', { name: account.fullName })}</p>
          <p className="text-muted-foreground">{t('welcomeHint')}</p>
        </div>
      )}

      {canSeeDashboard && <Dashboard />}

      <QuickActions />
    </div>
  );
}

function Dashboard() {
  const { t } = useTranslation('home');
  const format = useFormat();
  const summary = useDashboard(true);
  const data = summary.data;
  const pending = summary.isPending;
  const number = (value: number | null | undefined) =>
    value === null || value === undefined ? null : format.number(value);
  const money = (value: number | null | undefined) =>
    value === null || value === undefined ? null : format.money(value);

  return (
    <section aria-label={t('stats.label')} className="@container">
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4 @2xl:gap-4">
        {(pending || (data?.activeMembers ?? null) !== null) && (
          <ActiveMembersTile
            active={data?.activeMembers ?? null}
            newThisMonth={data?.newThisMonth ?? null}
          />
        )}
        <StatTile
          icon={NfcIcon}
          label={t('stats.checkinsToday')}
          value={number(data?.checkinsToday)}
          note={
            data?.insideNow == null
              ? undefined
              : t('stats.insideNow', { count: format.number(data.insideNow) })
          }
          to="/checkin/visits"
          pending={pending}
          testId="stat-checkins"
        />
        <StatTile
          icon={CalendarClockIcon}
          label={t('stats.expiring')}
          value={number(data?.endingThisWeek)}
          to="/members"
          pending={pending}
          testId="stat-ending"
        />
        <StatTile
          icon={BanknoteIcon}
          label={t('stats.revenueToday')}
          value={money(data?.takingsToday)}
          note={
            data?.owedNow == null
              ? undefined
              : t('stats.owedNow', { amount: format.money(data.owedNow) })
          }
          to="/payments"
          pending={pending}
          testId="stat-takings"
        />
        <StatTile
          icon={BathIcon}
          label={t('stats.spaToday')}
          value={number(data?.spaToday)}
          to="/spa"
          pending={pending}
          testId="stat-spa"
        />
        {data?.hourly && (
          <div className="col-span-2 flex flex-col gap-2 rounded-card bg-card p-4 shadow-sm ring-1 ring-foreground/6 md:p-5 @2xl:col-span-4">
            <h2 className="text-sm font-semibold">{t('chart.title')}</h2>
            <HourlyChart hourly={data.hourly} />
          </div>
        )}
      </div>
    </section>
  );
}

/** Active members, with the ones registered this month: the large brand tile. */
function ActiveMembersTile({
  active,
  newThisMonth,
}: {
  readonly active: number | null;
  readonly newThisMonth: number | null;
}) {
  const { t } = useTranslation('home');
  const format = useFormat();

  return (
    <Link
      to="/members"
      data-testid="stat-active-members"
      style={STRONG_BRAND_TOKENS}
      className="group/tile relative col-span-2 flex min-h-40 flex-col justify-between gap-4 overflow-hidden rounded-card bg-primary p-5 text-primary-foreground shadow-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-safe:transition-transform motion-safe:active:scale-[0.99] @2xl:row-span-2 @2xl:min-h-0"
    >
      {/* A soft light from the top corner gives the brand color depth. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-e-16 -top-20 size-64 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--primary-foreground)_22%,transparent),transparent)]"
      />
      <span className="flex items-center gap-2 font-semibold opacity-90">
        <UsersIcon aria-hidden className="size-5" />
        {t('stats.activeMembers')}
      </span>
      <span className="flex flex-col gap-1">
        {active === null ? (
          <Skeleton className="h-12 w-24 bg-primary-foreground/20" />
        ) : (
          <span className="text-5xl leading-none font-extrabold tabular-nums @2xl:text-6xl">
            {format.number(active)}
          </span>
        )}
        {newThisMonth === null ? (
          <Skeleton className="h-4 w-36 bg-primary-foreground/15" />
        ) : (
          <span className="text-sm opacity-85">
            {t('stats.newThisMonth', { count: format.number(newThisMonth) })}
          </span>
        )}
      </span>
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-primary-foreground/15 px-3 py-1 text-sm font-semibold">
        {t('stats.viewMembers')}
      </span>
    </Link>
  );
}

/** One of today's numbers; left out when the staff member may not see it. */
function StatTile({
  icon: Icon,
  label,
  value,
  note,
  to,
  pending,
  testId,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly value: string | null;
  readonly note?: string;
  readonly to: AppPath;
  readonly pending: boolean;
  readonly testId: string;
}) {
  if (!pending && value === null) return null;
  return (
    <Link
      to={to}
      data-testid={testId}
      className="flex min-h-36 flex-col justify-between gap-3 rounded-card bg-card p-4 shadow-sm ring-1 ring-foreground/6 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:p-5"
    >
      <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon aria-hidden className="size-5" />
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-sm leading-snug font-semibold">{label}</span>
        {value === null ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <span className="text-3xl leading-none font-extrabold tabular-nums" data-value>
            {value}
          </span>
        )}
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </span>
    </Link>
  );
}

/** Shortcuts to what the staff member may do most often (only what they may open). */
function QuickActions() {
  const { t } = useTranslation('home');
  const permissions = usePermissions();
  const actions = QUICK_ACTIONS.filter((action) => permissions.has(action.permission));
  if (actions.length === 0) return null;

  return (
    <ListGroup title={t('quick.title')}>
      {actions.map(({ key, icon: Icon, to }) => (
        <ListRow
          key={key}
          asChild
          title={t(`quick.${key}`)}
          description={t(`quick.${key}Hint`)}
          leading={
            <ListRowIcon>
              <Icon aria-hidden />
            </ListRowIcon>
          }
        >
          <Link to={to} />
        </ListRow>
      ))}
    </ListGroup>
  );
}

const QUICK_ACTIONS = [
  { key: 'newMember', icon: UserPlusIcon, to: '/members/new', permission: 'members.create' },
  { key: 'members', icon: UsersIcon, to: '/members', permission: 'members.view' },
  { key: 'staff', icon: UserCogIcon, to: '/staff', permission: 'staff.view' },
  { key: 'appearance', icon: PaletteIcon, to: '/settings/appearance', permission: 'settings.edit' },
] as const satisfies readonly {
  key: string;
  icon: LucideIcon;
  to: AppPath;
  permission: string;
}[];
