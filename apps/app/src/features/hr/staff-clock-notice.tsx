import { Button } from '@gym/ui/components/button';
import { cn } from '@gym/ui/lib/utils';
import { CircleAlertIcon, LogInIcon, LogOutIcon, RotateCcwIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { StaffResult } from '@/features/checkin/use-checkin-flow';
import { useFormat } from '@/lib/format';

/** How long a staff clock result stays on the check-in screen. */
const SHOWN_MS = 5000;

/**
 * A staff card scanned at the check-in screen or the door screen: in, out, already recorded, or why
 * not, with the time. It closes by itself after a few seconds.
 */
export function StaffClockNotice({
  result,
  onClose,
  large = false,
}: {
  readonly result: StaffResult;
  readonly onClose: () => void;
  readonly large?: boolean;
}) {
  const { t } = useTranslation('hr');
  const format = useFormat();

  useEffect(() => {
    const timer = window.setTimeout(onClose, SHOWN_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [onClose, result]);

  const answer = result.answer;
  const Icon = answer
    ? answer.result === 'in'
      ? LogInIcon
      : answer.result === 'out'
        ? LogOutIcon
        : RotateCcwIcon
    : CircleAlertIcon;
  const at = answer
    ? answer.result === 'out'
      ? answer.clocked_out_at
      : answer.clocked_in_at
    : null;

  return (
    <div
      role="status"
      data-testid="staff-clock-notice"
      data-result={answer?.result ?? 'error'}
      className={cn(
        'flex items-center gap-4 rounded-3xl p-4 ring-1',
        answer ? 'bg-primary/10 ring-primary/30' : 'bg-destructive/10 ring-destructive/30',
        large && 'p-8 text-2xl',
      )}
    >
      <Icon aria-hidden className={cn('size-10 shrink-0', large && 'size-16')} />
      <div className="flex flex-1 flex-col gap-1">
        <p className="font-medium">
          {answer ? t(`checkin.${answer.result}`) : t(`errors.${result.error}`)}
        </p>
        {answer && (
          <p>
            {answer.full_name ?? ''}
            {at && ` · ${t('checkin.at', { time: format.time(at) })}`}
          </p>
        )}
      </div>
      <Button variant="ghost" onClick={onClose}>
        {t('actions.close')}
      </Button>
    </div>
  );
}
