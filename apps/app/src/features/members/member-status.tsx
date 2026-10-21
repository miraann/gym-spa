import { MEMBER_LIMITS, isCleanText, type MemberStatus } from '@gym/core';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Button } from '@gym/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Field, FieldError, FieldLabel } from '@gym/ui/components/field';
import { Spinner } from '@gym/ui/components/spinner';
import { Textarea } from '@gym/ui/components/textarea';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePermission } from '@/features/auth/use-permissions';
import { useAdminWriteState } from '@/features/staff/write-state';
import { WriteStateNotice } from '@/features/staff/write-state-notice';
import { useFormat } from '@/lib/format';
import { MemberStatusBadge } from './member-badges';
import { useSetMemberStatus, type Member } from './member-data';
import { memberErrorKey, type MemberErrorKey } from './member-errors';
import { MemberError } from './member-error';

/** What can be done from each status (members.delete). */
const NEXT_STATUSES: Readonly<Record<MemberStatus, readonly MemberStatus[]>> = {
  active: ['suspended', 'banned', 'archived'],
  suspended: ['active', 'banned', 'archived'],
  banned: ['active', 'archived'],
  archived: ['active'],
};

const ACTION_TEXTS = {
  suspended: { button: 'suspend', title: 'suspendTitle', description: 'suspendDescription' },
  banned: { button: 'ban', title: 'banTitle', description: 'banDescription' },
  archived: { button: 'archive', title: 'archiveTitle', description: 'archiveDescription' },
  active: { button: 'activate', title: 'activateTitle', description: 'activateDescription' },
} as const;

/**
 * The member's status and its reason, for everyone who sees the member. Staff with members.delete
 * suspend, ban, archive or reactivate here, with a reason (except to reactivate).
 */
export function MemberStatusCard({ member }: { readonly member: Member }) {
  const { t } = useTranslation('members');
  const format = useFormat();
  const canChange = usePermission('members.delete');
  const { online, readOnly } = useAdminWriteState();
  const [target, setTarget] = useState<MemberStatus | null>(null);

  if (!canChange && member.status === 'active') return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3>{t('statusActions.title')}</h3>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {member.status === 'active' ? (
            <span>{t('status.active')}</span>
          ) : (
            <MemberStatusBadge status={member.status} />
          )}
          {member.status !== 'active' && member.statusChangedAt !== null && (
            <span className="text-muted-foreground">
              {t('statusActions.changed', { date: format.date(member.statusChangedAt) })}
            </span>
          )}
        </div>
        {member.status !== 'active' && member.statusReason !== null && (
          <p className="text-sm">
            <span className="text-muted-foreground">{t('statusActions.reason')}: </span>
            <span data-testid="member-status-reason">{member.statusReason}</span>
          </p>
        )}
        {canChange && (
          <>
            <WriteStateNotice area="members" />
            <div className="flex flex-wrap gap-2">
              {NEXT_STATUSES[member.status].map((status) => (
                <Button
                  key={status}
                  variant={
                    status === 'active'
                      ? 'default'
                      : status === 'banned'
                        ? 'destructive'
                        : 'outline'
                  }
                  disabled={!online || readOnly}
                  onClick={() => {
                    setTarget(status);
                  }}
                >
                  {t(`statusActions.${ACTION_TEXTS[status].button}`)}
                </Button>
              ))}
            </div>
          </>
        )}
      </CardContent>
      {target !== null && (
        <StatusDialog
          member={member}
          status={target}
          onClose={() => {
            setTarget(null);
          }}
        />
      )}
    </Card>
  );
}

function StatusDialog({
  member,
  status,
  onClose,
}: {
  readonly member: Member;
  readonly status: MemberStatus;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('members');
  const { online } = useAdminWriteState();
  const setStatus = useSetMemberStatus();
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<'reasonRequired' | 'text' | null>(null);
  const [error, setError] = useState<MemberErrorKey | null>(null);
  const texts = ACTION_TEXTS[status];
  const needsReason = status !== 'active';

  const confirm = () => {
    const cleaned = reason.trim();
    if (needsReason && cleaned === '') {
      setReasonError('reasonRequired');
      return;
    }
    if (cleaned !== '' && !isCleanText(cleaned, MEMBER_LIMITS.statusReason)) {
      setReasonError('text');
      return;
    }
    setReasonError(null);
    setError(null);
    setStatus.mutate(
      { id: member.id, status, reason: needsReason ? cleaned : null },
      {
        onSuccess: () => {
          toast.success(t(`statusActions.done.${status}`, { name: member.fullName }));
          onClose();
        },
        onError: (thrown) => {
          setError(memberErrorKey(thrown, `status_${status}`));
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
      title={t(`statusActions.${texts.title}`, { name: member.fullName })}
      description={t(`statusActions.${texts.description}`)}
      footer={
        <>
          <Button
            variant={status === 'banned' || status === 'archived' ? 'destructive' : 'default'}
            disabled={!online || setStatus.isPending}
            onClick={confirm}
          >
            {setStatus.isPending && <Spinner />}
            {t(`statusActions.${texts.button}`)}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('statusActions.cancel')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {needsReason && (
          <Field data-invalid={reasonError !== null}>
            <FieldLabel htmlFor="member-status-reason">{t('statusActions.reason')}</FieldLabel>
            <Textarea
              id="member-status-reason"
              value={reason}
              maxLength={MEMBER_LIMITS.statusReason}
              aria-invalid={reasonError !== null}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
            {reasonError === 'reasonRequired' && (
              <FieldError>{t('statusActions.reasonRequired')}</FieldError>
            )}
            {reasonError === 'text' && <FieldError>{t('form.errors.text')}</FieldError>}
          </Field>
        )}
        <MemberError error={error} />
      </div>
    </ResponsiveDialog>
  );
}
