import {
  CloudAlertIcon,
  CloudCheckIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  WifiOffIcon,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { connection, useConnection, type ConnectionState } from '@/lib/connection';
import { useFormat } from '@/lib/format';
import { cn } from '@/lib/utils';

const ICONS: Record<ConnectionState, LucideIcon> = {
  checking: LoaderCircleIcon,
  connected: CloudCheckIcon,
  offline: WifiOffIcon,
  unreachable: CloudAlertIcon,
};

const STYLES: Record<ConnectionState, string> = {
  checking: 'text-muted-foreground',
  connected: 'text-muted-foreground',
  offline: 'border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  unreachable: 'border-destructive/50 bg-destructive/10 text-destructive',
};

/** Always-visible connection state (top bar), with details and "Check again" in a popover. */
export function ConnectionStatus() {
  const { t } = useTranslation();
  const format = useFormat();
  const { state, checkedAt } = useConnection();
  const Icon = ICONS[state];
  const label = {
    checking: t('connection.checking'),
    connected: t('connection.connected'),
    offline: t('connection.offline'),
    unreachable: t('connection.unreachable'),
  }[state];
  const hint = {
    checking: null,
    connected: t('connection.connectedHint'),
    offline: t('connection.offlineHint'),
    unreachable: t('connection.unreachableHint'),
  }[state];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="status"
          aria-label={`${t('connection.title')}: ${label}`}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            STYLES[state],
          )}
        >
          <Icon
            aria-hidden
            className={cn(
              'size-3.5',
              state === 'connected' && 'text-emerald-600 dark:text-emerald-400',
              state === 'checking' && 'animate-spin motion-reduce:animate-none',
            )}
          />
          <span className="sr-only sm:not-sr-only">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 text-sm">
        <div className="space-y-1">
          <p className="font-medium">{t('connection.title')}</p>
          {hint && <p className="text-muted-foreground">{hint}</p>}
        </div>
        {checkedAt && (
          <p className="text-muted-foreground">
            {t('connection.lastChecked', { time: format.dateTime(checkedAt) })}
          </p>
        )}
        <Button
          size="sm"
          className="w-full"
          disabled={state === 'checking'}
          onClick={() => void connection.check()}
        >
          <RefreshCwIcon aria-hidden />
          {t('connection.retry')}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
