import { nameIn } from '@gym/core';
import { localizedName } from '@gym/i18n';
import { Button } from '@gym/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@gym/ui/components/popover';
import { cn } from '@gym/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { BellIcon, BellRingIcon, PackageIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminBranches } from '@/features/staff/admin-data';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import {
  useMarkNotificationsRead,
  useStaffNotifications,
  type StaffNotification,
} from './notification-data';
import { useHasBell } from './use-has-bell';

/**
 * The bell in the top bar: today's reminders and low stock, for the staff member's branches and
 * permissions. Opening it marks everything read; what was new stays marked until it closes.
 */
export function NotificationBell({ compact }: { readonly compact: boolean }) {
  const { t } = useTranslation('notifications');
  const format = useFormat();
  const hasBell = useHasBell();
  const notifications = useStaffNotifications(hasBell);
  const markRead = useMarkNotificationsRead();
  const [newOnOpen, setNewOnOpen] = useState<ReadonlySet<string>>(new Set());
  if (!hasBell) return null;

  const all = notifications.data ?? [];
  const unread = all.filter((notification) => !notification.read);
  const label =
    unread.length > 0
      ? `${t('bell.label')} · ${t('bell.unread', { total: format.number(unread.length) })}`
      : t('bell.label');

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) return;
        setNewOnOpen(new Set(unread.map((notification) => notification.id)));
        // Read failures (a read-only gym) leave them unread; the bell tries again next time.
        if (unread.length > 0) markRead.mutate(unread.map((notification) => notification.id));
      }}
    >
      <PopoverTrigger asChild>
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
          {unread.length > 0 && (
            <span
              aria-hidden
              className="absolute -end-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs text-primary-foreground tabular-nums"
            >
              {format.number(Math.min(unread.length, 99))}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-2 p-2">
        <h2 className="px-2 pt-1 text-base font-semibold">{t('bell.label')}</h2>
        {all.length === 0 ? (
          <p className="px-2 pb-2 text-sm text-muted-foreground">{t('bell.empty')}</p>
        ) : (
          <ul className="flex max-h-96 flex-col overflow-y-auto">
            {all.map((notification) => (
              <li key={notification.id}>
                <NotificationItem
                  notification={notification}
                  isNew={newOnOpen.has(notification.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function NotificationItem({
  notification,
  isNew,
}: {
  readonly notification: StaffNotification;
  readonly isNew: boolean;
}) {
  const { t } = useTranslation('notifications');
  const format = useFormat();
  const { language } = usePreferences();
  const branches = useAdminBranches();
  const branch = branches.data?.find((each) => each.id === notification.branchId);
  const several = (branches.data?.filter((each) => each.isActive).length ?? 0) > 1;
  const Icon = notification.kind === 'low_stock' ? PackageIcon : BellRingIcon;
  const text =
    notification.kind === 'reminders_ready'
      ? t('bell.remindersReady', { total: format.number(notification.count) })
      : t('bell.lowStock', {
          product: nameIn(notification.product, language),
          quantity: format.number(notification.quantity),
        });

  return (
    <Link
      to={notification.kind === 'low_stock' ? '/shop/stock' : '/notifications'}
      className="flex items-start gap-3 rounded-xl px-2 py-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      data-notification={notification.kind}
      data-new={isNew || undefined}
    >
      <Icon aria-hidden className="mt-0.5 size-4.5 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn(isNew && 'text-foreground', !isNew && 'text-muted-foreground')}>
          {text}
        </span>
        <span className="text-sm text-muted-foreground">
          {format.date(notification.notifyOn)}
          {several && branch && ` · ${localizedName(branch, language)}`}
        </span>
      </span>
      {isNew && <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-primary" />}
    </Link>
  );
}
