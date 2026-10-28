import {
  addDays,
  baghdadClock,
  baghdadMoment,
  spaDaySlots,
  spaHoldsTime,
  weekStartOf,
} from '@gym/core';
import { localizedName } from '@gym/i18n';
import { ChoiceGroup } from '@gym/ui/blocks/choice-group';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { Button } from '@gym/ui/components/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@gym/ui/components/empty';
import { Skeleton } from '@gym/ui/components/skeleton';
import { useLayout } from '@gym/ui/hooks/use-layout';
import { Link } from '@tanstack/react-router';
import {
  BathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DoorOpenIcon,
  HandCoinsIcon,
  PlusIcon,
  SettingsIcon,
  UserRoundPlusIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { RequirePermission } from '@/components/no-access';
import { usePermission } from '@/features/auth/use-permissions';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { useBaghdadToday } from '@/lib/use-today';
import { BookingDetails } from './booking-details';
import { BookingDialog, type BookingStart } from './booking-dialog';
import { BookingList, SpaWeek } from './spa-agenda';
import { useSpaBranch } from './spa-branch';
import {
  useMoveSpaBooking,
  useSpaBookings,
  useSpaCalendarSettings,
  type SpaBooking,
} from './spa-calendar-data';
import { useSpaRooms, useSpaTherapists } from './spa-data';
import { SpaDayGrid, type GridColumn, type GridSpot } from './spa-day-grid';
import { SpaError } from './spa-error';
import { spaErrorKey, type SpaErrorKey } from './spa-errors';
import { BranchSelect } from './spa-fields';

/** /spa (spa.view): the spa's bookings, a day by room or staff member, or a week. */
export function SpaPage() {
  return (
    <RequirePermission permission="spa.view">
      <Spa />
    </RequirePermission>
  );
}

function Spa() {
  const { t } = useTranslation('spa');
  const { language } = usePreferences();
  const format = useFormat();
  const layout = useLayout();
  const today = useBaghdadToday();
  const { online, readOnly } = useAdminWriteState();
  const mayBook = usePermission('spa.book');
  const mayManage = usePermission('spa.manage');
  const { branchId, setBranchId, active, loaded } = useSpaBranch();
  const [view, setView] = useState<'day' | 'week'>('day');
  const [by, setBy] = useState<'rooms' | 'therapists'>('rooms');
  const [day, setDay] = useState(today);
  const firstDay = view === 'day' ? day : weekStartOf(day);
  const lastDay = view === 'day' ? day : addDays(firstDay, 6);
  const settings = useSpaCalendarSettings(branchId);
  const bookings = useSpaBookings(branchId, firstDay, lastDay);
  const rooms = useSpaRooms(branchId);
  const therapists = useSpaTherapists(branchId);
  const move = useMoveSpaBooking();
  const [creating, setCreating] = useState<{ start: BookingStart; walkIn: boolean } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<SpaErrorKey | null>(null);

  const step = settings.data?.slotMinutes ?? 15;
  const all = bookings.data ?? [];
  const holding = all.filter((booking) => spaHoldsTime(booking.status));
  // The day's hours, widened to show a booking outside them (a walk-in at night).
  const onDay = holding.filter((booking) => baghdadClock(booking.startsAt).day === day);
  const fromHour = Math.min(
    settings.data?.fromHour ?? 8,
    ...onDay.map((booking) => Math.floor(baghdadClock(booking.startsAt).minute / 60)),
  );
  const untilHour = Math.max(
    settings.data?.untilHour ?? 24,
    ...onDay.map((booking) => {
      const end = baghdadClock(booking.endsAt);
      return end.day === day ? Math.ceil(end.minute / 60) : 24;
    }),
  );
  const slots = settings.data ? spaDaySlots(fromHour, untilHour, step) : [];
  const closed = all.filter((booking) => !spaHoldsTime(booking.status));
  const opened = all.find((booking) => booking.id === openId) ?? null;
  const phone = layout === 'phone';

  /** Now, rounded down to the calendar's step (a walk-in), or the day's first free-looking slot. */
  const nowMinute = Math.floor(baghdadClock(new Date()).minute / step) * step;
  const firstMinute =
    day === today ? (slots.find((minute) => minute >= nowMinute) ?? nowMinute) : (slots[0] ?? 540);

  const columns: GridColumn[] =
    by === 'rooms'
      ? (rooms.data ?? [])
          .filter((room) => room.isActive || holding.some((booking) => booking.roomId === room.id))
          .map((room) => ({
            id: room.id,
            label: localizedName(room, language),
            capacity: room.capacity,
            hours: null,
          }))
      : (therapists.data ?? [])
          .filter(
            (therapist) =>
              therapist.isActive || holding.some((booking) => booking.therapistId === therapist.id),
          )
          .map((therapist) => ({
            id: therapist.id,
            label: therapist.fullName,
            capacity: 1,
            hours: therapist.hours,
          }));

  const canMove = (booking: SpaBooking) =>
    mayBook &&
    online &&
    !readOnly &&
    (booking.status === 'booked' || booking.status === 'confirmed');

  const moveTo = (booking: SpaBooking, spot: GridSpot) => {
    setError(null);
    const startsAt = baghdadMoment(day, spot.minute);
    move.mutate(
      {
        bookingId: booking.id,
        startsAt,
        roomId: by === 'rooms' ? spot.columnId : booking.roomId,
        therapistId: by === 'therapists' ? spot.columnId : booking.therapistId,
      },
      {
        onSuccess: () => {
          toast.success(t('calendar.moved', { time: format.time(startsAt) }));
        },
        onError: (thrown) => {
          setError(spaErrorKey(thrown, 'drag_move'));
        },
      },
    );
  };

  const shift = (direction: 1 | -1) => {
    setDay(addDays(day, direction * (view === 'day' ? 1 : 7)));
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('calendar.title')}
        description={t('calendar.description')}
        actions={
          <>
            {mayManage && (
              <Button asChild variant="outline">
                <Link to="/spa/commissions">
                  <HandCoinsIcon data-icon="inline-start" />
                  {t('commissions.open')}
                </Link>
              </Button>
            )}
            {mayManage && (
              <Button asChild variant="outline">
                <Link to="/spa/setup">
                  <SettingsIcon data-icon="inline-start" />
                  {t('calendar.setup')}
                </Link>
              </Button>
            )}
            {mayBook && branchId !== '' && settings.isSuccess && (
              <>
                <Button
                  variant="outline"
                  disabled={!online || readOnly}
                  onClick={() => {
                    setCreating({
                      start: { day: today, minute: nowMinute, roomId: null, therapistId: null },
                      walkIn: true,
                    });
                  }}
                >
                  <UserRoundPlusIcon data-icon="inline-start" />
                  {t('calendar.walkIn')}
                </Button>
                <Button
                  disabled={!online || readOnly}
                  onClick={() => {
                    setCreating({
                      start: { day, minute: firstMinute, roomId: null, therapistId: null },
                      walkIn: false,
                    });
                  }}
                >
                  <PlusIcon data-icon="inline-start" />
                  {t('calendar.newBooking')}
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <BranchSelect branchId={branchId} active={active} onChange={setBranchId} />
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label={view === 'day' ? t('calendar.previousDay') : t('calendar.previousWeek')}
            onClick={() => {
              shift(-1);
            }}
          >
            <ChevronRightIcon className="ltr:rotate-180" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            disabled={day === today}
            onClick={() => {
              setDay(today);
            }}
          >
            {t('calendar.today')}
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={view === 'day' ? t('calendar.nextDay') : t('calendar.nextWeek')}
            onClick={() => {
              shift(1);
            }}
          >
            <ChevronLeftIcon className="ltr:rotate-180" aria-hidden="true" />
          </Button>
        </div>
        <h2 className="text-lg" data-testid="spa-day">
          {view === 'day'
            ? format.date(baghdadMoment(day, 12 * 60), 'full')
            : `${format.date(firstDay)} – ${format.date(lastDay)}`}
        </h2>
        <div className="ms-auto flex flex-wrap gap-3">
          <ChoiceGroup
            label={t('calendar.view')}
            value={view}
            choices={[
              { value: 'day', label: t('calendar.day') },
              { value: 'week', label: t('calendar.week') },
            ]}
            onChange={setView}
          />
          {view === 'day' && !phone && (
            <ChoiceGroup
              label={t('calendar.by')}
              value={by}
              choices={[
                { value: 'rooms', label: t('calendar.rooms') },
                { value: 'therapists', label: t('calendar.therapists') },
              ]}
              onChange={setBy}
            />
          )}
        </div>
      </div>

      <SpaError error={error} />
      {loaded && branchId === '' ? (
        <p className="text-muted-foreground">{t('setup.noBranch')}</p>
      ) : bookings.isError ? (
        <SpaError error={spaErrorKey(bookings.error, 'load_bookings')} />
      ) : bookings.isPending || !settings.isSuccess || rooms.isPending || therapists.isPending ? (
        <Skeleton className="h-96 rounded-3xl" />
      ) : view === 'week' ? (
        <SpaWeek
          start={firstDay}
          today={today}
          bookings={all}
          onOpenDay={(chosen) => {
            setDay(chosen);
            setView('day');
          }}
          onOpen={setOpenId}
        />
      ) : phone ? (
        <BookingList bookings={holding} onOpen={setOpenId} />
      ) : columns.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {by === 'rooms' ? <DoorOpenIcon /> : <BathIcon />}
            </EmptyMedia>
            <EmptyDescription>
              {by === 'rooms' ? t('calendar.noRooms') : t('calendar.noTherapists')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <SpaDayGrid
            day={day}
            columns={columns}
            by={by}
            bookings={holding}
            slots={slots}
            step={step}
            canBook={mayBook && online && !readOnly}
            canMove={canMove}
            onSlot={(spot) => {
              setCreating({
                start: {
                  day,
                  minute: spot.minute,
                  roomId: by === 'rooms' ? spot.columnId : null,
                  therapistId: by === 'therapists' ? spot.columnId : null,
                },
                walkIn: false,
              });
            }}
            onOpen={setOpenId}
            onMove={moveTo}
          />
          <p className="text-sm text-muted-foreground">
            {by === 'therapists'
              ? t('calendar.withoutTherapist')
              : mayBook
                ? t('calendar.moveHint')
                : null}
          </p>
        </>
      )}
      {view === 'day' && closed.length > 0 && (
        <details className="rounded-3xl bg-card p-3">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {t('calendar.closed', { count: format.number(closed.length) })}
          </summary>
          <div className="pt-3">
            <BookingList bookings={closed} onOpen={setOpenId} />
          </div>
        </details>
      )}

      {creating && settings.data && (
        <BookingDialog
          branchId={branchId}
          start={creating.start}
          walkIn={creating.walkIn}
          settings={settings.data}
          onClose={() => {
            setCreating(null);
          }}
        />
      )}
      {opened && settings.data && (
        <BookingDetails
          booking={opened}
          branchId={branchId}
          settings={settings.data}
          onClose={() => {
            setOpenId(null);
          }}
        />
      )}
    </div>
  );
}
