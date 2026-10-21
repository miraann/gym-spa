import { Link } from '@tanstack/react-router';
import {
  BanknoteIcon,
  CalendarClockIcon,
  ClockIcon,
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
import { cn } from '@gym/ui/lib/utils';
import { STRONG_BRAND_TOKENS } from '@/components/brand-surface';
import { useActiveAccount } from '@/features/auth/auth-context';
import { usePermission, usePermissions } from '@/features/auth/use-permissions';
import type { AppPath } from '@/app/navigation';
import { useMemberCounts } from '@/features/members/member-data';
import { useFormat } from '@/lib/format';
import { useBaghdadToday } from '@/lib/use-today';

/**
 * The dashboard (CLAUDE.md → Design: bento tiles). Member numbers are real; check-ins,
 * subscriptions and revenue get their numbers when their phases are built (4, 3 and 3), and until
 * then say which section brings them.
 */
export function HomePage() {
  const { t } = useTranslation('home');
  const format = useFormat();
  const account = useActiveAccount();
  const canSeeMembers = usePermission('members.view');

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

      <section aria-label={t('stats.label')} className="@container">
        <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4 @2xl:gap-4">
          {canSeeMembers && <ActiveMembersTile />}
          <ComingTile
            icon={NfcIcon}
            label={t('stats.checkinsToday')}
            comesWith={t('stats.comesWithCheckin')}
          />
          <ComingTile
            icon={CalendarClockIcon}
            label={t('stats.expiring')}
            comesWith={t('stats.comesWithSubscriptions')}
          />
          <ComingTile
            icon={BanknoteIcon}
            label={t('stats.revenueToday')}
            comesWith={t('stats.comesWithPayments')}
            className="col-span-2"
          />
        </div>
      </section>

      <QuickActions />
    </div>
  );
}

/** Active members, with the ones registered this month: the one tile with real numbers today. */
function ActiveMembersTile() {
  const { t } = useTranslation('home');
  const format = useFormat();
  const today = useBaghdadToday();
  // Baghdad has no daylight saving time: always UTC+3.
  const counts = useMemberCounts(new Date(`${today.slice(0, 8)}01T00:00:00+03:00`));

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
        {counts.data ? (
          <span className="text-5xl leading-none font-extrabold tabular-nums @2xl:text-6xl">
            {format.number(counts.data.active)}
          </span>
        ) : (
          <Skeleton className="h-12 w-24 bg-primary-foreground/20" />
        )}
        {counts.data ? (
          <span className="text-sm opacity-85">
            {t('stats.newThisMonth', { count: format.number(counts.data.newSince) })}
          </span>
        ) : (
          <Skeleton className="h-4 w-36 bg-primary-foreground/15" />
        )}
      </span>
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-primary-foreground/15 px-3 py-1 text-sm font-semibold">
        {t('stats.viewMembers')}
      </span>
    </Link>
  );
}

/** A number that comes with a later section: the tile says which one, instead of a fake zero. */
function ComingTile({
  icon: Icon,
  label,
  comesWith,
  className,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly comesWith: string;
  readonly className?: string;
}) {
  const { t } = useTranslation('home');
  return (
    <div
      data-slot="coming-tile"
      className={cn(
        'flex min-h-36 flex-col justify-between gap-3 rounded-card bg-card p-4 shadow-sm ring-1 ring-foreground/6 md:p-5',
        className,
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon aria-hidden className="size-5" />
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-sm leading-snug font-semibold">{label}</span>
        <span
          aria-label={t('stats.noNumberYet')}
          className="text-3xl leading-none font-extrabold text-muted-foreground/50"
        >
          —
        </span>
      </span>
      <span className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <ClockIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {comesWith}
      </span>
    </div>
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
