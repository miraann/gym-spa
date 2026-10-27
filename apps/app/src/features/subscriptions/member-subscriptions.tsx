import { daysBetween, subscriptionState, type SubscriptionState } from '@gym/core';
import { localizedName } from '@gym/i18n';
import { Badge } from '@gym/ui/components/badge';
import { Button } from '@gym/ui/components/button';
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@gym/ui/components/card';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Link } from '@tanstack/react-router';
import {
  BanIcon,
  CalendarXIcon,
  CircleCheckIcon,
  ClockIcon,
  HandCoinsIcon,
  PlusIcon,
  RepeatIcon,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePermission } from '@/features/auth/use-permissions';
import type { Member } from '@/features/members/member-data';
import { usePlanSummary } from '@/features/plans/plan-summary';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { useBaghdadToday } from '@/lib/use-today';
import {
  useMemberDebt,
  useMemberSubscriptions,
  type MemberSubscription,
} from './subscription-data';
import { SubscriptionError } from './subscription-error';
import { subscriptionErrorKey } from './subscription-errors';

const STATE_BADGES: Readonly<
  Record<
    SubscriptionState,
    { variant: 'success' | 'destructive' | 'secondary' | 'outline'; icon: LucideIcon }
  >
> = {
  current: { variant: 'success', icon: CircleCheckIcon },
  upcoming: { variant: 'outline', icon: ClockIcon },
  expired: { variant: 'destructive', icon: CalendarXIcon },
  cancelled: { variant: 'secondary', icon: BanIcon },
  voided: { variant: 'secondary', icon: BanIcon },
  replaced: { variant: 'secondary', icon: RepeatIcon },
  transferred: { variant: 'secondary', icon: RepeatIcon },
};

/** What a subscription is today, always as an icon and a word, never color alone. */
export function SubscriptionStateBadge({ state }: { readonly state: SubscriptionState }) {
  const { t } = useTranslation('subscriptions');
  const { variant, icon: Icon } = STATE_BADGES[state];
  return (
    <Badge variant={variant} data-subscription-state={state}>
      <Icon aria-hidden="true" />
      {t(`states.${state}`)}
    </Badge>
  );
}

/**
 * A member's subscriptions on their page (step 3d): the current and upcoming ones, the earlier
 * ones folded away, what they owe (payments.view) and selling a new one (subscriptions.sell).
 */
export function MemberSubscriptionsCard({ member }: { readonly member: Member }) {
  const { t } = useTranslation('subscriptions');
  const format = useFormat();
  const today = useBaghdadToday();
  const canSell = usePermission('subscriptions.sell');
  const canSeeMoney = usePermission('payments.view');
  const subscriptions = useMemberSubscriptions(member.id);
  const debt = useMemberDebt(member.id, canSeeMoney);

  const withState = (subscriptions.data ?? []).map((subscription) => ({
    subscription,
    state: subscriptionState(subscription, today),
  }));
  const now = withState.filter(({ state }) => state === 'current' || state === 'upcoming');
  const earlier = withState.filter(({ state }) => state !== 'current' && state !== 'upcoming');

  return (
    <Card data-testid="member-subscriptions">
      <CardHeader>
        <CardTitle>{t('card.title')}</CardTitle>
        {canSell && member.status === 'active' && (
          <CardAction>
            <Button asChild variant="outline">
              <Link to="/members/$memberId/sell" params={{ memberId: member.id }}>
                <PlusIcon data-icon="inline-start" />
                {t('card.sell')}
              </Link>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {subscriptions.isPending ? (
          <Skeleton className="h-16 rounded-xl" />
        ) : subscriptions.isError ? (
          <SubscriptionError error={subscriptionErrorKey(subscriptions.error, 'load')} />
        ) : withState.length === 0 ? (
          <p className="text-muted-foreground">{t('card.empty')}</p>
        ) : (
          <>
            {now.length > 0 && (
              <ul className="flex flex-col gap-2">
                {now.map(({ subscription, state }) => (
                  <SubscriptionRow
                    key={subscription.id}
                    subscription={subscription}
                    state={state}
                  />
                ))}
              </ul>
            )}
            {earlier.length > 0 && (
              <details className="group" open={now.length === 0}>
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  {t('card.earlier')}
                </summary>
                <ul className="mt-2 flex flex-col gap-2">
                  {earlier.map(({ subscription, state }) => (
                    <SubscriptionRow
                      key={subscription.id}
                      subscription={subscription}
                      state={state}
                    />
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
        {canSell && member.status !== 'active' && (
          <p className="text-sm text-muted-foreground">{t('card.notActive')}</p>
        )}
      </CardContent>
      {canSeeMoney && debt.isSuccess && (
        <CardFooter>
          {debt.data > 0 ? (
            <Badge variant="destructive" data-testid="member-debt">
              <HandCoinsIcon aria-hidden="true" />
              <span className="tabular-nums">
                {t('card.owes', { amount: format.money(debt.data) })}
              </span>
            </Badge>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="member-debt">
              {t('card.noDebt')}
            </p>
          )}
        </CardFooter>
      )}
    </Card>
  );
}

function SubscriptionRow({
  subscription,
  state,
}: {
  readonly subscription: MemberSubscription;
  readonly state: SubscriptionState;
}) {
  const { t } = useTranslation('subscriptions');
  const { language } = usePreferences();
  const format = useFormat();
  const summary = usePlanSummary();
  const today = useBaghdadToday();

  let when: string;
  if (state === 'upcoming') {
    when = t('card.startsOn', { date: format.date(subscription.startDate) });
  } else if (state === 'expired' && subscription.endDate) {
    when = t('card.endedOn', { date: format.date(subscription.endDate) });
  } else if (state === 'current' && subscription.endDate) {
    const left = daysBetween(today, subscription.endDate);
    when =
      left === 0
        ? t('card.lastDay')
        : `${t('card.until', { date: format.date(subscription.endDate) })} · ${t('card.daysLeft', { count: format.number(left + 1) })}`;
  } else {
    when = t('card.since', { date: format.date(subscription.startDate) });
  }

  return (
    <li
      className="flex flex-col gap-1 rounded-xl bg-muted/50 p-3"
      data-subscription={subscription.nameCkb}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{localizedName(subscription, language)}</span>
        <SubscriptionStateBadge state={state} />
      </div>
      <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
        <span>{summary.length(subscription)}</span>
        <span aria-hidden="true">·</span>
        <span>{when}</span>
        {subscription.invoiceNumber && (
          <>
            <span aria-hidden="true">·</span>
            <span className="flex gap-1">
              {t('card.invoice')}
              <span dir="ltr" className="tabular-nums">
                {subscription.invoiceNumber}
              </span>
            </span>
          </>
        )}
      </p>
    </li>
  );
}
