import { nameIn } from '@gym/core';
import { localizedName } from '@gym/i18n';
import { Button } from '@gym/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@gym/ui/components/popover';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@gym/ui/components/sheet';
import { useLayout } from '@gym/ui/hooks/use-layout';
import { cn } from '@gym/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import {
  BellIcon,
  CheckCheckIcon,
  MessageCircleMoreIcon,
  PackageIcon,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermission } from '@/features/auth/use-permissions';
import { useAdminBranches } from '@/features/staff/admin-data';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { useBaghdadToday } from '@/lib/use-today';
import {
  BELL_DAYS,
  badgeCount,
  groupBell,
  relativeTime,
  shiftDay,
  unreadRows,
  type BellDay,
  type BellKind,
  type BellRow,
} from './bell-groups';
import {
  useBellRemindersLeft,
  useMarkNotificationsRead,
  useStaffNotifications,
} from './notification-data';
import { useHasBell } from './use-has-bell';

/** Each kind's look: its icon on a tile of its own color (low stock is a warning). */
const KINDS: Readonly<Record<BellKind, { icon: LucideIcon; tile: string }>> = {
  reminders_ready: { icon: MessageCircleMoreIcon, tile: 'bg-tone-blue text-tone-foreground' },
  low_stock: { icon: PackageIcon, tile: 'bg-warning text-warning-foreground' },
};

/**
 * The bell in the top bar (step D-4g, the user's design of 2026-10-30): the last 7 days of
 * notifications for the staff member's branches and permissions, one row per kind and day with
 * the branches merged, grouped under today, yesterday and the dates. A popover on wider screens,
 * a bottom sheet on phones. Opening it marks everything read (tapping a row does too); what was
 * new stays tinted, with a dot, until it closes. The badge counts the rows not read.
 */
export function NotificationBell({ compact }: { readonly compact: boolean }) {
  const { t } = useTranslation('notifications');
  const format = useFormat();
  const hasBell = useHasBell();
  const phone = useLayout() === 'phone';
  const today = useBaghdadToday();
  const notifications = useStaffNotifications(hasBell);
  const markRead = useMarkNotificationsRead();
  const [open, setOpen] = useState(false);
  const [newOnOpen, setNewOnOpen] = useState<ReadonlySet<string>>(new Set());
  if (!hasBell) return null;

  const days = groupBell(notifications.data ?? [], shiftDay(today, -(BELL_DAYS - 1)));
  const unread = unreadRows(days);
  const badge = badgeCount(unread);
  const label =
    unread > 0
      ? `${t('bell.label')} · ${t('bell.unread', { total: format.number(unread) })}`
      : t('bell.label');

  const markRows = (rows: readonly BellRow[]) => {
    const ids = rows.filter((row) => row.unread).flatMap((row) => row.ids);
    // A failure (a read-only gym) leaves them unread; the bell tries again next time.
    if (ids.length > 0) markRead.mutate(ids);
  };
  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    const rows = days.flatMap((day) => day.rows).filter((row) => row.unread);
    setNewOnOpen(new Set(rows.map((row) => row.key)));
    markRows(rows);
  };

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      className={cn(
        'relative shrink-0 rounded-full',
        compact && '[&_svg:not([class*=size-])]:size-5',
      )}
      data-testid="notification-bell"
    >
      <BellIcon />
      {unread > 0 && (
        <span
          aria-hidden
          data-slot="bell-badge"
          className="absolute -end-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs text-primary-foreground tabular-nums ring-2 ring-background"
        >
          {format.number(badge.value)}
          {badge.more && '+'}
        </span>
      )}
    </Button>
  );
  const panel = (title: ReactNode, inSheet: boolean) => (
    <BellPanel
      title={title}
      inSheet={inSheet}
      days={days}
      today={today}
      newOnOpen={newOnOpen}
      onMarkAll={() => {
        markRows(days.flatMap((day) => day.rows));
        setNewOnOpen(new Set());
      }}
      onOpenRow={(row) => {
        markRows([row]);
        setOpen(false);
      }}
      onSeeAll={() => {
        setOpen(false);
      }}
    />
  );

  if (phone) {
    return (
      <Sheet open={open} onOpenChange={changeOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          aria-describedby={undefined}
          className="max-h-[85svh] gap-0 rounded-t-3xl p-0"
          data-testid="bell-panel"
        >
          {panel(<SheetTitle className="text-lg">{t('bell.label')}</SheetTitle>, true)}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={t('bell.label')}
        className="w-[min(23.75rem,calc(100vw-2rem))] overflow-hidden p-0"
        data-testid="bell-panel"
      >
        {panel(<h2 className="text-lg">{t('bell.label')}</h2>, false)}
      </PopoverContent>
    </Popover>
  );
}

function BellPanel({
  title,
  inSheet,
  days,
  today,
  newOnOpen,
  onMarkAll,
  onOpenRow,
  onSeeAll,
}: {
  readonly title: ReactNode;
  /** In the phone's bottom sheet: room for its grabber and close button. */
  readonly inSheet: boolean;
  readonly days: readonly BellDay[];
  readonly today: string;
  readonly newOnOpen: ReadonlySet<string>;
  readonly onMarkAll: () => void;
  readonly onOpenRow: (row: BellRow) => void;
  readonly onSeeAll: () => void;
}) {
  const { t } = useTranslation('notifications');
  const format = useFormat();
  const mayRemind = usePermission('notifications.send');
  const left = useBellRemindersLeft(mayRemind);
  const yesterday = shiftDay(today, -1);
  // "Now" for the times beside the rows: when the panel opened (it is made afresh each time).
  const [openedAt] = useState(() => Date.now());
  const anyNew = newOnOpen.size > 0 || days.some((day) => day.rows.some((row) => row.unread));

  return (
    <div className="flex max-h-[min(36rem,80svh)] flex-col">
      <div
        className={cn(
          'flex items-center justify-between gap-2 border-b px-4 py-3',
          inSheet && 'pe-16 pt-6',
        )}
      >
        {title}
        <Button
          variant="ghost"
          size="sm"
          disabled={!anyNew}
          onClick={onMarkAll}
          className="h-auto min-h-8 max-w-[62%] shrink py-1 leading-tight whitespace-normal text-primary"
        >
          <CheckCheckIcon data-icon="inline-start" />
          {t('bell.markAll')}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
        {days.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-accent text-primary">
              <BellIcon aria-hidden className="size-8" />
            </span>
            <p className="text-muted-foreground">{t('bell.empty')}</p>
          </div>
        ) : (
          days.map((day) => (
            <section key={day.day} aria-labelledby={`bell-day-${day.day}`}>
              <h3
                id={`bell-day-${day.day}`}
                className="sticky top-0 z-10 bg-popover px-2 pt-3 pb-1.5 text-sm text-muted-foreground"
              >
                {day.day === today
                  ? t('bell.today')
                  : day.day === yesterday
                    ? t('bell.yesterday')
                    : format.date(day.day, 'full')}
              </h3>
              <ul className="flex flex-col gap-1">
                {day.rows.map((row) => (
                  <li key={row.key}>
                    <BellRowLink
                      row={row}
                      isNew={newOnOpen.has(row.key) || row.unread}
                      today={today}
                      yesterday={yesterday}
                      now={openedAt}
                      left={row.kind === 'reminders_ready' ? left.data?.get(row.day) : undefined}
                      onOpen={() => {
                        onOpenRow(row);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      {mayRemind && (
        <div className="border-t p-2">
          <Button asChild variant="ghost" className="w-full text-primary">
            <Link to="/notifications" search={{}} onClick={onSeeAll}>
              {t('bell.seeAll')}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function BellRowLink({
  row,
  isNew,
  today,
  yesterday,
  now,
  left,
  onOpen,
}: {
  readonly row: BellRow;
  readonly isNew: boolean;
  readonly today: string;
  readonly yesterday: string;
  readonly now: number;
  /** Reminders of the day not done yet; undefined while unknown. */
  readonly left: number | undefined;
  readonly onOpen: () => void;
}) {
  const { t } = useTranslation('notifications');
  const format = useFormat();
  const { language } = usePreferences();
  const branches = useAdminBranches().data ?? [];
  const several = branches.filter((branch) => branch.isActive).length > 1;
  const kind = KINDS[row.kind];
  const Icon = kind.icon;
  const count = format.number(row.total);
  const title =
    row.kind === 'reminders_ready'
      ? t(row.total === 1 ? 'bell.remindersOne' : 'bell.remindersMany', { count })
      : t(row.total === 1 ? 'bell.lowOne' : 'bell.lowMany', { count });
  const detail =
    row.kind === 'low_stock'
      ? row.products.map((product) => nameIn(product, language)).join('، ')
      : left === undefined
        ? null
        : left === 0
          ? t('bell.allDone')
          : t(left === 1 ? 'bell.leftOne' : 'bell.leftMany', { count: format.number(left) });
  const branchLine = several
    ? row.branches
        .map(({ branchId, count: amount }) => {
          const branch = branches.find((each) => each.id === branchId);
          return t('bell.branchCount', {
            branch: branch ? localizedName(branch, language) : '',
            count: format.number(amount),
          });
        })
        .join(' · ')
    : null;
  const when = relativeTime(row.createdAt, row.day, today, yesterday, now);
  const time =
    when.kind === 'now'
      ? t('bell.now')
      : when.kind === 'minutes'
        ? t('bell.minutesAgo', { count: format.number(when.count) })
        : when.kind === 'hours'
          ? t('bell.hoursAgo', { count: format.number(when.count) })
          : when.kind === 'yesterday'
            ? t('bell.yesterday')
            : format.time(row.createdAt);
  const className = cn(
    'flex items-start gap-3 rounded-xl px-2.5 py-2.5 transition-colors duration-150 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
    isNew && 'bg-accent/60 hover:bg-accent',
  );
  const content = (
    <>
      <span
        className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', kind.tile)}
      >
        <Icon aria-hidden className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate leading-snug">{title}</span>
        {detail && <span className="truncate text-sm text-muted-foreground">{detail}</span>}
        {branchLine && (
          <span className="truncate text-xs text-muted-foreground" data-slot="bell-branches">
            {branchLine}
          </span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
        <span className="text-xs whitespace-nowrap text-muted-foreground">{time}</span>
        {isNew && (
          <>
            <span aria-hidden className="size-2 rounded-full bg-primary" />
            <span className="sr-only">{t('bell.unreadRow')}</span>
          </>
        )}
      </span>
    </>
  );

  if (row.kind === 'reminders_ready') {
    return (
      <Link
        to="/notifications"
        search={row.day === today ? {} : { day: row.day }}
        onClick={onOpen}
        className={className}
        data-notification={row.kind}
        data-new={isNew || undefined}
      >
        {content}
      </Link>
    );
  }
  const onlyBranch = several && row.branches.length === 1 ? row.branches[0]?.branchId : undefined;
  return (
    <Link
      to="/shop/stock"
      search={onlyBranch === undefined ? { low: true } : { low: true, branch: onlyBranch }}
      onClick={onOpen}
      className={className}
      data-notification={row.kind}
      data-new={isNew || undefined}
    >
      {content}
    </Link>
  );
}
