import type { GymAccess } from '@gym/core';
import { Badge } from '@gym/ui/components/badge';
import { CircleCheckIcon, CirclePauseIcon, ClockAlertIcon, EyeIcon, LockIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GymRow } from '@/lib/api';

/** A gym's state as the panel shows it: suspended is read-only, but says so. */
export type GymState = GymAccess | 'suspended';

export function gymState(gym: Pick<GymRow, 'access' | 'suspended_at'>): GymState {
  const access = gym.access as GymAccess;
  if (access === 'read_only' && gym.suspended_at !== null) return 'suspended';
  return access;
}

const LOOK: Record<
  GymState,
  { variant: 'success' | 'warning' | 'destructive'; icon: typeof EyeIcon }
> = {
  active: { variant: 'success', icon: CircleCheckIcon },
  grace: { variant: 'warning', icon: ClockAlertIcon },
  read_only: { variant: 'destructive', icon: EyeIcon },
  suspended: { variant: 'destructive', icon: CirclePauseIcon },
  locked: { variant: 'destructive', icon: LockIcon },
};

/** The state with its status color, an icon and words (never color alone). */
export function GymStateBadge({ state }: { readonly state: GymState }) {
  const { t } = useTranslation('seller');
  const { variant, icon: Icon } = LOOK[state];
  return (
    <Badge variant={variant} data-gym-state={state}>
      <Icon aria-hidden="true" />
      {t(`state.${state}`)}
    </Badge>
  );
}
