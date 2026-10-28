import { formatMemberNumber } from '@gym/core';
import { localizedName } from '@gym/i18n';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Field, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Spinner } from '@gym/ui/components/spinner';
import { Link } from '@tanstack/react-router';
import { ListIcon, MonitorIcon, NfcIcon, TriangleAlertIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RequirePermission } from '@/components/no-access';
import { usePermission } from '@/features/auth/use-permissions';
import { BrowserReaderNotice } from '@/features/cards/card-scan';
import { useMemberSearch } from '@/features/members/member-data';
import { CheckinLocker } from '@/features/lockers/checkin-locker';
import { useAdminWriteState } from '@/features/staff/write-state';
import { StaffClockNotice } from '@/features/hr/staff-clock-notice';
import { usePreferences } from '@/lib/preferences';
import { useCheckinBranch } from './checkin-branch';
import { CheckinResultView } from './checkin-result';
import { CheckinError } from './checkin-error';
import { useCheckinFlow } from './use-checkin-flow';
import { OccupancyTile } from './visits-page';

/** /checkin (checkin.perform): reception checks members in by card, or by hand (checkin.manual). */
export function CheckinPage() {
  return (
    <RequirePermission permission="checkin.perform">
      <CheckinScreen />
    </RequirePermission>
  );
}

function CheckinScreen() {
  const { t } = useTranslation('checkin');
  const { language } = usePreferences();
  const { branchId, branch, pending } = useCheckinBranch();
  const flow = useCheckinFlow(branchId);
  const manual = usePermission('checkin.manual');
  const mayViewVisits = usePermission('attendance.view');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('page.title')}
        description={
          branch
            ? t('page.branch', { name: localizedName(branch, language) })
            : t('page.description')
        }
        actions={
          <Button variant="outline" asChild>
            <Link to="/checkin/door">
              <MonitorIcon />
              {t('page.kiosk')}
            </Link>
          </Button>
        }
      />
      {!pending && branchId === '' ? (
        <Alert>
          <TriangleAlertIcon />
          <AlertDescription>{t('page.noBranch')}</AlertDescription>
        </Alert>
      ) : (
        <>
          <div
            className="flex flex-col items-center gap-3 rounded-3xl bg-card p-8 text-center"
            data-testid="checkin-prompt"
          >
            {flow.pending ? (
              <Spinner className="size-16 text-primary" />
            ) : (
              <NfcIcon aria-hidden className="size-16 text-primary motion-safe:animate-pulse" />
            )}
            <p className="text-2xl">{flow.pending ? t('page.checking') : t('page.hold')}</p>
            <p className="text-muted-foreground">{t('page.holdHint')}</p>
          </div>
          <CheckinError error={flow.error} />
          {mayViewVisits && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex-1">
                <OccupancyTile branchId={branchId} />
              </div>
              <Button variant="outline" size="lg" asChild>
                <Link to="/checkin/visits">
                  <ListIcon />
                  {t('page.visits')}
                </Link>
              </Button>
            </div>
          )}
          <BrowserReaderNotice />
          {manual && <ManualCheckin onPick={flow.checkInMember} disabled={flow.pending} />}
        </>
      )}
      {flow.staff && <StaffClockNotice result={flow.staff} onClose={flow.closeStaff} />}
      {flow.answer && (
        <CheckinResultView
          answer={flow.answer}
          onClose={flow.close}
          onOverride={flow.override}
          overriding={flow.pending}
          actions={
            <CheckinLocker
              key={flow.answer.attendance_id ?? flow.answer.reason ?? ''}
              answer={flow.answer}
              branchId={branchId}
            />
          }
        />
      )}
    </div>
  );
}

/** Finding a member by name, number or phone, and checking them in (checkin.manual). */
function ManualCheckin({
  onPick,
  disabled,
}: {
  readonly onPick: (memberId: string) => void;
  readonly disabled: boolean;
}) {
  const { t } = useTranslation('checkin');
  const id = useId();
  const { online, readOnly } = useAdminWriteState();
  const [query, setQuery] = useState('');
  const found = useMemberSearch(query, query.trim().length > 1);
  const members = found.data?.members ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('manual.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Field>
          <FieldLabel htmlFor={`${id}-search`}>{t('manual.search')}</FieldLabel>
          <Input
            id={`${id}-search`}
            type="search"
            autoComplete="off"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        </Field>
        {found.isSuccess && members.length === 0 && (
          <p className="text-muted-foreground">{t('manual.none')}</p>
        )}
        {members.length > 0 && (
          <ul className="flex flex-col divide-y rounded-2xl border" aria-label={t('manual.title')}>
            {members.map((member) => (
              <li key={member.id} className="flex items-center gap-3 p-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{member.fullName}</span>
                  <span dir="ltr" className="self-start text-sm text-muted-foreground tabular-nums">
                    {formatMemberNumber(member.memberNumber)}
                  </span>
                </span>
                <Button
                  disabled={disabled || !online || readOnly}
                  aria-label={`${t('manual.checkIn')}: ${member.fullName}`}
                  onClick={() => {
                    onPick(member.id);
                    setQuery('');
                  }}
                >
                  {t('manual.checkIn')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {found.data?.more && <p className="text-sm text-muted-foreground">{t('manual.more')}</p>}
      </CardContent>
    </Card>
  );
}
