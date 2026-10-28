import { formatMemberNumber } from '@gym/core';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Button } from '@gym/ui/components/button';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePermission } from '@/features/auth/use-permissions';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import {
  EditLockerDialog,
  GiveLockerDialog,
  LostKeyDialog,
  OutOfOrderDialog,
  RemoveLockerDialog,
  RentLockerDialog,
  RenewLockerDialog,
} from './locker-actions';
import { useLockerHistory, useReleaseLocker, type LockerHolder } from './locker-data';
import { LockerError } from './locker-error';
import { lockerErrorKey, type LockerErrorKey } from './locker-errors';
import { STATUS_LOOK, type MapLocker } from './locker-look';

type Mode = 'details' | 'give' | 'rent' | 'renew' | 'lostKey' | 'outOfOrder' | 'remove' | 'edit';

/** One locker: who holds it, what staff may do with it, and its last holders. */
export function LockerDialog({
  item,
  branchId,
  onClose,
}: {
  readonly item: MapLocker;
  readonly branchId: string;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('lockers');
  const [mode, setMode] = useState<Mode>('details');
  const back = () => {
    setMode('details');
  };
  const { locker, holder } = item;

  switch (mode) {
    case 'give':
      return <GiveLockerDialog locker={locker} onBack={back} onDone={onClose} />;
    case 'rent':
      return (
        <RentLockerDialog locker={locker} branchId={branchId} onBack={back} onDone={onClose} />
      );
    case 'renew':
      return holder ? (
        <RenewLockerDialog
          locker={locker}
          holder={holder}
          branchId={branchId}
          onBack={back}
          onDone={onClose}
        />
      ) : null;
    case 'lostKey':
      return holder ? (
        <LostKeyDialog
          locker={locker}
          holder={holder}
          branchId={branchId}
          onBack={back}
          onDone={onClose}
        />
      ) : null;
    case 'outOfOrder':
      return <OutOfOrderDialog locker={locker} onBack={back} onDone={onClose} />;
    case 'remove':
      return <RemoveLockerDialog locker={locker} onBack={back} onDone={onClose} />;
    case 'edit':
      return <EditLockerDialog locker={locker} onBack={back} onDone={onClose} />;
    case 'details':
      return (
        <ResponsiveDialog
          open
          onOpenChange={(next) => {
            if (!next) onClose();
          }}
          title={t('details.title', { number: locker.number })}
          description={`${t(`zones.${locker.zone}`)} · ${t(`kinds.${locker.kind}`)}`}
          footer={
            <Button variant="outline" onClick={onClose}>
              {t('actions.close')}
            </Button>
          }
        >
          <LockerDetails item={item} onMode={setMode} onClose={onClose} />
        </ResponsiveDialog>
      );
  }
}

function LockerDetails({
  item,
  onMode,
  onClose,
}: {
  readonly item: MapLocker;
  readonly onMode: (mode: Mode) => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('lockers');
  const format = useFormat();
  const { online, readOnly } = useAdminWriteState();
  const mayAssign = usePermission('lockers.assign');
  const mayCharge = usePermission('payments.create');
  const mayManage = usePermission('lockers.manage');
  const release = useReleaseLocker();
  const [error, setError] = useState<LockerErrorKey | null>(null);
  const { locker, holder, status } = item;
  const look = STATUS_LOOK[status];
  const Icon = look.icon;
  const writable = online && !readOnly;

  return (
    <div className="flex flex-col gap-5" data-testid="locker-dialog">
      <div className="flex items-center gap-2">
        <Icon aria-hidden className="size-5" />
        <span>{t(`status.${status}`)}</span>
      </div>
      {locker.outOfOrderNote && (
        <p className="text-destructive">{t('details.note', { note: locker.outOfOrderNote })}</p>
      )}
      {holder && (
        <div className="flex flex-col gap-1 rounded-2xl bg-muted p-4">
          {holder.member ? (
            <Link
              to="/members/$memberId"
              params={{ memberId: holder.member.id }}
              className="text-lg"
            >
              {holder.member.fullName}
              <span dir="ltr" className="ms-2 text-sm text-muted-foreground tabular-nums">
                {formatMemberNumber(holder.member.memberNumber)}
              </span>
            </Link>
          ) : (
            <span>{t('details.unknownMember')}</span>
          )}
          <span className="text-sm text-muted-foreground">
            {holder.kind === 'daily'
              ? t('details.dailySince', { time: format.dateTime(holder.assignedAt) })
              : t('details.rentedFor', {
                  from: format.date(holder.startsOn),
                  until: format.date(holder.endsOn ?? holder.startsOn),
                })}
          </span>
        </div>
      )}
      <LockerError error={error} />
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('details.actions')}>
        {status === 'free' && mayAssign && locker.kind === 'daily' && (
          <Button
            disabled={!writable}
            onClick={() => {
              onMode('give');
            }}
          >
            {t('actions.give')}
          </Button>
        )}
        {status === 'free' && mayAssign && mayCharge && locker.kind === 'rented' && (
          <Button
            disabled={!writable}
            onClick={() => {
              onMode('rent');
            }}
          >
            {t('actions.rent')}
          </Button>
        )}
        {holder && mayAssign && (
          <Button
            variant={holder.kind === 'daily' ? 'default' : 'outline'}
            disabled={!writable || release.isPending}
            onClick={() => {
              setError(null);
              release.mutate(holder.id, {
                onSuccess: () => {
                  toast.success(t('release.done', { number: locker.number }));
                  onClose();
                },
                onError: (thrown) => {
                  setError(lockerErrorKey(thrown, 'release'));
                },
              });
            }}
          >
            {t('actions.release')}
          </Button>
        )}
        {holder?.kind === 'rented' && mayAssign && mayCharge && (
          <Button
            disabled={!writable}
            onClick={() => {
              onMode('renew');
            }}
          >
            {t('actions.renew')}
          </Button>
        )}
        {holder && mayAssign && mayCharge && (
          <Button
            variant="outline"
            disabled={!writable}
            onClick={() => {
              onMode('lostKey');
            }}
          >
            {t('actions.lostKey')}
          </Button>
        )}
        {mayManage && holder === null && (
          <Button
            variant="outline"
            disabled={!writable}
            onClick={() => {
              onMode('outOfOrder');
            }}
          >
            {locker.outOfOrderNote ? t('actions.backInOrder') : t('actions.outOfOrder')}
          </Button>
        )}
        {mayManage && (
          <Button
            variant="ghost"
            disabled={!writable}
            onClick={() => {
              onMode('edit');
            }}
          >
            {t('actions.edit')}
          </Button>
        )}
        {mayManage && holder === null && (
          <Button
            variant="ghost"
            disabled={!writable}
            onClick={() => {
              onMode('remove');
            }}
          >
            {t('actions.remove')}
          </Button>
        )}
      </div>
      <LockerHistory lockerId={locker.id} />
    </div>
  );
}

function LockerHistory({ lockerId }: { readonly lockerId: string }) {
  const { t } = useTranslation('lockers');
  const history = useLockerHistory(lockerId);
  const past = (history.data ?? []).filter((each) => each.releasedAt !== null);

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-muted-foreground">{t('details.history')}</h3>
      {history.isPending ? (
        <Skeleton className="h-16 rounded-xl" />
      ) : past.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('details.historyEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {past.map((each) => (
            <HistoryRow key={each.id} holder={each} />
          ))}
        </ul>
      )}
    </section>
  );
}

function HistoryRow({ holder }: { readonly holder: LockerHolder }) {
  const { t } = useTranslation('lockers');
  const format = useFormat();
  return (
    <li className="flex flex-col rounded-xl bg-muted/60 px-3 py-2 text-sm">
      <span>{holder.member?.fullName ?? t('details.unknownMember')}</span>
      <span className="text-muted-foreground">
        {t(`kinds.${holder.kind}`)} · {format.date(holder.assignedAt)}
        {holder.releasedAt && ` – ${format.date(holder.releasedAt)}`}
        {holder.releaseReason &&
          ` · ${t(holder.releasedAutomatically ? 'releaseReasons.night' : `releaseReasons.${holder.releaseReason}`)}`}
      </span>
    </li>
  );
}
