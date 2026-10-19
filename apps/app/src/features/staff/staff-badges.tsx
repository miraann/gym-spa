import { Badge } from '@gym/ui/components/badge';
import { CircleOffIcon, KeyRoundIcon, LockIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { StaffMember } from './admin-data';

/** A staff member's state that needs attention; status always as icon and text, never color alone. */
export function StaffBadges({ member }: { readonly member: StaffMember }) {
  const { t } = useTranslation('staff');
  return (
    <>
      {!member.isActive && (
        <Badge variant="destructive">
          <CircleOffIcon aria-hidden="true" />
          {t('status.inactive')}
        </Badge>
      )}
      {member.isActive && member.pinLocked && (
        <Badge variant="warning">
          <LockIcon aria-hidden="true" />
          {t('status.pinLocked')}
        </Badge>
      )}
      {member.isActive && member.mustChangePassword && (
        <Badge variant="secondary">
          <KeyRoundIcon aria-hidden="true" />
          {t('status.mustChangePassword')}
        </Badge>
      )}
    </>
  );
}
