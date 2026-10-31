import { Link } from '@tanstack/react-router';
import {
  BanknoteIcon,
  BathIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  ChartColumnIcon,
  DumbbellIcon,
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
import { useActiveAccount } from '@/features/auth/auth-context';
import { usePermission, usePermissions } from '@/features/auth/use-permissions';
import type { AppPath } from '@/app/navigation';
import { useFormat } from '@/lib/format';
import { trendPercent, useDashboard, useDashboardTrends } from './dashboard-data';
import { HourlyChart } from './hourly-chart';
import { ClockTile, Meter, Sparkline, StatCard, StatRow, TrendChip } from './widgets';
import { useCountUp } from './use-count-up';

/**
 * The home page and dashboard (CLAUDE.md → Design: bento tiles; step 10a, redrawn in step D-4 after
 * the user's reference screens): today's numbers in every branch the staff member reaches as pastel
 * cards in their section tones, with yesterday's comparison and the last 7 days, today's spa,
 * training and classes, check-ins per hour and the clock; each part only with its permission.
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
        actions={
          <div className="hidden md:block">
            <ClockTile />
          </div>
        }
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
  const trends = useDashboardTrends(true).data;
  const data = summary.data;
  const pending = summary.isPending;
  const checkins = useCountUp(data?.checkinsToday ?? null);
  const takings = useCountUp(data?.takingsToday ?? null);
  const active = useCountUp(data?.activeMembers ?? null);
  const ending = useCountUp(data?.endingThisWeek ?? null);
  const number = (value: number | null) =>
    value === null ? null : format.number(Math.round(value));
  const money = (value: number | null) => (value === null ? null : format.money(Math.round(value)));
  const days = format.number(7);
  const places =
    trends?.classPlaces == null
      ? ''
      : t('stats.classes.places', {
          taken: format.number(trends.classTaken ?? 0),
          places: format.number(trends.classPlaces),
        });

  return (
    <section aria-label={t('stats.label')} className="@container flex flex-col gap-3 md:gap-4">
      <div className="grid grid-cols-1 gap-3 md:gap-4 @md:grid-cols-2 @4xl:grid-cols-4">
        <StatCard
          icon={NfcIcon}
          tone="blue"
          label={t('stats.checkinsToday')}
          value={number(checkins)}
          note={
            data?.insideNow == null ? undefined : (
              <span className="inline-flex items-center gap-1.5">
                <LiveDot />
                {t('stats.insideNow', { count: format.number(data.insideNow) })}
              </span>
            )
          }
          trend={
            <TrendChip
              percent={trendPercent(data?.checkinsToday ?? null, trends?.checkinsYesterday ?? null)}
            />
          }
          footer={
            trends?.checkinsWeek && (
              <Sparkline
                tone="blue"
                values={trends.checkinsWeek}
                label={t('stats.week.checkins', { days })}
                formatValue={(value) => format.number(value)}
              />
            )
          }
          to="/checkin/visits"
          pending={pending}
          testId="stat-checkins"
        />
        <StatCard
          icon={BanknoteIcon}
          tone="indigo"
          label={t('stats.revenueToday')}
          value={money(takings)}
          note={
            data?.owedNow == null
              ? undefined
              : t('stats.owedNow', { amount: format.money(data.owedNow) })
          }
          trend={
            <TrendChip
              percent={trendPercent(data?.takingsToday ?? null, trends?.takingsYesterday ?? null)}
            />
          }
          footer={
            trends?.takingsWeek && (
              <Sparkline
                tone="indigo"
                values={trends.takingsWeek}
                label={t('stats.week.takings', { days })}
                formatValue={(value) => format.money(value)}
              />
            )
          }
          to="/payments"
          pending={pending}
          testId="stat-takings"
        />
        <StatCard
          icon={UsersIcon}
          tone="violet"
          label={t('stats.activeMembers')}
          value={number(active)}
          note={
            data?.newThisMonth == null
              ? undefined
              : t('stats.newThisMonth', { count: format.number(data.newThisMonth) })
          }
          to="/members"
          pending={pending}
          testId="stat-active-members"
        />
        <StatCard
          icon={CalendarClockIcon}
          tone="pink"
          label={t('stats.expiring')}
          value={number(ending)}
          to="/members"
          pending={pending}
          testId="stat-ending"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
        {data?.spaToday != null && (
          <StatRow
            icon={BathIcon}
            tone="cyan"
            label={t('stats.spaToday')}
            value={format.number(data.spaToday)}
            to="/spa"
            testId="stat-spa"
          />
        )}
        {trends?.ptToday != null && (
          <StatRow
            icon={DumbbellIcon}
            tone="violet"
            label={t('stats.ptToday')}
            value={format.number(trends.ptToday)}
            to="/trainers"
            testId="stat-pt"
          />
        )}
        {trends?.classesToday != null && (
          <StatRow
            icon={CalendarDaysIcon}
            tone="indigo"
            label={t('stats.classes.title')}
            value={format.number(trends.classesToday)}
            note={trends.classesToday === 0 ? t('stats.classes.none') : places}
            footer={
              trends.classesToday > 0 && (
                <span className="flex flex-col gap-1.5">
                  <Meter
                    tone="indigo"
                    value={trends.classTaken ?? 0}
                    max={trends.classPlaces ?? 0}
                    label={places}
                  />
                  {(trends.classesNow ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <LiveDot />
                      {t('stats.classes.now', { count: format.number(trends.classesNow ?? 0) })}
                    </span>
                  )}
                </span>
              )
            }
            to="/classes"
            testId="stat-classes"
          />
        )}
      </div>

      {data?.hourly && (
        <div className="flex flex-col gap-2 rounded-card bg-card p-4 shadow-sm ring-1 ring-foreground/6 md:p-5 dark:ring-foreground/7">
          <h2 className="flex items-center gap-2 text-lg">
            <ChartColumnIcon aria-hidden className="size-5 text-primary" />
            {t('chart.title')}
          </h2>
          <HourlyChart hourly={data.hourly} />
        </div>
      )}
    </section>
  );
}

/** Something happening now (people inside, a class running): a softly pulsing dot. */
function LiveDot() {
  return (
    <span aria-hidden className="relative flex size-2.5">
      <span className="absolute inline-flex size-full rounded-full bg-success opacity-60 motion-safe:animate-ping" />
      <span className="relative inline-flex size-2.5 rounded-full bg-success" />
    </span>
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
