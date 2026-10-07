import { useQuery, useStatus } from '@powersync/react';
import {
  CloudAlertIcon,
  CloudCheckIcon,
  CloudOffIcon,
  RefreshCwIcon,
  WifiOffIcon,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useFormat } from '@/lib/format';
import { useOnlineStatus } from '@/lib/online-status';
import { useSyncControls } from '@/lib/sync-controls';
import { syncIndicatorState, type SyncIndicatorState } from '@/lib/sync-state';
import { cn } from '@/lib/utils';

const ICONS: Record<SyncIndicatorState, LucideIcon> = {
  online: CloudCheckIcon,
  offline: WifiOffIcon,
  not_syncing: CloudOffIcon,
  syncing: RefreshCwIcon,
  error: CloudAlertIcon,
};

const STYLES: Record<SyncIndicatorState, string> = {
  online: 'text-muted-foreground',
  syncing: 'text-muted-foreground',
  not_syncing: 'border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  offline: 'border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  error: 'border-destructive/50 bg-destructive/10 text-destructive',
};

/** Always-visible sync state (top bar), with details and "Sync now" in a popover. */
export function SyncStatus() {
  const { t } = useTranslation();
  const format = useFormat();
  const online = useOnlineStatus();
  const status = useStatus();
  const { signedIn, syncNow } = useSyncControls();
  // ps_crud is PowerSync's upload queue.
  const { data: queued } = useQuery<{ count: number }>('SELECT count(*) AS count FROM ps_crud');
  const { data: refused } = useQuery<{ count: number }>(
    'SELECT count(*) AS count FROM rejected_changes',
  );
  const pending = queued[0]?.count ?? 0;
  const rejected = refused[0]?.count ?? 0;

  const state = syncIndicatorState({
    online,
    signedIn,
    connected: status.connected,
    connecting: status.connecting,
    uploading: status.uploading,
    downloading: status.downloading,
    hasError: Boolean(status.uploadError ?? status.downloadError),
    pending,
  });
  const Icon = ICONS[state];
  const label = {
    online: t('sync.online'),
    offline: t('sync.offline'),
    not_syncing: t('sync.notSyncing'),
    syncing: t('sync.syncing', { count: format.number(pending) }),
    error: t('sync.error'),
  }[state];
  const hint = {
    online: t('sync.onlineHint'),
    offline: t('sync.offlineHint'),
    not_syncing: t('sync.notSyncingHint'),
    syncing: t('sync.syncingHint'),
    error: t('sync.errorHint'),
  }[state];
  const lastSynced = status.lastSyncedAt;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="status"
          aria-label={`${t('sync.title')}: ${label}`}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            STYLES[state],
          )}
        >
          <Icon
            aria-hidden
            className={cn(
              'size-3.5',
              state === 'online' && 'text-emerald-600 dark:text-emerald-400',
              state === 'syncing' && 'animate-spin motion-reduce:animate-none',
            )}
          />
          <span className="sr-only sm:not-sr-only">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 text-sm">
        <div className="space-y-1">
          <p className="font-medium">{t('sync.title')}</p>
          <p className="text-muted-foreground">{hint}</p>
        </div>
        <ul className="space-y-1 text-muted-foreground">
          <li>
            {lastSynced
              ? t('sync.lastSynced', { time: format.dateTime(lastSynced) })
              : t('sync.neverSynced')}
          </li>
          <li>{t('sync.pending', { count: format.number(pending) })}</li>
          {rejected > 0 && (
            <li className="text-destructive">
              {t('sync.rejected', { count: format.number(rejected) })}
            </li>
          )}
        </ul>
        <Button
          size="sm"
          className="w-full"
          disabled={!online || !syncNow}
          onClick={() => {
            syncNow?.();
          }}
        >
          <RefreshCwIcon aria-hidden />
          {t('sync.syncNow')}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
