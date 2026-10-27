import { formatMemberNumber } from '@gym/core';
import { localizedName } from '@gym/i18n';
import { Chip, ChipRow } from '@gym/ui/blocks/chip-row';
import { GroupedList, GroupedListItem, GroupedListSkeleton } from '@gym/ui/blocks/list-group';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Badge } from '@gym/ui/components/badge';
import { Button } from '@gym/ui/components/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@gym/ui/components/empty';
import { Field, FieldError, FieldLabel } from '@gym/ui/components/field';
import { Textarea } from '@gym/ui/components/textarea';
import { Link } from '@tanstack/react-router';
import { BanIcon, DoorOpenIcon, HandIcon, NfcIcon, UsersIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { DateSelectField } from '@/components/date-select-field';
import { RequirePermission } from '@/components/no-access';
import { usePermission } from '@/features/auth/use-permissions';
import { useMemberThumbnails } from '@/features/members/member-data';
import { MemberPhotoImage } from '@/features/members/member-photo';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { useBaghdadToday } from '@/lib/use-today';
import { useCheckinBranch } from './checkin-branch';
import { checkinErrorKey, type CheckinErrorKey } from './checkin-errors';
import { CheckinError } from './checkin-error';
import {
  useCheckOut,
  useOccupancy,
  useVisits,
  useVoidVisit,
  VISITS_LIMIT,
  type Visit,
} from './visit-data';

/** /checkin/visits (attendance.view): a day's visits in the working branch, and who is inside now. */
export function VisitsPage() {
  return (
    <RequirePermission permission="attendance.view">
      <Visits />
    </RequirePermission>
  );
}

/** "Inside now", large, refreshed every half minute. */
export function OccupancyTile({ branchId }: { readonly branchId: string }) {
  const { t } = useTranslation('checkin');
  const format = useFormat();
  const occupancy = useOccupancy(branchId);
  return (
    <div className="flex items-center gap-4 rounded-3xl bg-card p-5" data-testid="occupancy">
      <UsersIcon aria-hidden className="size-8 text-primary" />
      <div className="flex flex-col">
        <span className="text-muted-foreground">{t('page.insideNow')}</span>
        <span className="text-4xl tabular-nums">
          {occupancy.data === undefined ? '–' : format.number(occupancy.data)}
        </span>
      </div>
    </div>
  );
}

function Visits() {
  const { t } = useTranslation('checkin');
  const today = useBaghdadToday();
  const thisYear = Number(today.slice(0, 4));
  const { branchId } = useCheckinBranch();
  const [date, setDate] = useState(today);
  const [insideOnly, setInsideOnly] = useState(false);
  const visits = useVisits(branchId, date, insideOnly);
  const thumbnails = useMemberThumbnails(visits.data?.map((visit) => visit.member) ?? []).data;
  const [voiding, setVoiding] = useState<Visit | null>(null);
  const [error, setError] = useState<CheckinErrorKey | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('visits.title')} description={t('visits.description')} />
      <OccupancyTile branchId={branchId} />
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="md:w-72">
          <DateSelectField
            label={t('visits.day')}
            value={date}
            onChange={setDate}
            years={[thisYear - 1, thisYear]}
            allowEmpty={false}
          />
        </div>
        <ChipRow label={t('visits.show')}>
          <Chip
            selected={!insideOnly}
            aria-pressed={!insideOnly}
            onClick={() => {
              setInsideOnly(false);
            }}
          >
            {t('visits.all')}
          </Chip>
          <Chip
            selected={insideOnly}
            aria-pressed={insideOnly}
            onClick={() => {
              setInsideOnly(true);
            }}
          >
            {t('visits.inside')}
          </Chip>
        </ChipRow>
      </div>
      <CheckinError error={error} />
      {visits.isPending ? (
        <GroupedListSkeleton rows={5} />
      ) : visits.isError ? (
        <CheckinError error={checkinErrorKey(visits.error, 'load_visits')} />
      ) : visits.data.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <DoorOpenIcon />
            </EmptyMedia>
            <EmptyDescription>{t('visits.none')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <GroupedList aria-label={t('visits.title')}>
            {visits.data.map((visit) => (
              <GroupedListItem key={visit.id}>
                <VisitRow
                  visit={visit}
                  thumbnail={thumbnails?.get(visit.member.id)}
                  onVoid={() => {
                    setVoiding(visit);
                  }}
                  onError={setError}
                />
              </GroupedListItem>
            ))}
          </GroupedList>
          {visits.data.length >= VISITS_LIMIT && (
            <p className="text-sm text-muted-foreground">
              {t('visits.limit', { count: VISITS_LIMIT })}
            </p>
          )}
        </>
      )}
      {voiding && (
        <VoidVisitDialog
          visit={voiding}
          onClose={() => {
            setVoiding(null);
          }}
        />
      )}
    </div>
  );
}

function VisitRow({
  visit,
  thumbnail,
  onVoid,
  onError,
}: {
  readonly visit: Visit;
  readonly thumbnail: Parameters<typeof MemberPhotoImage>[0]['image'];
  readonly onVoid: () => void;
  readonly onError: (error: CheckinErrorKey | null) => void;
}) {
  const { t } = useTranslation('checkin');
  const format = useFormat();
  const { language } = usePreferences();
  const { online, readOnly } = useAdminWriteState();
  const mayCheckOut = usePermission('checkin.perform');
  const mayVoid = usePermission('attendance.void');
  const checkOut = useCheckOut();
  const voided = visit.voidedAt !== null;
  const MethodIcon = visit.method === 'card' ? NfcIcon : HandIcon;

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3" data-visit={visit.member.fullName}>
      <MemberPhotoImage image={thumbnail} alt="" className="size-12 rounded-xl" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-x-2">
          <Link
            to="/members/$memberId"
            params={{ memberId: visit.member.id }}
            className={voided ? 'truncate line-through' : 'truncate'}
          >
            {visit.member.fullName}
          </Link>
          <span dir="ltr" className="text-sm text-muted-foreground tabular-nums">
            {formatMemberNumber(visit.member.memberNumber)}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span className="tabular-nums">{format.time(visit.checkedInAt)}</span>
          <span className="inline-flex items-center gap-1">
            <MethodIcon aria-hidden className="size-4" />
            {t(`visits.${visit.method}`)}
          </span>
          {visit.subscription && <span>{localizedName(visit.subscription, language)}</span>}
          {visit.checkedOutAt && (
            <span>{t('visits.left', { time: format.time(visit.checkedOutAt) })}</span>
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
      </div>
      {visit.inside && <Badge variant="secondary">{t('visits.inside')}</Badge>}
      <div
        className="flex gap-2"
        role="group"
        aria-label={t('visits.actions', { name: visit.member.fullName })}
      >
        {visit.inside && mayCheckOut && (
          <Button
            variant="outline"
            disabled={!online || readOnly || checkOut.isPending}
            onClick={() => {
              onError(null);
              checkOut.mutate(visit.id, {
                onSuccess: () => {
                  toast.success(t('visits.checkedOut', { name: visit.member.fullName }));
                },
                onError: (thrown) => {
                  onError(checkinErrorKey(thrown, 'check_out'));
                },
              });
            }}
          >
            {t('visits.checkOut')}
          </Button>
        )}
        {!voided && mayVoid && (
          <Button variant="ghost" disabled={!online || readOnly} onClick={onVoid}>
            {t('visits.void')}
          </Button>
        )}
      </div>
    </div>
  );
}

function VoidVisitDialog({
  visit,
  onClose,
}: {
  readonly visit: Visit;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('checkin');
  const id = useId();
  const voidVisit = useVoidVisit();
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<CheckinErrorKey | null>(null);
  const missing = reason.trim() === '';

  const confirm = () => {
    setSent(true);
    if (missing) return;
    setError(null);
    voidVisit.mutate(
      { visitId: visit.id, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(t('visits.voidDone'));
          onClose();
        },
        onError: (thrown) => {
          setError(checkinErrorKey(thrown, 'void_visit'));
        },
      },
    );
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('visits.voidTitle', { name: visit.member.fullName })}
      description={t('visits.voidDescription')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('visits.cancel')}
          </Button>
          <Button variant="destructive" disabled={voidVisit.isPending} onClick={confirm}>
            {t('visits.void')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <CheckinError error={error} />
        <Field data-invalid={(sent && missing) || undefined}>
          <FieldLabel htmlFor={`${id}-reason`}>{t('visits.voidReason')}</FieldLabel>
          <Textarea
            id={`${id}-reason`}
            value={reason}
            maxLength={300}
            aria-invalid={(sent && missing) || undefined}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
          {sent && missing && <FieldError>{t('override.noteRequired')}</FieldError>}
        </Field>
      </div>
    </ResponsiveDialog>
  );
}
