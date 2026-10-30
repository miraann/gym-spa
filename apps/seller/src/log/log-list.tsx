import type { SellerTexts } from '@gym/i18n';
import { Button } from '@gym/ui/components/button';
import { Card } from '@gym/ui/components/card';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Spinner } from '@gym/ui/components/spinner';
import { ScrollTextIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuditLog, type LogRow } from '@/lib/api';
import { panelErrorKey } from '@/lib/errors';
import { useFormat } from '@/lib/format';
import { FormError } from '@/shell/form-error';

type LogAction = keyof SellerTexts['log']['actions'];

/** The actions of platform.audit_logs and platform.license_events, each with a label. */
const LOG_ACTIONS = [
  'gym_created',
  'gym_renamed',
  'gym_paid_until_set',
  'gym_limits_set',
  'gym_suspended',
  'gym_locked',
  'gym_reactivated',
  'admin_created',
  'admin_deactivated',
  'admin_reactivated',
  'admin_two_step_reset',
  'admin_password_reset',
  'recovery_codes_created',
  'recovery_code_used',
  'recovery_code_rejected',
  'license_issued',
  'license_revoked',
  'activation_issued',
  'activation_deactivated',
] as const satisfies readonly LogAction[];

function logAction(value: string): LogAction | null {
  return LOG_ACTIONS.find((action) => action === value) ?? null;
}

function Entry({ entry, showGym }: { readonly entry: LogRow; readonly showGym: boolean }) {
  const { t } = useTranslation('seller');
  const format = useFormat();
  const action = logAction(entry.action);
  const label = action === null ? entry.action : t(`log.actions.${action}`);
  return (
    <li
      className="flex flex-col gap-1 border-b px-4 py-3 last:border-0"
      data-log-action={entry.action}
    >
      <span className="flex flex-wrap items-baseline justify-between gap-2">
        <span>{label}</span>
        <time dateTime={entry.occurred_at} className="text-xs text-muted-foreground tabular-nums">
          {format.dateTime(entry.occurred_at)}
        </time>
      </span>
      <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span dir={entry.actor_email ? 'ltr' : undefined}>
          {entry.actor_email ?? t('log.byScript')}
        </span>
        {showGym && entry.gym_code && <span>{t('log.gym', { code: entry.gym_code })}</span>}
        {entry.target_email && <span>{t('log.admin', { email: entry.target_email })}</span>}
        {entry.reason && <span>{t('log.reason', { reason: entry.reason })}</span>}
      </span>
    </li>
  );
}

/** The seller log, newest first, a page at a time; gymId narrows it to one gym. */
export function LogList({ gymId }: { readonly gymId: string | null }) {
  const { t } = useTranslation('seller');
  const log = useAuditLog(gymId);
  if (log.isPending) return <Skeleton className="h-40 rounded-2xl" />;
  if (log.isError) return <FormError error={panelErrorKey(log.error)} />;
  const entries = log.data.pages.flat();
  if (entries.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
        <ScrollTextIcon className="size-8" aria-hidden="true" />
        {t('log.empty')}
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <Card className="p-0">
        <ul>
          {entries.map((entry) => (
            <Entry key={entry.id} entry={entry} showGym={gymId === null} />
          ))}
        </ul>
      </Card>
      {log.hasNextPage && (
        <Button
          variant="outline"
          className="self-center"
          disabled={log.isFetchingNextPage}
          onClick={() => void log.fetchNextPage()}
        >
          {log.isFetchingNextPage && <Spinner />}
          {t('log.more')}
        </Button>
      )}
    </div>
  );
}
