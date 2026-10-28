import { baghdadClock, baghdadMoment, weekdayOf, worksDuring, type WorkWindow } from '@gym/core';
import { localizedName } from '@gym/i18n';
import { cn } from '@gym/ui/lib/utils';
import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { BOOKING_LOOK } from './spa-booking-look';
import type { SpaBooking } from './spa-calendar-data';

/** One column of the day: a room (with its places) or a spa staff member (with their hours). */
export interface GridColumn {
  readonly id: string;
  readonly label: string;
  /** Places used at once (a room); 1 for a staff member. */
  readonly capacity: number;
  /** A staff member's working hours; null: a room, bookable all day. */
  readonly hours: readonly WorkWindow[] | null;
}

/** Where a booking would go: its column and start, minutes after midnight. */
export interface GridSpot {
  readonly columnId: string;
  readonly minute: number;
}

const ROW = 'var(--spa-row)';

/**
 * A day of the spa: the time down the side, a column per room or staff member. A free slot opens a
 * new booking there; a booking opens its details, and one not arrived yet can be dragged to another
 * time or column (the details also have a move dialog, for keyboards and touch).
 */
export function SpaDayGrid({
  day,
  columns,
  by,
  bookings,
  slots,
  step,
  canBook,
  canMove,
  onSlot,
  onOpen,
  onMove,
}: {
  readonly day: string;
  readonly columns: readonly GridColumn[];
  readonly by: 'rooms' | 'therapists';
  /** Open bookings of the day. */
  readonly bookings: readonly SpaBooking[];
  readonly slots: readonly number[];
  readonly step: number;
  readonly canBook: boolean;
  readonly canMove: (booking: SpaBooking) => boolean;
  readonly onSlot: (spot: GridSpot) => void;
  readonly onOpen: (bookingId: string) => void;
  readonly onMove: (booking: SpaBooking, spot: GridSpot) => void;
}) {
  const { t } = useTranslation('spa');
  const { language } = usePreferences();
  const format = useFormat();
  const weekday = weekdayOf(day);
  const first = slots[0] ?? 0;
  const last = (slots.at(-1) ?? first) + step;
  const bodyRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    booking: SpaBooking;
    x: number;
    y: number;
    pxPerMinute: number;
    origin: GridSpot;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [preview, setPreview] = useState<{ readonly id: string; readonly spot: GridSpot } | null>(
    null,
  );

  const clock = (minute: number) => format.time(baghdadMoment(day, minute));
  const columnOf = (booking: SpaBooking) => (by === 'rooms' ? booking.roomId : booking.therapistId);
  const minutesOf = (booking: SpaBooking) => {
    const start = baghdadClock(booking.startsAt);
    const end = baghdadClock(booking.endsAt);
    return {
      start: start.day === day ? start.minute : first,
      end: end.day === day ? end.minute : 1440,
    };
  };

  const startDrag = (event: PointerEvent<HTMLButtonElement>, booking: SpaBooking) => {
    if (!canMove(booking) || event.button !== 0 || !bodyRef.current) return;
    const column = bodyRef.current.querySelector<HTMLElement>('[data-spa-column]');
    if (!column) return;
    const pxPerMinute = column.getBoundingClientRect().height / (last - first);
    const columnId = columnOf(booking);
    if (columnId === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      booking,
      x: event.clientX,
      y: event.clientY,
      pxPerMinute,
      origin: { columnId, minute: minutesOf(booking).start },
      moved: false,
    };
  };

  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    if (!state) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (!state.moved && Math.hypot(dx, dy) < 6) return;
    state.moved = true;
    const minutes = Math.round(dy / state.pxPerMinute / step) * step;
    const minute = Math.min(Math.max(state.origin.minute + minutes, first), last - step);
    const under = document
      .elementsFromPoint(event.clientX, event.clientY)
      .find((element) => element instanceof HTMLElement && element.dataset.spaColumn !== undefined);
    const columnId =
      under instanceof HTMLElement && under.dataset.spaColumn
        ? under.dataset.spaColumn
        : state.origin.columnId;
    setPreview({ id: state.booking.id, spot: { columnId, minute } });
  };

  const endDrag = () => {
    const state = drag.current;
    drag.current = null;
    if (!state?.moved) return;
    suppressClick.current = true;
    const spot = preview?.id === state.booking.id ? preview.spot : null;
    setPreview(null);
    if (spot && (spot.columnId !== state.origin.columnId || spot.minute !== state.origin.minute)) {
      onMove(state.booking, spot);
    }
  };

  const gridStyle = {
    '--spa-row': '2.75rem',
    gridTemplateColumns: `4.5rem repeat(${String(columns.length)}, minmax(9rem, 1fr))`,
  } as CSSProperties;

  return (
    <div className="overflow-x-auto rounded-3xl bg-card" data-testid="spa-day-grid">
      <div className="grid min-w-full" style={gridStyle}>
        <div className="sticky top-0 z-20 bg-card" />
        {columns.map((column) => (
          <div
            key={column.id}
            className="sticky top-0 z-20 truncate border-b bg-card px-2 py-3 text-center text-sm font-medium"
            title={column.label}
          >
            {column.label}
          </div>
        ))}
        <div className="relative" style={{ height: `calc(${String(slots.length)} * ${ROW})` }}>
          {slots.map((minute, index) => (
            <span
              key={minute}
              className="absolute end-2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums"
              style={{ top: `calc(${String(index)} * ${ROW})` }}
            >
              {index === 0 ? null : clock(minute)}
            </span>
          ))}
        </div>
        <div ref={bodyRef} className="contents">
          {columns.map((column) => {
            const own = bookings.filter((booking) => columnOf(booking) === column.id);
            return (
              <div
                key={column.id}
                data-spa-column={column.id}
                className="relative border-s"
                style={{ height: `calc(${String(slots.length)} * ${ROW})` }}
              >
                {slots.map((minute, index) => {
                  const working =
                    column.hours === null ||
                    worksDuring(column.hours, weekday, minute, minute + step);
                  const style = { top: `calc(${String(index)} * ${ROW})`, height: ROW };
                  return working ? (
                    <button
                      key={minute}
                      type="button"
                      disabled={!canBook}
                      aria-label={t('calendar.freeSlot', {
                        time: clock(minute),
                        column: column.label,
                      })}
                      className="absolute inset-x-0 border-t border-border/50 outline-none hover:bg-muted/50 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset disabled:hover:bg-transparent"
                      style={style}
                      onClick={() => {
                        onSlot({ columnId: column.id, minute });
                      }}
                    />
                  ) : (
                    <div
                      key={minute}
                      aria-hidden="true"
                      title={t('calendar.off')}
                      className="absolute inset-x-0 border-t border-border/50 bg-[repeating-linear-gradient(135deg,transparent_0_6px,var(--muted)_6px_12px)]"
                      style={style}
                    />
                  );
                })}
                {own.map((booking) => {
                  const shown = preview?.id === booking.id ? preview.spot : null;
                  if (shown && shown.columnId !== column.id) return null;
                  const { start, end } = minutesOf(booking);
                  const top = shown ? shown.minute : start;
                  const length = Math.max(end - start, step);
                  const look = BOOKING_LOOK[booking.status];
                  const Icon = look.icon;
                  const places = by === 'rooms' ? column.capacity : 1;
                  const width = 100 / places;
                  const movable = canMove(booking);
                  return (
                    <button
                      key={booking.id}
                      type="button"
                      data-spa-booking={booking.member?.fullName ?? booking.id}
                      data-status={booking.status}
                      className={cn(
                        'absolute z-10 flex flex-col overflow-hidden rounded-xl px-2 py-1 text-start text-xs shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/60',
                        look.block,
                        movable && 'cursor-grab touch-none active:cursor-grabbing',
                        shown && 'z-30 opacity-90 shadow-lg ring-2 ring-primary',
                      )}
                      style={{
                        top: `calc(${String((top - first) / step)} * ${ROW} + 1px)`,
                        height: `calc(${String(length / step)} * ${ROW} - 2px)`,
                        insetInlineStart: `calc(${String((booking.place - 1) * width)}% + 2px)`,
                        width: `calc(${String(width)}% - 4px)`,
                      }}
                      onPointerDown={(event) => {
                        startDrag(event, booking);
                      }}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={() => {
                        drag.current = null;
                        setPreview(null);
                      }}
                      onClick={() => {
                        if (suppressClick.current) {
                          suppressClick.current = false;
                          return;
                        }
                        onOpen(booking.id);
                      }}
                    >
                      <span className="flex items-center gap-1 tabular-nums">
                        <Icon aria-hidden className="size-3.5 shrink-0" />
                        <span>
                          {clock(top)}–{clock(top + (end - start))}
                        </span>
                        <span className="sr-only">{t(`statuses.${booking.status}`)}</span>
                      </span>
                      <span className="truncate font-medium">
                        {booking.member?.fullName ?? t('details.unknownMember')}
                      </span>
                      <span className="truncate text-muted-foreground">
                        {localizedName(booking, language)}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
