import type { MemberStatus } from '@gym/core';
import { Badge } from '@gym/ui/components/badge';
import { cn } from '@gym/ui/lib/utils';
import {
  ArchiveIcon,
  BanIcon,
  CirclePauseIcon,
  HeartPulseIcon,
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

/** The first letter of the name in a circle, until the member has a photo (step 2c). */
export function MemberAvatar({
  name,
  size = 'md',
}: {
  readonly name: string;
  readonly size?: 'md' | 'lg';
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground',
        size === 'lg' ? 'size-16 text-2xl' : 'size-10 text-base',
      )}
    >
      {Array.from(name.trim())[0] ?? ''}
    </span>
  );
}
