import type { SpaBookingStatus } from '@gym/core';
import {
  CalendarCheckIcon,
  CalendarClockIcon,
  CircleCheckIcon,
  CircleXIcon,
  UserCheckIcon,
  UserXIcon,
  type LucideIcon,
} from 'lucide-react';

/**
 * How a booking of each status looks on the calendar: a tone and an icon, always with the status
 * in words too (never color alone). Green is the client arriving; nothing else uses the status
 * colors.
 */
export const BOOKING_LOOK: Record<
  SpaBookingStatus,
  { readonly icon: LucideIcon; readonly block: string }
> = {
  booked: { icon: CalendarClockIcon, block: 'bg-card text-foreground ring-1 ring-border' },
  confirmed: {
    icon: CalendarCheckIcon,
    block: 'bg-primary/12 text-foreground ring-1 ring-primary/40',
  },
  arrived: { icon: UserCheckIcon, block: 'bg-success/15 text-foreground ring-1 ring-success/50' },
  completed: { icon: CircleCheckIcon, block: 'bg-muted text-muted-foreground' },
  no_show: { icon: UserXIcon, block: 'bg-muted text-muted-foreground line-through' },
  cancelled: { icon: CircleXIcon, block: 'bg-muted text-muted-foreground line-through' },
};
