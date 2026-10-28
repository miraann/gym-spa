import {
  SPA_LIMITS,
  baghdadClock,
  baghdadMoment,
  canChangeSpaStatus,
  spaDaySlots,
} from '@gym/core';
import { localizedName } from '@gym/i18n';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Badge } from '@gym/ui/components/badge';
import { Button } from '@gym/ui/components/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@gym/ui/components/field';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { Spinner } from '@gym/ui/components/spinner';
import { Textarea } from '@gym/ui/components/textarea';
import { Link } from '@tanstack/react-router';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { DateSelectField } from '@/components/date-select-field';
import { usePermission } from '@/features/auth/use-permissions';
import { PayNow } from '@/features/payments/pay-now';
import { usePayNow } from '@/features/payments/use-pay-now';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { useBaghdadToday } from '@/lib/use-today';
import { BOOKING_LOOK } from './spa-booking-look';
import {
  useArriveSpaBooking,
  useMoveSpaBooking,
  useSetSpaBookingStatus,
  type SpaBooking,
  type SpaCalendarSettings,
} from './spa-calendar-data';
import { useSpaRooms, useSpaServices, useSpaTherapists } from './spa-data';
import { SpaError } from './spa-error';
import { spaErrorKey, type SpaErrorKey } from './spa-errors';

type Mode = 'view' | 'arrive' | 'cancelled' | 'no_show' | 'move';

/** A booking's details and what can be done with it next (spa.book). */
export function BookingDetails({
  booking,
  branchId,
  settings,
  onClose,
}: {
  readonly booking: SpaBooking;
  readonly branchId: string;
  readonly settings: SpaCalendarSettings;
  readonly onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>('view');
  const back = () => {
    setMode('view');
  };
  switch (mode) {
    case 'arrive':
      return <ArriveDialog booking={booking} onBack={back} onDone={onClose} />;
    case 'cancelled':
    case 'no_show':
      return <CloseDialog booking={booking} status={mode} onBack={back} onDone={onClose} />;
    case 'move':
      return (
        <MoveDialog
          booking={booking}
          branchId={branchId}
          settings={settings}
          onBack={back}
          onDone={onClose}
        />
      );
    case 'view':
      return (
        <ViewDialog booking={booking} branchId={branchId} onMode={setMode} onClose={onClose} />
      );
  }
}

function useNames(booking: SpaBooking) {
  const { t } = useTranslation('spa');
  return { person: booking.member?.fullName ?? t('details.unknownMember') };
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 last:border-b-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-end">{children}</dd>
    </div>
  );
}

function ViewDialog({
  booking,
  branchId,
  onMode,
  onClose,
}: {
  readonly booking: SpaBooking;
  readonly branchId: string;
  readonly onMode: (mode: Mode) => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('spa');
  const { language } = usePreferences();
  const format = useFormat();
  const today = useBaghdadToday();
  const { online, readOnly } = useAdminWriteState();
  const mayBook = usePermission('spa.book');
  const mayViewMembers = usePermission('members.view');
  const rooms = useSpaRooms(branchId);
  const therapists = useSpaTherapists(branchId);
  const status = useSetSpaBookingStatus();
  const [error, setError] = useState<SpaErrorKey | null>(null);
  const { person } = useNames(booking);
  const look = BOOKING_LOOK[booking.status];
  const Icon = look.icon;
  const room = rooms.data?.find((each) => each.id === booking.roomId);
  const therapist = therapists.data?.find((each) => each.id === booking.therapistId);
  const onDay = baghdadClock(booking.startsAt).day === today;
  const can = (to: Parameters<typeof canChangeSpaStatus>[1]) =>
    mayBook && canChangeSpaStatus(booking.status, to);
  const disabled = !online || readOnly || status.isPending;
  // Only a booking whose client hasn't come yet is moved.
  const movable = mayBook && (booking.status === 'booked' || booking.status === 'confirmed');

  const change = (to: 'confirmed' | 'completed') => {
    setError(null);
    status.mutate(
      { bookingId: booking.id, status: to, note: null },
      {
        onSuccess: () => {
          toast.success(t(`details.done.${to}`));
          onClose();
        },
        onError: (thrown) => {
          setError(spaErrorKey(thrown, to));
        },
      },
    );
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('details.title', { name: person })}
      description={t('details.when', {
        day: format.date(booking.startsAt, 'full'),
        from: format.time(booking.startsAt),
        to: format.time(booking.endsAt),
      })}
      footer={
        <Button variant="outline" onClick={onClose}>
          {t('details.close')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4" data-testid="spa-booking-details">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" data-status={booking.status}>
            <Icon aria-hidden />
            {t(`statuses.${booking.status}`)}
          </Badge>
          {booking.member?.isGuest && <Badge variant="outline">{t('booking.guest')}</Badge>}
          {booking.walkIn && <Badge variant="outline">{t('details.walkIn')}</Badge>}
        </div>
        <dl>
          <Row label={t('booking.service')}>{localizedName(booking, language)}</Row>
          <Row label={t('details.room')}>{room ? localizedName(room, language) : '—'}</Row>
          {booking.therapistId && (
            <Row label={t('details.therapist')}>{therapist?.fullName ?? '—'}</Row>
          )}
          <Row label={t('details.paidWith')}>{t(`paidWith.${booking.paidWith}`)}</Row>
          {booking.paidWith === 'pay' && (
            <Row label={t('details.price')}>
              <span className="tabular-nums">{format.money(booking.price)}</span>
            </Row>
          )}
          {booking.note && <Row label={t('details.note')}>{booking.note}</Row>}
          {booking.statusNote && <Row label={t('details.statusNote')}>{booking.statusNote}</Row>}
        </dl>
        {mayViewMembers && (
          <Button asChild variant="link" className="self-start px-0">
            <Link to="/members/$memberId" params={{ memberId: booking.memberId }}>
              {t('details.memberPage')}
            </Link>
          </Button>
        )}
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('details.actions')}>
          {can('arrived') && onDay && (
            <Button
              disabled={disabled}
              onClick={() => {
                onMode('arrive');
              }}
            >
              {t('details.arrive')}
            </Button>
          )}
          {can('completed') && (
            <Button
              disabled={disabled}
              onClick={() => {
                change('completed');
              }}
            >
              {status.isPending && <Spinner />}
              {t('details.complete')}
            </Button>
          )}
          {can('confirmed') && (
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => {
                change('confirmed');
              }}
            >
              {t('details.confirm')}
            </Button>
          )}
          {movable && (
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => {
                onMode('move');
              }}
            >
              {t('details.move')}
            </Button>
          )}
          {can('no_show') && (
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => {
                onMode('no_show');
              }}
            >
              {t('details.noShow')}
            </Button>
          )}
          {can('cancelled') && (
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => {
                onMode('cancelled');
              }}
            >
              {t('details.cancel')}
            </Button>
          )}
        </div>
        <SpaError error={error} />
      </div>
    </ResponsiveDialog>
  );
}

/** A sub-dialog of the booking: confirm or go back. */
function StepDialog({
  title,
  confirm,
  pending,
  disabled = false,
  error,
  onConfirm,
  onBack,
  children,
}: {
  readonly title: string;
  readonly confirm: string;
  readonly pending: boolean;
  readonly disabled?: boolean;
  readonly error: SpaErrorKey | null;
  readonly onConfirm: () => void;
  readonly onBack: () => void;
  readonly children: ReactNode;
}) {
  const { t } = useTranslation('spa');
  const { online, readOnly } = useAdminWriteState();
  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => {
        if (!next) onBack();
      }}
      title={title}
      footer={
        <>
          <Button disabled={!online || readOnly || pending || disabled} onClick={onConfirm}>
            {pending && <Spinner />}
            {confirm}
          </Button>
          <Button variant="outline" onClick={onBack}>
            {t('details.back')}
          </Button>
        </>
      }
    >
      <FieldGroup data-testid="spa-booking-step">
        {children}
        <SpaError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}

function ArriveDialog({
  booking,
  onBack,
  onDone,
}: {
  readonly booking: SpaBooking;
  readonly onBack: () => void;
  readonly onDone: () => void;
}) {
  const { t } = useTranslation('spa');
  const { language } = usePreferences();
  const format = useFormat();
  const mayTakeMoney = usePermission('payments.create');
  const arrive = useArriveSpaBooking();
  const [ids] = useState(() => ({ invoice: crypto.randomUUID(), payment: crypto.randomUUID() }));
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<SpaErrorKey | null>(null);
  const { person } = useNames(booking);
  const charged = booking.paidWith === 'pay' && booking.price > 0;
  const pay = usePayNow(charged ? booking.price : 0);

  const confirm = () => {
    setSent(true);
    if (charged && pay.problem) return;
    setError(null);
    arrive.mutate(
      {
        bookingId: booking.id,
        invoiceId: ids.invoice,
        payment: charged ? pay.input(ids.payment) : null,
      },
      {
        onSuccess: (invoice) => {
          toast.success(
            invoice
              ? t('details.done.arrivedInvoice', { name: person, invoice })
              : t('details.done.arrived', { name: person }),
          );
          onDone();
        },
        onError: (thrown) => {
          setError(spaErrorKey(thrown, 'arrive'));
        },
      },
    );
  };

  return (
    <StepDialog
      title={t('details.arriveTitle', { name: person })}
      confirm={t('details.arrive')}
      pending={arrive.isPending}
      disabled={charged && !mayTakeMoney}
      error={error}
      onConfirm={confirm}
      onBack={onBack}
    >
      {charged ? (
        <>
          <p>
            {t('details.arrivePrice', {
              service: localizedName(booking, language),
              price: format.money(booking.price),
            })}
          </p>
          {mayTakeMoney ? (
            <PayNow
              label={t('details.payNow')}
              total={booking.price}
              payNow={pay.payNow}
              onPayNow={pay.setPayNow}
              payment={pay.values}
              onPayment={pay.setPayment}
              showProblems={sent}
            />
          ) : (
            <FieldDescription>{t('details.arriveNoMoney')}</FieldDescription>
          )}
        </>
      ) : (
        <p>
          {booking.paidWith === 'pay'
            ? t('details.arrivePrice', {
                service: localizedName(booking, language),
                price: format.money(0),
              })
            : t('details.arriveCovered', { source: t(`paidWith.${booking.paidWith}`) })}
        </p>
      )}
    </StepDialog>
  );
}

function CloseDialog({
  booking,
  status,
  onBack,
  onDone,
}: {
  readonly booking: SpaBooking;
  readonly status: 'cancelled' | 'no_show';
  readonly onBack: () => void;
  readonly onDone: () => void;
}) {
  const { t } = useTranslation('spa');
  const id = useId();
  const change = useSetSpaBookingStatus();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<SpaErrorKey | null>(null);
  const { person } = useNames(booking);

  const confirm = () => {
    setError(null);
    change.mutate(
      { bookingId: booking.id, status, note: reason.trim() === '' ? null : reason.trim() },
      {
        onSuccess: () => {
          toast.success(t(`details.done.${status}`));
          onDone();
        },
        onError: (thrown) => {
          setError(spaErrorKey(thrown, status));
        },
      },
    );
  };

  return (
    <StepDialog
      title={
        status === 'cancelled'
          ? t('details.cancelTitle', { name: person })
          : t('details.noShowTitle', { name: person })
      }
      confirm={status === 'cancelled' ? t('details.cancel') : t('details.noShow')}
      pending={change.isPending}
      error={error}
      onConfirm={confirm}
      onBack={onBack}
    >
      <Field>
        <FieldLabel htmlFor={`${id}-reason`}>{t('details.reason')}</FieldLabel>
        <Textarea
          id={`${id}-reason`}
          maxLength={SPA_LIMITS.note}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </Field>
    </StepDialog>
  );
}

function MoveDialog({
  booking,
  branchId,
  settings,
  onBack,
  onDone,
}: {
  readonly booking: SpaBooking;
  readonly branchId: string;
  readonly settings: SpaCalendarSettings;
  readonly onBack: () => void;
  readonly onDone: () => void;
}) {
  const { t } = useTranslation('spa');
  const { language } = usePreferences();
  const format = useFormat();
  const id = useId();
  const services = useSpaServices();
  const rooms = useSpaRooms(branchId);
  const therapists = useSpaTherapists(branchId);
  const move = useMoveSpaBooking();
  const start = baghdadClock(booking.startsAt);
  const [day, setDay] = useState(start.day);
  const [minute, setMinute] = useState(start.minute);
  const [roomId, setRoomId] = useState(booking.roomId);
  const [therapistId, setTherapistId] = useState(booking.therapistId ?? '');
  const [error, setError] = useState<SpaErrorKey | null>(null);
  const { person } = useNames(booking);
  const service = services.data?.find((each) => each.id === booking.serviceId);
  const roomChoices = (rooms.data ?? []).filter(
    (room) => room.id === booking.roomId || (room.isActive && room.kind === service?.kind),
  );
  const therapistChoices = (therapists.data ?? []).filter(
    (therapist) =>
      therapist.id === booking.therapistId ||
      (therapist.isActive && therapist.serviceIds.includes(booking.serviceId)),
  );
  const times = spaDaySlots(settings.fromHour, settings.untilHour, settings.slotMinutes);
  const choices = times.includes(minute) ? times : [...times, minute].sort((a, b) => a - b);

  const confirm = () => {
    setError(null);
    const startsAt = baghdadMoment(day, minute);
    move.mutate(
      {
        bookingId: booking.id,
        startsAt,
        roomId,
        therapistId: booking.therapistId === null ? null : therapistId,
      },
      {
        onSuccess: () => {
          toast.success(
            t('calendar.moved', { time: `${format.date(day)} ${format.time(startsAt)}` }),
          );
          onDone();
        },
        onError: (thrown) => {
          setError(spaErrorKey(thrown, 'move'));
        },
      },
    );
  };

  return (
    <StepDialog
      title={t('details.moveTitle', { name: person })}
      confirm={t('details.move')}
      pending={move.isPending}
      error={error}
      onConfirm={confirm}
      onBack={onBack}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <DateSelectField
          label={t('booking.day')}
          value={day}
          onChange={setDay}
          years={[Number(start.day.slice(0, 4)), Number(start.day.slice(0, 4)) + 1]}
          allowEmpty={false}
        />
        <Field>
          <FieldLabel htmlFor={`${id}-time`}>{t('booking.time')}</FieldLabel>
          <NativeSelect
            id={`${id}-time`}
            value={String(minute)}
            onChange={(event) => {
              setMinute(Number(event.target.value));
            }}
          >
            {choices.map((each) => (
              <NativeSelectOption key={each} value={String(each)}>
                {format.time(baghdadMoment(day, each))}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor={`${id}-room`}>{t('booking.room')}</FieldLabel>
        <NativeSelect
          id={`${id}-room`}
          value={roomId}
          onChange={(event) => {
            setRoomId(event.target.value);
          }}
        >
          {roomChoices.map((room) => (
            <NativeSelectOption key={room.id} value={room.id}>
              {localizedName(room, language)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {booking.therapistId !== null && (
        <Field>
          <FieldLabel htmlFor={`${id}-therapist`}>{t('booking.therapist')}</FieldLabel>
          <NativeSelect
            id={`${id}-therapist`}
            value={therapistId}
            onChange={(event) => {
              setTherapistId(event.target.value);
            }}
          >
            {therapistChoices.map((therapist) => (
              <NativeSelectOption key={therapist.id} value={therapist.id}>
                {therapist.fullName}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      )}
    </StepDialog>
  );
}
