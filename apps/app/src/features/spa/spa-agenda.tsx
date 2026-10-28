import { addDays, baghdadClock, baghdadMoment } from '@gym/core';
import { localizedName } from '@gym/i18n';
import { cn } from '@gym/ui/lib/utils';
import { useTranslation } from 'react-i18next';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { BOOKING_LOOK } from './spa-booking-look';
import type { SpaBooking } from './spa-calendar-data';

/** A day's bookings as a list, by time (phones, each day of the week view, the member's page). */
export function BookingList({
  bookings,
  onOpen,
  compact = false,
}: {
  readonly bookings: readonly SpaBooking[];
  /** Without it the rows are only shown (the member's page). */
  readonly onOpen?: (bookingId: string) => void;
  readonly compact?: boolean;
}) {
  const { t } = useTranslation('spa');
  if (bookings.length === 0) {
    return <p className="px-1 text-sm text-muted-foreground">{t('calendar.noBookings')}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {bookings.map((booking) => {
        const props = {
          'data-spa-booking': booking.member?.fullName ?? booking.id,
          'data-status': booking.status,
          className: cn(
            'flex w-full items-start gap-3 rounded-2xl px-3 py-2 text-start',
            BOOKING_LOOK[booking.status].block,
            compact && 'gap-2 px-2 text-xs',
          ),
        };
        return (
          <li key={booking.id}>
            {onOpen ? (
              <button
                type="button"
                {...props}
                className={cn(
                  props.className,
                  'outline-none focus-visible:ring-3 focus-visible:ring-ring/60',
                )}
                onClick={() => {
                  onOpen(booking.id);
                }}
              >
                <Row booking={booking} compact={compact} />
              </button>
            ) : (
              <div {...props}>
                <Row booking={booking} compact={compact} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** What a row of the list says: time, who, the service and the status. */
function Row({ booking, compact }: { readonly booking: SpaBooking; readonly compact: boolean }) {
  const { t } = useTranslation('spa');
  const { language } = usePreferences();
  const format = useFormat();
  const Icon = BOOKING_LOOK[booking.status].icon;
  return (
    <>
      <span className="shrink-0 tabular-nums">{format.time(booking.startsAt)}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">
          {booking.member?.fullName ?? t('details.unknownMember')}
        </span>
        <span className="truncate text-muted-foreground">{localizedName(booking, language)}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs">
        <Icon aria-hidden className="size-4" />
        {!compact && t(`statuses.${booking.status}`)}
        {compact && <span className="sr-only">{t(`statuses.${booking.status}`)}</span>}
      </span>
    </>
  );
}

/** A week of bookings, a column a day from the gym week's first day; a day's heading opens it. */
export function SpaWeek({
  start,
  today,
  bookings,
  onOpenDay,
  onOpen,
}: {
  readonly start: string;
  readonly today: string;
  readonly bookings: readonly SpaBooking[];
  readonly onOpenDay: (day: string) => void;
  readonly onOpen: (bookingId: string) => void;
}) {
  const { t } = useTranslation('spa');
  const format = useFormat();
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  return (
    <div className="overflow-x-auto" data-testid="spa-week">
      <div className="grid min-w-[56rem] grid-cols-7 gap-2">
        {days.map((day) => {
          const own = bookings.filter((booking) => baghdadClock(booking.startsAt).day === day);
          return (
            <section
              key={day}
              className="flex flex-col gap-2 rounded-3xl bg-card p-2"
              aria-label={format.date(day)}
            >
              <button
                type="button"
                className={cn(
                  'flex flex-col rounded-2xl px-2 py-1 text-start outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50',
                  day === today && 'bg-primary/10',
                )}
                onClick={() => {
                  onOpenDay(day);
                }}
              >
                <span className="text-sm font-medium">
                  {format.date(baghdadMoment(day, 12 * 60), 'full')}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t('calendar.bookingCount', { count: format.number(own.length) })}
                </span>
              </button>
              <BookingList bookings={own} onOpen={onOpen} compact />
            </section>
          );
        })}
      </div>
    </div>
  );
}
