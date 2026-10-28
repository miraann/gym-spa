import type { LockerStatus } from '@gym/core';
import {
  CalendarClockIcon,
  CircleCheckIcon,
  TriangleAlertIcon,
  UserIcon,
  WrenchIcon,
  type LucideIcon,
} from 'lucide-react';
import type { Locker, LockerHolder } from './locker-data';

/** How each status looks on the map: never by color alone, always with an icon and words. */
export const STATUS_LOOK: Record<LockerStatus, { icon: LucideIcon; tile: string }> = {
  free: { icon: CircleCheckIcon, tile: 'bg-card text-foreground' },
  occupied: { icon: UserIcon, tile: 'bg-primary text-primary-foreground' },
  reserved: {
    icon: CalendarClockIcon,
    tile: 'bg-card text-primary outline-2 -outline-offset-2 outline-dashed outline-primary',
  },
  overdue: { icon: TriangleAlertIcon, tile: 'bg-warning text-warning-foreground' },
  out_of_order: { icon: WrenchIcon, tile: 'bg-destructive/10 text-destructive' },
};

export interface MapLocker {
  readonly locker: Locker;
  readonly holder: LockerHolder | null;
  readonly status: LockerStatus;
}
