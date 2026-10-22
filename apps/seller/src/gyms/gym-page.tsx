import { GRACE_DAYS } from '@gym/core';
import { localizedName } from '@gym/i18n';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Link } from '@tanstack/react-router';
import {
  ArrowRightIcon,
  CirclePauseIcon,
  InfoIcon,
  LockIcon,
  PencilIcon,
  RotateCcwIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useGym, type GymRow, type GymStateAction } from '@/lib/api';
import { panelErrorKey } from '@/lib/errors';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { FormError } from '@/shell/form-error';
import { LogList } from '@/log/log-list';
import { GymStateDialog, LimitsDialog, RenameDialog, SubscriptionDialog } from './gym-dialogs';
import { GymStateBadge, gymState } from './gym-state';
import { gymNames } from './gyms-page';

const DAY_MS = 24 * 60 * 60 * 1000;

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-base tabular-nums">{children}</dd>
    </div>
  );
}

/** The staff login link of a gym: the gym app on this domain, with its code filled in. */
export function gymLoginLink(code: string): string {
  return `${window.location.origin}/?gym=${encodeURIComponent(code)}`;
}

type Open = 'subscription' | 'limits' | 'rename' | null;

function GymDetails({ gym }: { readonly gym: GymRow }) {
  const { t } = useTranslation('seller');
  const format = useFormat();
  const { language } = usePreferences();
  const [open, setOpen] = useState<Open>(null);
  const [stateAction, setStateAction] = useState<GymStateAction | null>(null);
  const state = gymState(gym);
  const online = gym.edition === 'online';
  const never = t('common.never');
  const when = (value: string | null) => (value === null ? never : format.dateTime(value));

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/gyms"
        className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowRightIcon className="size-4 ltr:rotate-180" aria-hidden="true" />
        {t('gym.back')}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl">{localizedName(gymNames(gym), language)}</h1>
            {online && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOpen('rename');
                }}
              >
                <PencilIcon data-icon="inline-start" />
                {t('gym.rename')}
              </Button>
            )}
          </span>
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <span dir="ltr" className="font-mono">
              {gym.code}
            </span>
            <GymStateBadge state={state} />
          </span>
        </div>
        {online && (
          <div className="flex flex-wrap gap-2">
            {(state === 'suspended' || state === 'locked') && (
              <Button
                onClick={() => {
                  setStateAction('reactivate');
                }}
              >
                <RotateCcwIcon data-icon="inline-start" />
                {t('gym.reactivate')}
              </Button>
            )}
            {state !== 'suspended' && state !== 'locked' && (
              <Button
                variant="outline"
                onClick={() => {
                  setStateAction('suspend');
                }}
              >
                <CirclePauseIcon data-icon="inline-start" />
                {t('gym.suspend')}
              </Button>
            )}
            {state !== 'locked' && (
              <Button
                variant="destructive"
                onClick={() => {
                  setStateAction('lock');
                }}
              >
                <LockIcon data-icon="inline-start" />
                {t('gym.lock')}
              </Button>
            )}
          </div>
        )}
      </div>

      {!online && (
        <Alert>
          <InfoIcon />
          <AlertDescription>{t('gym.offlineNote')}</AlertDescription>
        </Alert>
      )}
      {gym.state_reason && (
        <Alert variant="destructive">
          <InfoIcon />
          <AlertDescription>{t('gym.reason', { reason: gym.state_reason })}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>{t('gym.subscriptionTitle')}</CardTitle>
            {online && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setOpen('subscription');
                }}
              >
                {t('gym.changeSubscription')}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3">
              <Fact label={t('gym.paidUntil')}>
                {gym.paid_until === null
                  ? t('gyms.noEnd')
                  : format.date(Date.parse(gym.paid_until) - 1)}
              </Fact>
              {state === 'grace' && gym.paid_until !== null && (
                <Fact label={t('state.grace')}>
                  {t('gym.graceUntil', {
                    date: format.date(Date.parse(gym.paid_until) + GRACE_DAYS * DAY_MS - 1),
                  })}
                </Fact>
              )}
              <Fact label={t('gym.created')}>{format.date(gym.created_at)}</Fact>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('gym.usageTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <dl className="grid grid-cols-2 gap-3">
              <Fact label={t('gym.members')}>{format.number(gym.members)}</Fact>
              <Fact label={t('gym.activeMembers')}>{format.number(gym.active_members)}</Fact>
              <Fact label={t('gym.branches')}>{format.number(gym.active_branches)}</Fact>
              <Fact label={t('gym.staff')}>{format.number(gym.active_staff)}</Fact>
              <Fact label={t('gym.devices')}>{format.number(gym.active_devices)}</Fact>
              <Fact label={t('gym.lastLogin')}>{when(gym.last_login_at)}</Fact>
              <Fact label={t('gym.lastDevice')}>{when(gym.last_device_seen_at)}</Fact>
            </dl>
            <p className="text-sm text-muted-foreground">{t('gym.membersNote')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>{t('gym.limitsTitle')}</CardTitle>
            {online && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setOpen('limits');
                }}
              >
                {t('gym.changeLimits')}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3">
              <Fact label={t('gym.maxBranches')}>
                {gym.max_branches === null ? t('gym.noLimit') : format.number(gym.max_branches)}
              </Fact>
              <Fact label={t('gym.maxDevices')}>
                {gym.max_devices === null ? t('gym.noLimit') : format.number(gym.max_devices)}
              </Fact>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('gym.loginLink')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <code dir="ltr" className="rounded-xl bg-muted px-3 py-2 text-sm break-all select-all">
              {gymLoginLink(gym.code)}
            </code>
            <p className="text-sm text-muted-foreground">{t('gym.codeNote')}</p>
          </CardContent>
        </Card>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg">{t('gym.logTitle')}</h2>
        <LogList gymId={gym.id} />
      </section>

      {open === 'subscription' && (
        <SubscriptionDialog
          gym={gym}
          open
          onOpenChange={(value) => {
            if (!value) setOpen(null);
          }}
        />
      )}
      {open === 'limits' && (
        <LimitsDialog
          gym={gym}
          open
          onOpenChange={(value) => {
            if (!value) setOpen(null);
          }}
        />
      )}
      {open === 'rename' && (
        <RenameDialog
          gym={gym}
          open
          onOpenChange={(value) => {
            if (!value) setOpen(null);
          }}
        />
      )}
      <GymStateDialog
        gym={gym}
        action={stateAction}
        onClose={() => {
          setStateAction(null);
        }}
      />
    </div>
  );
}

export function GymPage({ gymId }: { readonly gymId: string }) {
  const { t } = useTranslation('seller');
  const gym = useGym(gymId);
  if (gym.isPending) return <Skeleton className="h-64 rounded-2xl" />;
  if (gym.isError) return <FormError error={panelErrorKey(gym.error)} />;
  if (gym.data === null) {
    return (
      <Alert>
        <InfoIcon />
        <AlertDescription>{t('gym.notFound')}</AlertDescription>
      </Alert>
    );
  }
  return <GymDetails gym={gym.data} />;
}
