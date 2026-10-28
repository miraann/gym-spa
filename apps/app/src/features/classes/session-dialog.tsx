import { formatMemberNumber } from '@gym/core';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Badge } from '@gym/ui/components/badge';
import { Button } from '@gym/ui/components/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Label } from '@gym/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@gym/ui/components/radio-group';
import { Spinner } from '@gym/ui/components/spinner';
import { Textarea } from '@gym/ui/components/textarea';
import { CircleXIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePermission } from '@/features/auth/use-permissions';
import { useMemberSearch } from '@/features/members/member-data';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import {
  useBookClass,
  useCancelClassBooking,
  useCancelClassSession,
  useClassBookings,
  useMarkClassAttendance,
  type ClassBooking,
  type ClassOccurrence,
} from './class-data';
import { ClassError } from './class-error';
import { classErrorKey, type ClassErrorKey } from './class-errors';

/** Attendance is marked from an hour before the class (mark_class_attendance). */
const MARK_FROM_MS = 3_600_000;

/** One class on one day: who is booked and waiting, booking someone, attendance, cancelling it. */
export function SessionDialog({
  occurrence,
  name,
  trainer,
  onClose,
}: {
  readonly occurrence: ClassOccurrence;
  readonly name: string;
  readonly trainer: string;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('classes');
  const format = useFormat();
  const mayBook = usePermission('classes.book');
  const mayManage = usePermission('classes.manage');
  const bookings = useClassBookings(occurrence.sessionId);
  const [cancelling, setCancelling] = useState(false);
  // Taken once: the dialog is short-lived, and a render must not read the clock.
  const [now] = useState(() => Date.now());
  const over = occurrence.endsAt.getTime() < now;
  const all = bookings.data ?? [];
  const booked = all.filter((each) => each.status !== 'waitlisted' && each.status !== 'cancelled');
  const waiting = all.filter((each) => each.status === 'waitlisted');

  if (cancelling) {
    return (
      <CancelClassDialog
        occurrence={occurrence}
        name={name}
        onBack={() => {
          setCancelling(false);
        }}
        onDone={onClose}
      />
    );
  }

  return (
    <ResponsiveDialog
      open
      wide
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={name}
      description={t('session.when', {
        day: format.date(occurrence.startsAt, 'full'),
        from: format.time(occurrence.startsAt),
        to: format.time(occurrence.endsAt),
      })}
      footer={
        <>
          {mayManage && !occurrence.cancelled && !over && (
            <Button
              variant="outline"
              onClick={() => {
                setCancelling(true);
              }}
            >
              {t('session.cancelClass')}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            {t('session.close')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4" data-testid="class-session">
        <p className="text-sm text-muted-foreground">
          {`${t('session.trainer')}: ${trainer}`}
          {occurrence.place && ` · ${t('session.place')}: ${occurrence.place}`}
        </p>
        {occurrence.cancelled && (
          <Alert>
            <CircleXIcon />
            <AlertDescription>
              {t('session.cancelledNotice', { reason: occurrence.cancelReason ?? '' })}
            </AlertDescription>
          </Alert>
        )}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm text-muted-foreground">
            {t('session.booked', { count: format.number(booked.length) })}
          </h3>
          {booked.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('session.none')}</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {booked.map((booking) => (
                <BookingRow
                  key={booking.id}
                  booking={booking}
                  occurrence={occurrence}
                  mayBook={mayBook}
                />
              ))}
            </ul>
          )}
        </section>
        {waiting.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm text-muted-foreground">
              {t('session.waitlist', { count: format.number(waiting.length) })}
            </h3>
            <ol className="flex flex-col divide-y">
              {waiting.map((booking) => (
                <BookingRow
                  key={booking.id}
                  booking={booking}
                  occurrence={occurrence}
                  mayBook={mayBook}
                />
              ))}
            </ol>
          </section>
        )}
        {mayBook && !occurrence.cancelled && !over && <BookMember occurrence={occurrence} />}
      </div>
    </ResponsiveDialog>
  );
}

function BookingRow({
  booking,
  occurrence,
  mayBook,
}: {
  readonly booking: ClassBooking;
  readonly occurrence: ClassOccurrence;
  readonly mayBook: boolean;
}) {
  const { t } = useTranslation('classes');
  const { online, readOnly } = useAdminWriteState();
  const cancel = useCancelClassBooking();
  const mark = useMarkClassAttendance();
  const [error, setError] = useState<ClassErrorKey | null>(null);
  const [now] = useState(() => Date.now());
  const markable =
    mayBook &&
    booking.status !== 'waitlisted' &&
    occurrence.startsAt.getTime() - now <= MARK_FROM_MS;
  const disabled = !online || readOnly || cancel.isPending || mark.isPending;

  const setStatus = (status: 'attended' | 'no_show') => {
    setError(null);
    mark.mutate(
      { bookingId: booking.id, status },
      {
        onSuccess: () => {
          toast.success(t('session.marked'));
        },
        onError: (thrown) => {
          setError(classErrorKey(thrown, 'mark'));
        },
      },
    );
  };

  return (
    <li
      className="flex flex-col gap-1 py-2"
      data-class-booking={booking.fullName ?? booking.id}
      data-status={booking.status}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{booking.fullName ?? '—'}</span>
        {booking.memberNumber !== null && (
          <span dir="ltr" className="text-sm text-muted-foreground tabular-nums">
            {formatMemberNumber(booking.memberNumber)}
          </span>
        )}
        <Badge variant={booking.status === 'attended' ? 'default' : 'secondary'}>
          {t(`statuses.${booking.status}`)}
        </Badge>
        <div className="ms-auto flex flex-wrap gap-1">
          {markable && booking.status !== 'attended' && (
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                setStatus('attended');
              }}
            >
              {t('session.attended')}
            </Button>
          )}
          {markable && booking.status !== 'no_show' && (
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                setStatus('no_show');
              }}
            >
              {t('session.noShow')}
            </Button>
          )}
          {mayBook && (booking.status === 'booked' || booking.status === 'waitlisted') && (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => {
                setError(null);
                cancel.mutate(booking.id, {
                  onSuccess: () => {
                    toast.success(t('session.cancelledToast'));
                  },
                  onError: (thrown) => {
                    setError(classErrorKey(thrown, 'cancel_booking'));
                  },
                });
              }}
            >
              {t('session.cancel')}
            </Button>
          )}
        </div>
      </div>
      <ClassError error={error} />
    </li>
  );
}

function BookMember({ occurrence }: { readonly occurrence: ClassOccurrence }) {
  const { t } = useTranslation('classes');
  const format = useFormat();
  const id = useId();
  const { online, readOnly } = useAdminWriteState();
  const book = useBookClass();
  const [query, setQuery] = useState('');
  const [memberId, setMemberId] = useState('');
  const [bookingId, setBookingId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<ClassErrorKey | null>(null);
  const searching = query.trim().length > 1;
  const found = useMemberSearch(query, searching);
  const candidates = (found.data?.members ?? []).filter((member) => member.status === 'active');
  const chosen = candidates.find((member) => member.id === memberId);

  const confirm = () => {
    if (!chosen) return;
    setError(null);
    book.mutate(
      {
        id: bookingId,
        scheduleId: occurrence.scheduleId,
        date: occurrence.date,
        memberId: chosen.id,
      },
      {
        onSuccess: (answer) => {
          toast.success(
            answer.status === 'waitlisted'
              ? t('session.waitlistedToast', {
                  name: chosen.fullName,
                  position: format.number(answer.position ?? 0),
                })
              : t('session.bookedToast', { name: chosen.fullName }),
          );
          setQuery('');
          setMemberId('');
          setBookingId(crypto.randomUUID());
        },
        onError: (thrown) => {
          setError(classErrorKey(thrown, 'book'));
        },
      },
    );
  };

  return (
    <FieldGroup className="rounded-2xl bg-muted/40 p-3" data-testid="class-book">
      <Field>
        <FieldLabel htmlFor={`${id}-search`}>{t('session.search')}</FieldLabel>
        <Input
          id={`${id}-search`}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setMemberId('');
          }}
        />
      </Field>
      {searching && found.isSuccess && candidates.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('session.noneFound')}</p>
      )}
      {searching && candidates.length > 0 && (
        <RadioGroup
          aria-label={t('session.search')}
          value={memberId}
          onValueChange={setMemberId}
          className="grid gap-2"
        >
          {candidates.map((member) => (
            <Label
              key={member.id}
              htmlFor={`${id}-${member.id}`}
              className="flex cursor-pointer items-center gap-3 rounded-xl border bg-card p-3 font-normal has-data-[state=checked]:border-primary"
            >
              <RadioGroupItem id={`${id}-${member.id}`} value={member.id} />
              <span className="flex-1">{member.fullName}</span>
              <span dir="ltr" className="text-sm text-muted-foreground tabular-nums">
                {formatMemberNumber(member.memberNumber)}
              </span>
            </Label>
          ))}
        </RadioGroup>
      )}
      <Button
        className="self-start"
        disabled={!chosen || !online || readOnly || book.isPending}
        onClick={confirm}
      >
        {book.isPending && <Spinner />}
        {t('session.book')}
      </Button>
      <ClassError error={error} />
    </FieldGroup>
  );
}

function CancelClassDialog({
  occurrence,
  name,
  onBack,
  onDone,
}: {
  readonly occurrence: ClassOccurrence;
  readonly name: string;
  readonly onBack: () => void;
  readonly onDone: () => void;
}) {
  const { t } = useTranslation('classes');
  const id = useId();
  const { online, readOnly } = useAdminWriteState();
  const cancel = useCancelClassSession();
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<ClassErrorKey | null>(null);

  const confirm = () => {
    setSent(true);
    if (reason.trim() === '') return;
    setError(null);
    cancel.mutate(
      { scheduleId: occurrence.scheduleId, date: occurrence.date, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(t('session.classCancelled'));
          onDone();
        },
        onError: (thrown) => {
          setError(classErrorKey(thrown, 'cancel_class'));
        },
      },
    );
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => {
        if (!next) onBack();
      }}
      title={t('session.cancelClassTitle', { name })}
      footer={
        <>
          <Button
            variant="destructive"
            disabled={!online || readOnly || cancel.isPending}
            onClick={confirm}
          >
            {cancel.isPending && <Spinner />}
            {t('session.cancelClass')}
          </Button>
          <Button variant="outline" onClick={onBack}>
            {t('session.back')}
          </Button>
        </>
      }
    >
      <Field data-invalid={(sent && reason.trim() === '') || undefined}>
        <FieldLabel htmlFor={`${id}-reason`}>{t('session.reason')}</FieldLabel>
        <Textarea
          id={`${id}-reason`}
          maxLength={300}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
        {sent && reason.trim() === '' && <FieldError>{t('errors.reason_required')}</FieldError>}
      </Field>
      <ClassError error={error} />
    </ResponsiveDialog>
  );
}
