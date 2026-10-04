import { WifiIcon, WifiOffIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useOnlineStatus } from '@/lib/online-status';
import { cn } from '@/lib/utils';

/** Online/offline badge. In 1d it becomes the full sync status (pending changes, last sync). */
export function ConnectionStatus() {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  const Icon = online ? WifiIcon : WifiOffIcon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="status"
          tabIndex={0}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            online
              ? 'text-muted-foreground'
              : 'border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300',
          )}
        >
          <Icon
            aria-hidden
            className={cn('size-3.5', online && 'text-emerald-600 dark:text-emerald-400')}
          />
          <span className="sr-only sm:not-sr-only">
            {online ? t('connection.online') : t('connection.offline')}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        {online ? t('connection.onlineHint') : t('connection.offlineHint')}
      </TooltipContent>
    </Tooltip>
  );
}
