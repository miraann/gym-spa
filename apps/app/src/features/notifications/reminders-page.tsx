import { baghdadDateOf, nameIn, nextDay, type MessageTemplateKey } from '@gym/core';
import { Chip, ChipRow } from '@gym/ui/blocks/chip-row';
import { ListGroup, ListRow } from '@gym/ui/blocks/list-group';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { Badge } from '@gym/ui/components/badge';
import { Button } from '@gym/ui/components/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@gym/ui/components/empty';
import { Skeleton } from '@gym/ui/components/skeleton';
import {
  BellRingIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MessageCircleIcon,
  RotateCcwIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RequirePermission } from '@/components/no-access';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { useBaghdadToday } from '@/lib/use-today';
import { useReminders, useSetReminderDone, type Reminder } from './notification-data';
import { notificationErrorKey } from './notification-errors';
import { SendWhatsAppDialog } from './send-whatsapp-dialog';
import { useTemplateName } from './template-name';
import { NotificationError } from './templates-page';

/** The day before a `YYYY-MM-DD` date. */
function previousDay(date: string): string {
  return baghdadDateOf(Date.parse(`${date}T12:00:00+03:00`) - 86_400_000);
}

/** /notifications (notifications.send): who to contact today, one by one. */
export function RemindersPage() {
  return (
    <RequirePermission permission="notifications.send">
      <Reminders />
    </RequirePermission>
  );
}

function Reminders() {
  const { t } = useTranslation('notifications');
  const format = useFormat();
  const today = useBaghdadToday();
  const templateName = useTemplateName();
  const [day, setDay] = useState(today);
  const [showAll, setShowAll] = useState(false);
  const [kind, setKind] = useState<MessageTemplateKey | null>(null);
  const [sending, setSending] = useState<Reminder | null>(null);
  const reminders = useReminders(day, today);

  const all = reminders.data ?? [];
  const kinds = [...new Set(all.map((reminder) => reminder.kind))];
  const shown = all.filter(
    (reminder) =>
      (showAll || reminder.doneAt === null) && (kind === null || reminder.kind === kind),
  );
  const done = all.filter((reminder) => reminder.doneAt !== null).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('reminders.title')} description={t('reminders.description')} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label={t('reminders.previousDay')}
          onClick={() => {
            setDay(previousDay(day));
          }}
        >
          <ChevronRightIcon className="ltr:rotate-180" />
        </Button>
        <span className="min-w-40 text-center" data-testid="reminders-day">
          {format.date(day, 'full')}
        </span>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('reminders.nextDay')}
          disabled={day >= today}
          onClick={() => {
            setDay(nextDay(day));
          }}
        >
          <ChevronLeftIcon className="ltr:rotate-180" />
        </Button>
        {all.length > 0 && (
          <span className="ms-auto text-sm text-muted-foreground tabular-nums">
            {t('reminders.progress', {
              done: format.number(done),
              total: format.number(all.length),
            })}
          </span>
        )}
      </div>
      <ChipRow label={t('reminders.show')}>
        <Chip
          type="button"
          selected={!showAll}
          aria-pressed={!showAll}
          onClick={() => {
            setShowAll(false);
          }}
        >
          {t('reminders.open')}
        </Chip>
        <Chip
          type="button"
          selected={showAll}
          aria-pressed={showAll}
          onClick={() => {
            setShowAll(true);
          }}
        >
          {t('reminders.all')}
        </Chip>
      </ChipRow>
      {kinds.length > 1 && (
        <ChipRow label={t('reminders.kind')}>
          <Chip
            type="button"
            selected={kind === null}
            aria-pressed={kind === null}
            onClick={() => {
              setKind(null);
            }}
          >
            {t('reminders.allKinds')}
          </Chip>
          {kinds.map((each) => (
            <Chip
              key={each}
              type="button"
              selected={kind === each}
              aria-pressed={kind === each}
              onClick={() => {
                setKind(each);
              }}
            >
              {templateName(each)}
            </Chip>
          ))}
        </ChipRow>
      )}

      {reminders.isPending ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : reminders.isError ? (
        <NotificationError error={notificationErrorKey(reminders.error, 'load_reminders')} />
      ) : shown.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BellRingIcon />
            </EmptyMedia>
            <EmptyDescription>
              {all.length === 0 ? t('reminders.empty') : t('reminders.emptyFilter')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ListGroup>
          {shown.map((reminder) => (
            <ReminderRow
              key={reminder.id}
              reminder={reminder}
              onSend={() => {
                setSending(reminder);
              }}
            />
          ))}
        </ListGroup>
      )}
      {sending && (
        <SendWhatsAppDialog
          member={sending.member}
          templateKey={sending.kind}
          details={sending.details}
          branchId={sending.branchId}
          reminderId={sending.id}
          onClose={() => {
            setSending(null);
          }}
        />
      )}
    </div>
  );
}

/** What a reminder is about, in one line. */
function useReminderDetail(): (reminder: Reminder) => string | null {
  const { t } = useTranslation('notifications');
  const format = useFormat();
  const { language } = usePreferences();
  return ({ kind, details }) => {
    if (kind.startsWith('expiring') || kind === 'expired') {
      return details.endDate
        ? t('reminders.details.expiring', { date: format.date(details.endDate) })
        : null;
    }
    if (kind === 'installment_due' && details.amount !== undefined && details.dueDate) {
      return t('reminders.details.installment', {
        amount: format.money(details.amount),
        date: format.date(details.dueDate),
      });
    }
    if (kind === 'debt' && details.amount !== undefined) {
      return t('reminders.details.debt', { amount: format.money(details.amount) });
    }
    if (kind === 'spa_booking' && details.service && details.startsAt) {
      return t('reminders.details.spa', {
        service: nameIn(details.service, language),
        date: format.date(details.startsAt),
        time: format.time(details.startsAt),
      });
    }
    return null;
  };
}

function ReminderRow({
  reminder,
  onSend,
}: {
  readonly reminder: Reminder;
  readonly onSend: () => void;
}) {
  const { t } = useTranslation('notifications');
  const format = useFormat();
  const templateName = useTemplateName();
  const detailOf = useReminderDetail();
  const { online, readOnly } = useAdminWriteState();
  const setDone = useSetReminderDone();
  const [error, setError] = useState<ReturnType<typeof notificationErrorKey> | null>(null);
  const detail = detailOf(reminder);
  const isDone = reminder.doneAt !== null;
  const phone = reminder.member.phone ?? reminder.member.emergencyPhone;

  return (
    <ListRow
      data-reminder={reminder.kind}
      data-done={isDone || undefined}
      title={reminder.member.fullName}
      description={
        <span className="flex flex-col gap-0.5 whitespace-normal">
          <span>{[templateName(reminder.kind), detail].filter(Boolean).join(' · ')}</span>
          <span className="flex flex-wrap items-center gap-2">
            {phone && (
              <span dir="ltr" className="tabular-nums">
                {phone}
              </span>
            )}
            {reminder.member.phone === null && (
              <Badge variant="outline">{t('reminders.emergency')}</Badge>
            )}
            {reminder.openedAt && (
              <Badge variant="secondary">
                {t('reminders.opened', { time: format.time(reminder.openedAt) })}
              </Badge>
            )}
            {isDone && (
              <Badge variant="secondary">
                <CheckIcon aria-hidden />
                {t('reminders.done')}
              </Badge>
            )}
          </span>
          {error && <span className="text-destructive">{t(`errors.${error}`)}</span>}
        </span>
      }
      trailing={
        <>
          <Button
            size="sm"
            variant={isDone ? 'outline' : 'default'}
            disabled={!online || readOnly}
            onClick={onSend}
          >
            <MessageCircleIcon data-icon="inline-start" />
            {t('reminders.whatsapp')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!online || readOnly || setDone.isPending}
            onClick={() => {
              setError(null);
              setDone.mutate(
                { id: reminder.id, done: !isDone },
                {
                  onError: (thrown) => {
                    setError(notificationErrorKey(thrown, 'reminder_done'));
                  },
                },
              );
            }}
          >
            {isDone ? (
              <>
                <RotateCcwIcon data-icon="inline-start" />
                {t('reminders.undo')}
              </>
            ) : (
              <>
                <CheckIcon data-icon="inline-start" />
                {t('reminders.markDone')}
              </>
            )}
          </Button>
        </>
      }
    />
  );
}
