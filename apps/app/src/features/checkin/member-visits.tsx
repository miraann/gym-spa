import { localizedName } from '@gym/i18n';
import { Badge } from '@gym/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Skeleton } from '@gym/ui/components/skeleton';
import { BanIcon, HandIcon, NfcIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePermission } from '@/features/auth/use-permissions';
import type { Member } from '@/features/members/member-data';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { CheckinError } from './checkin-error';
import { checkinErrorKey } from './checkin-errors';
import { MEMBER_VISITS_SHOWN, useMemberVisits } from './visit-data';

/** The member's last visits in every branch, on their page (attendance.view). */
export function MemberVisitsCard({ member }: { readonly member: Member }) {
  const { t } = useTranslation('checkin');
  const format = useFormat();
  const { language } = usePreferences();
  const allowed = usePermission('attendance.view');
  const visits = useMemberVisits(member.id, allowed);
  if (!allowed) return null;

  return (
    <Card data-testid="member-visits">
      <CardHeader>
        <CardTitle>
          <h3>{t('memberVisits.title')}</h3>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {visits.isPending ? (
          <Skeleton className="h-20 w-full" />
        ) : visits.isError ? (
          <CheckinError error={checkinErrorKey(visits.error, 'load_member_visits')} />
        ) : visits.data.length === 0 ? (
          <p className="text-muted-foreground">{t('memberVisits.none')}</p>
        ) : (
          <>
            <ul className="flex flex-col divide-y">
              {visits.data.map((visit) => {
                const MethodIcon = visit.method === 'card' ? NfcIcon : HandIcon;
                const voided = visit.voidedAt !== null;
                return (
                  <li
                    key={visit.id}
                    className="flex flex-col gap-1 py-2"
                    data-member-visit={visit.id}
                  >
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={voided ? 'tabular-nums line-through' : 'tabular-nums'}>
                        {format.dateTime(visit.checkedInAt)}
                      </span>
                      {visit.inside && <Badge variant="secondary">{t('visits.inside')}</Badge>}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                      {visit.branch && <span>{localizedName(visit.branch, language)}</span>}
                      <span className="inline-flex items-center gap-1">
                        <MethodIcon aria-hidden className="size-4" />
                        {t(`visits.${visit.method}`)}
                      </span>
                      {visit.subscription && (
                        <span>{localizedName(visit.subscription, language)}</span>
                      )}
                    </span>
                    {visit.overrideNote && (
                      <span className="text-sm text-warning">
                        {t('visits.overridden', { note: visit.overrideNote })}
                      </span>
                    )}
                    {voided && (
                      <span className="inline-flex items-center gap-1 text-sm text-destructive">
                        <BanIcon aria-hidden className="size-4" />
                        {t('visits.voided', { reason: visit.voidReason ?? '' })}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {visits.data.length >= MEMBER_VISITS_SHOWN && (
              <p className="text-sm text-muted-foreground">
                {t('memberVisits.last', { count: MEMBER_VISITS_SHOWN })}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
