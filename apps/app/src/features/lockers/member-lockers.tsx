import { lockerStatus } from '@gym/core';
import { Card, CardContent, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { usePermission } from '@/features/auth/use-permissions';
import type { Member } from '@/features/members/member-data';
import { useFormat } from '@/lib/format';
import { useBaghdadToday } from '@/lib/use-today';
import { useMemberLockers } from './locker-data';
import { STATUS_LOOK } from './locker-look';

/** The lockers a member holds now, on their page (lockers.view); nothing when they hold none. */
export function MemberLockersCard({ member }: { readonly member: Member }) {
  const { t } = useTranslation('lockers');
  const format = useFormat();
  const today = useBaghdadToday();
  const allowed = usePermission('lockers.view');
  const lockers = useMemberLockers(member.id, allowed);
  if (!allowed || !lockers.data || lockers.data.length === 0) return null;

  return (
    <Card data-testid="member-lockers">
      <CardHeader>
        <CardTitle>
          <h3>{t('memberLockers.title')}</h3>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {lockers.data.map((holder) => {
            const status = lockerStatus(false, holder, today);
            const Icon = STATUS_LOOK[status].icon;
            return (
              <li key={holder.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <Link to="/lockers" className="text-lg">
                  {t('details.title', { number: holder.number })}
                </Link>
                <span className="text-sm text-muted-foreground">
                  {holder.kind === 'daily'
                    ? t('details.dailySince', { time: format.dateTime(holder.assignedAt) })
                    : t('details.rentedFor', {
                        from: format.date(holder.startsOn),
                        until: format.date(holder.endsOn ?? holder.startsOn),
                      })}
                </span>
                {status !== 'occupied' && (
                  <span className="inline-flex items-center gap-1 text-sm">
                    <Icon aria-hidden className="size-4" />
                    {t(`status.${status}`)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
