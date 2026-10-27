import { imageDataUrl, type Membership, type MemberStatus, type StoredImage } from '@gym/core';
import { Badge } from '@gym/ui/components/badge';
import { cn } from '@gym/ui/lib/utils';
import {
  ArchiveIcon,
  BanIcon,
  CalendarXIcon,
  CircleDashedIcon,
  CirclePauseIcon,
  ClockIcon,
  HeartPulseIcon,
  SnowflakeIcon,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

const STATUS_BADGES: Readonly<
  Record<
    Exclude<MemberStatus, 'active'>,
    { variant: 'warning' | 'destructive' | 'secondary'; icon: LucideIcon }
  >
> = {
  suspended: { variant: 'warning', icon: CirclePauseIcon },
  banned: { variant: 'destructive', icon: BanIcon },
  archived: { variant: 'secondary', icon: ArchiveIcon },
};

/** A member's status when it isn't active: always an icon and a word, never color alone. */
export function MemberStatusBadge({ status }: { readonly status: MemberStatus }) {
  const { t } = useTranslation('members');
  if (status === 'active') return null;
  const { variant, icon: Icon } = STATUS_BADGES[status];
  return (
    <Badge variant={variant} data-member-status={status}>
      <Icon aria-hidden="true" />
      {t(`status.${status}`)}
    </Badge>
  );
}

const MEMBERSHIP_BADGES: Readonly<
  Record<
    Exclude<Membership, 'current'>,
    { variant: 'warning' | 'destructive' | 'secondary' | 'outline'; icon: LucideIcon }
  >
> = {
  frozen: { variant: 'warning', icon: SnowflakeIcon },
  upcoming: { variant: 'outline', icon: ClockIcon },
  expired: { variant: 'destructive', icon: CalendarXIcon },
  none: { variant: 'secondary', icon: CircleDashedIcon },
};

/**
 * What the member's subscriptions make them today (step 3g), when it isn't a current one: frozen,
 * not started yet, expired or none. Always an icon and a word.
 */
export function MembershipBadge({ membership }: { readonly membership: Membership | null }) {
  const { t } = useTranslation('members');
  if (membership === null || membership === 'current') return null;
  const { variant, icon: Icon } = MEMBERSHIP_BADGES[membership];
  return (
    <Badge variant={variant} data-membership={membership}>
      <Icon aria-hidden="true" />
      {t(`memberships.${membership}`)}
    </Badge>
  );
}

/** Tells staff the member has health notes, for those who can't read them too. */
export function HealthNotesBadge() {
  const { t } = useTranslation('members');
  return (
    <Badge variant="outline" data-health-notes="">
      <HeartPulseIcon aria-hidden="true" />
      {t('status.healthNotes')}
    </Badge>
  );
}

/** The member's photo (its thumbnail) in a circle, or the first letter of the name without one. */
export function MemberAvatar({
  name,
  image,
  size = 'md',
}: {
  readonly name: string;
  readonly image?: StoredImage | null;
  readonly size?: 'md' | 'lg';
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/12 font-bold text-primary',
        size === 'lg' ? 'size-20 text-3xl shadow-sm' : 'size-10 text-base',
      )}
    >
      {image ? (
        <img src={imageDataUrl(image)} alt="" className="size-full object-cover" />
      ) : (
        (Array.from(name.trim())[0] ?? '')
      )}
    </span>
  );
}
