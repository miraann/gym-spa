import { ageOn, formatMemberNumber, formatMemberPhone } from '@gym/core';
import { LANGUAGES } from '@gym/i18n';
import { StickyActionBar } from '@gym/ui/blocks/sticky-action-bar';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Badge } from '@gym/ui/components/badge';
import { Button } from '@gym/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@gym/ui/components/empty';
import { Skeleton } from '@gym/ui/components/skeleton';
import { useLayout } from '@gym/ui/hooks/use-layout';
import { useSideBySide } from '@gym/ui/hooks/use-side-by-side';
import { Link, useParams } from '@tanstack/react-router';
import { ArchiveIcon, HeartPulseIcon, PencilIcon, SearchXIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermission } from '@/features/auth/use-permissions';
import { BackToList } from '@/features/staff/admin-error';
import { useFormat } from '@/lib/format';
import { useBaghdadToday } from '@/lib/use-today';
import { HealthNotesBadge, MemberAvatar, MemberStatusBadge } from './member-badges';
import { useBranchName } from './member-branch-name';
import { useMember, useMemberHealth, type Member } from './member-data';
import { memberErrorKey } from './member-errors';
import { MemberError } from './member-error';
import { MemberStatusCard } from './member-status';

/** One member: who they are, their health info (for those allowed), and their status. */
export function MemberPage() {
  const { memberId } = useParams({ from: '/members/$memberId/' });
  const member = useMember(memberId);

  if (member.isPending) return <Skeleton className="h-96 rounded-3xl" />;
  if (member.isError) return <MemberError error={memberErrorKey(member.error, 'load')} />;
  if (member.data === null) return <MemberNotFound />;
  return <MemberProfile key={member.data.id} member={member.data} />;
}

export function MemberNotFound() {
  const { t } = useTranslation('members');
  return (
    <div className="flex flex-col gap-4">
      <BackToList to="/members" label={t('list.back')} />
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon />
          </EmptyMedia>
          <EmptyDescription>{t('detail.notFound')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

function MemberProfile({ member }: { readonly member: Member }) {
  const { t } = useTranslation('members');
  const sideBySide = useSideBySide();
  const phone = useLayout() === 'phone';
  const canEdit = usePermission('members.edit') && member.status !== 'archived';
  const Heading = sideBySide ? 'h2' : 'h1';

  const editButton = canEdit && (
    <Button asChild size="lg" variant={phone ? 'default' : 'outline'}>
      <Link
        to="/members/$memberId/edit"
        params={{ memberId: member.id }}
        search={(previous) => previous}
      >
        <PencilIcon data-icon="inline-start" />
        {t('detail.edit')}
      </Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-4" data-member-page={formatMemberNumber(member.memberNumber)}>
      <BackToList to="/members" label={t('list.back')} />
      <div className="flex flex-wrap items-center gap-4">
        <MemberAvatar name={member.fullName} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Heading className="text-2xl">{member.fullName}</Heading>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{t('detail.number')}</span>
            <span
              dir="ltr"
              className="text-base text-foreground tabular-nums"
              data-testid="member-number"
            >
              {formatMemberNumber(member.memberNumber)}
            </span>
            <MemberStatusBadge status={member.status} />
            {member.hasHealthNotes && <HealthNotesBadge />}
          </p>
        </div>
        {!phone && editButton}
      </div>

      {member.status === 'archived' && (
        <Alert>
          <ArchiveIcon />
          <AlertDescription>{t('detail.archivedNotice')}</AlertDescription>
        </Alert>
      )}

      <MemberDetails member={member} />
      <HealthCard member={member} />
      <MemberStatusCard member={member} />

      {phone && editButton && <StickyActionBar>{editButton}</StickyActionBar>}
    </div>
  );
}

function Detail({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

/** The profile as a list: the main facts always, the optional ones when they are filled in. */
function MemberDetails({ member }: { readonly member: Member }) {
  const { t } = useTranslation('members');
  const format = useFormat();
  const branchName = useBranchName();
  const today = useBaghdadToday();
  const language = LANGUAGES[member.preferredLanguage];
  return (
    <dl className="grid gap-4 rounded-2xl bg-card p-4 text-sm ring-1 ring-border sm:grid-cols-2">
      <Detail label={t('detail.phone')}>
        {member.phone === null ? (
          t('detail.noPhone')
        ) : (
          <span dir="ltr" className="tabular-nums">
            {formatMemberPhone(member.phone)}
          </span>
        )}
      </Detail>
      <Detail label={t('detail.emergency')}>
        {member.emergencyContactName === null && member.emergencyPhone === null ? (
          t('detail.notSet')
        ) : (
          <span className="flex flex-wrap gap-x-2">
            {member.emergencyContactName !== null && <span>{member.emergencyContactName}</span>}
            {member.emergencyPhone !== null && (
              <span dir="ltr" className="tabular-nums">
                {formatMemberPhone(member.emergencyPhone)}
              </span>
            )}
          </span>
        )}
      </Detail>
      <Detail label={t('detail.birthDate')}>
        {member.birthDate === null
          ? t('detail.notSet')
          : `${format.date(member.birthDate)} (${t('detail.age', {
              years: format.number(ageOn(member.birthDate, today)),
            })})`}
      </Detail>
      <Detail label={t('detail.gender')}>{t(`gender.${member.gender}`)}</Detail>
      <Detail label={t('detail.branch')}>{branchName(member.branchId)}</Detail>
      <Detail label={t('detail.joined')}>{format.date(member.createdAt)}</Detail>
      <Detail label={t('detail.language')}>
        <span lang={member.preferredLanguage} dir={language.dir}>
          {language.nativeName}
        </span>
      </Detail>
      {member.referralSource !== null && (
        <Detail label={t('detail.referral')}>{t(`referral.${member.referralSource}`)}</Detail>
      )}
      {member.address !== null && <Detail label={t('detail.address')}>{member.address}</Detail>}
      {member.goals !== null && (
        <Detail label={t('detail.goals')}>
          <span className="whitespace-pre-line">{member.goals}</span>
        </Detail>
      )}
      {member.notes !== null && (
        <Detail label={t('detail.notes')}>
          <span className="whitespace-pre-line">{member.notes}</span>
        </Detail>
      )}
      {member.tags.length > 0 && (
        <Detail label={t('detail.tags')}>
          <span className="flex flex-wrap gap-1">
            {member.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </span>
        </Detail>
      )}
    </dl>
  );
}

/**
 * Health info for staff with members.medical.view; for everyone else only that there is some, so
 * they know to ask.
 */
function HealthCard({ member }: { readonly member: Member }) {
  const { t } = useTranslation('members');
  const canRead = usePermission('members.medical.view');
  const health = useMemberHealth(member.id, canRead);

  if (!canRead) {
    if (!member.hasHealthNotes) return null;
    return (
      <Alert>
        <HeartPulseIcon />
        <AlertDescription>{t('detail.healthHidden')}</AlertDescription>
      </Alert>
    );
  }
  return (
    <Card data-testid="member-health">
      <CardHeader>
        <CardTitle>
          <h3>{t('detail.health')}</h3>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {health.isPending ? (
          <Skeleton className="h-16 rounded-xl" />
        ) : health.isError ? (
          <MemberError error={memberErrorKey(health.error, 'health')} />
        ) : health.data === null ||
          (health.data.bloodType === null &&
            health.data.medicalNotes === null &&
            health.data.injuries === null) ? (
          <p className="text-sm text-muted-foreground">{t('detail.noHealth')}</p>
        ) : (
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {health.data.bloodType !== null && (
              <Detail label={t('form.bloodType')}>
                <span dir="ltr">{health.data.bloodType}</span>
              </Detail>
            )}
            {health.data.medicalNotes !== null && (
              <Detail label={t('form.medicalNotes')}>
                <span className="whitespace-pre-line">{health.data.medicalNotes}</span>
              </Detail>
            )}
            {health.data.injuries !== null && (
              <Detail label={t('form.injuries')}>
                <span className="whitespace-pre-line">{health.data.injuries}</span>
              </Detail>
            )}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
