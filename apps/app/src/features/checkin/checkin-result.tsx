import { canOverride, formatMemberNumber, type CheckinAnswer, type CheckinResult } from '@gym/core';
import { localizedName } from '@gym/i18n';
import { Button } from '@gym/ui/components/button';
import { Field, FieldError, FieldLabel } from '@gym/ui/components/field';
import { Textarea } from '@gym/ui/components/textarea';
import { cn } from '@gym/ui/lib/utils';
import {
  CircleCheckIcon,
  CircleXIcon,
  ClockIcon,
  TriangleAlertIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermission } from '@/features/auth/use-permissions';
import { useMemberPhoto } from '@/features/members/member-data';
import { MemberPhotoImage } from '@/features/members/member-photo';
import { ScreenOverlay } from './screen-overlay';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';

/** How long a result stays before the screen is ready for the next card (spec §6). */
const RESULT_SECONDS = 5;

const TONES: Readonly<
  Record<CheckinResult, { readonly className: string; readonly icon: LucideIcon }>
> = {
  allowed: { className: 'bg-success text-success-foreground', icon: CircleCheckIcon },
  warning: { className: 'bg-warning text-warning-foreground', icon: TriangleAlertIcon },
  already: { className: 'bg-warning text-warning-foreground', icon: ClockIcon },
  denied: { className: 'bg-destructive text-destructive-foreground', icon: CircleXIcon },
};

/** "13:00:00" as 13:00. */
function hourOf(time: string | null): string {
  return (time ?? '').slice(0, 5);
}

/** The lines under the name: why not, or the notes, and what is left of the subscription. */
function useResultLines(answer: CheckinAnswer): string[] {
  const { t } = useTranslation('checkin');
  const format = useFormat();
  const subscription = answer.subscription;
  const lines: string[] = [];
  const owed = format.money(answer.owed_now ?? 0);

  switch (answer.reason) {
    case null:
      break;
    case 'ALREADY_CHECKED_IN':
      if (answer.previous_at)
        lines.push(t('result.alreadyAt', { time: format.time(answer.previous_at) }));
      break;
    case 'CARD_BLOCKED':
      lines.push(
        t(answer.card_status === 'stolen' ? 'reasons.CARD_STOLEN' : 'reasons.CARD_BLOCKED'),
      );
      break;
    case 'MEMBER_NOT_ACTIVE':
      lines.push(t(`reasons.MEMBER_${answer.member?.status ?? 'active'}`));
      break;
    case 'NOT_STARTED':
      lines.push(t('reasons.NOT_STARTED', { date: format.date(subscription?.start_date ?? '') }));
      break;
    case 'PLAN_EXPIRED':
      lines.push(t('reasons.PLAN_EXPIRED', { date: format.date(subscription?.end_date ?? '') }));
      break;
    case 'PLAN_FROZEN':
      lines.push(t('reasons.PLAN_FROZEN', { date: format.date(subscription?.frozen_until ?? '') }));
      break;
    case 'WRONG_TIME':
      lines.push(
        t('reasons.WRONG_TIME', {
          from: hourOf(subscription?.allowed_from ?? null),
          until: hourOf(subscription?.allowed_until ?? null),
        }),
      );
      break;
    case 'DEBT':
      lines.push(t('reasons.DEBT', { amount: owed }));
      break;
    default:
      lines.push(t(`reasons.${answer.reason}`));
  }

  if (answer.overridden) lines.push(t('result.overridden'));
  for (const warning of answer.warnings) {
    switch (warning) {
      case 'ENDS_SOON':
        lines.push(t('warnings.ENDS_SOON', { date: format.date(subscription?.end_date ?? '') }));
        break;
      case 'FEW_VISITS':
        lines.push(
          subscription?.visits_left === 0
            ? t('warnings.LAST_VISIT')
            : t('warnings.FEW_VISITS', { count: subscription?.visits_left ?? 0 }),
        );
        break;
      case 'DEBT':
        lines.push(t('warnings.DEBT', { amount: owed }));
        break;
      case 'BIRTHDAY':
        lines.push(t('warnings.BIRTHDAY'));
        break;
    }
  }
  return lines;
}

/**
 * A check-in's result over the whole screen (spec §6): the status color, the member's photo and
 * name in large text, why not or the notes, and a ring counting down to the next card. A tap
 * closes it early. Staff with checkin.override may let a refused member in from here (not on the
 * door screen).
 */
export function CheckinResultView({
  answer,
  onClose,
  onOverride,
  overriding = false,
  door = false,
  actions,
}: {
  readonly answer: CheckinAnswer;
  readonly onClose: () => void;
  /** Lets the member in anyway with a note; unset where nobody may (the door screen). */
  readonly onOverride?: (note: string) => void;
  readonly overriding?: boolean;
  /** The door screen: larger, and nothing for staff. */
  readonly door?: boolean;
  /** More for staff under the result, such as giving a locker (not on the door screen). */
  readonly actions?: ReactNode;
}) {
  const { t } = useTranslation('checkin');
  const { language } = usePreferences();
  const id = useId();
  const mayOverride = usePermission('checkin.override');
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [noteMissing, setNoteMissing] = useState(false);
  const tone = TONES[answer.result];
  const Icon = tone.icon;
  const lines = useResultLines(answer);
  const member = answer.member;
  const photo = useMemberPhoto({
    id: member?.id ?? '',
    photoUpdatedAt: member?.photo_updated_at ?? null,
  });
  const subscription = answer.subscription;
  const showOverride = onOverride !== undefined && mayOverride && canOverride(answer);

  // Closes by itself, unless staff are writing a note to let the member in.
  useEffect(() => {
    if (noteOpen) return;
    const timer = setTimeout(onClose, RESULT_SECONDS * 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [answer, noteOpen, onClose]);

  const confirmOverride = () => {
    if (note.trim() === '') {
      setNoteMissing(true);
      return;
    }
    onOverride?.(note.trim());
  };

  return (
    <ScreenOverlay>
      <div
        role="alert"
        aria-labelledby={`${id}-title`}
        data-checkin-result={answer.result}
        data-checkin-reason={answer.reason ?? undefined}
        className={cn(
          'fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 overflow-y-auto p-6 text-center',
          'motion-safe:animate-in motion-safe:duration-200 motion-safe:zoom-in-95 motion-safe:fade-in',
          tone.className,
        )}
        onClick={noteOpen ? undefined : onClose}
      >
        <Button
          variant="ghost"
          size="icon"
          className="absolute end-4 top-4 size-12 text-current hover:bg-black/10"
          aria-label={t('result.close')}
          onClick={onClose}
        >
          <XIcon className="size-6" />
        </Button>

        <div className="flex items-center gap-3">
          <Icon aria-hidden className={door ? 'size-16' : 'size-12'} />
          <h2 id={`${id}-title`} className={door ? 'text-6xl' : 'text-4xl'}>
            {t(`result.${answer.result}`)}
          </h2>
        </div>

        {member && (
          <MemberPhotoImage
            image={photo.data}
            alt={member.full_name}
            className={cn(
              'rounded-3xl bg-black/10',
              door ? 'size-72 lg:size-96' : 'size-48 lg:size-64',
            )}
          />
        )}

        {member && (
          <div className="flex flex-col items-center gap-1">
            <p className={door ? 'text-6xl' : 'text-4xl'} data-testid="checkin-name">
              {member.full_name}
            </p>
            <p className="text-lg opacity-90">
              {t('result.number', { number: formatMemberNumber(member.member_number) })}
            </p>
          </div>
        )}

        {lines.length > 0 && (
          <ul
            className={cn('flex flex-col gap-1', door ? 'text-3xl' : 'text-2xl')}
            data-testid="checkin-lines"
          >
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}

        {subscription && answer.result !== 'denied' && (
          <p className="text-lg opacity-90">
            {localizedName(
              {
                nameCkb: subscription.name_ckb,
                nameEn: subscription.name_en,
                nameAr: subscription.name_ar,
              },
              language,
            )}
            {subscription.visits_left !== null &&
              ` · ${t('result.visitsLeft', { count: subscription.visits_left })}`}
          </p>
        )}

        {actions && !noteOpen && (
          <div
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            {actions}
          </div>
        )}

        {showOverride && !noteOpen && (
          <Button
            size="lg"
            variant="secondary"
            className="h-12"
            onClick={(event) => {
              event.stopPropagation();
              setNoteOpen(true);
            }}
          >
            {t('override.action')}
          </Button>
        )}

        {showOverride && noteOpen && (
          <form
            className="flex w-full max-w-md flex-col gap-3 rounded-2xl bg-background p-4 text-start text-foreground"
            onClick={(event) => {
              event.stopPropagation();
            }}
            onSubmit={(event) => {
              event.preventDefault();
              confirmOverride();
            }}
          >
            <p className="text-lg">{t('override.title')}</p>
            <Field data-invalid={noteMissing || undefined}>
              <FieldLabel htmlFor={`${id}-note`}>{t('override.note')}</FieldLabel>
              <Textarea
                id={`${id}-note`}
                value={note}
                maxLength={300}
                autoFocus
                aria-invalid={noteMissing || undefined}
                onChange={(event) => {
                  setNote(event.target.value);
                  setNoteMissing(false);
                }}
              />
              {noteMissing && <FieldError>{t('override.noteRequired')}</FieldError>}
            </Field>
            <div className="flex gap-2">
              <Button type="submit" className="h-11 flex-1" disabled={overriding}>
                {t('override.confirm')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => {
                  setNoteOpen(false);
                }}
              >
                {t('override.cancel')}
              </Button>
            </div>
          </form>
        )}

        {!noteOpen && (
          <CountdownRing
            key={answer.attendance_id ?? answer.reason ?? ''}
            label={t('result.closing')}
          />
        )}
      </div>
    </ScreenOverlay>
  );
}

/** A ring that empties over RESULT_SECONDS (no motion for those who asked for less). */
function CountdownRing({ label }: { readonly label: string }) {
  const radius = 20;
  const length = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 48 48" className="size-12 -rotate-90" role="img" aria-label={label}>
      <circle
        cx="24"
        cy="24"
        r={radius}
        fill="none"
        strokeWidth="4"
        className="stroke-current opacity-25"
      />
      <circle
        cx="24"
        cy="24"
        r={radius}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={length}
        className="stroke-current motion-safe:animate-[checkin-countdown_var(--checkin-seconds)_linear_forwards]"
        style={
          {
            '--checkin-seconds': `${String(RESULT_SECONDS)}s`,
            '--checkin-length': String(length),
          } as CSSProperties
        }
      />
    </svg>
  );
}
