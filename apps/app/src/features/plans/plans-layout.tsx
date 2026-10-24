import { localizedName } from '@gym/i18n';
import {
  GroupedList,
  GroupedListItem,
  GroupedListSkeleton,
  RowChevron,
} from '@gym/ui/blocks/list-group';
import { MasterDetail } from '@gym/ui/blocks/master-detail';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { Badge } from '@gym/ui/components/badge';
import { Button } from '@gym/ui/components/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from '@gym/ui/components/empty';
import { groupedRowClass } from '@gym/ui/lib/grouped-list';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { CircleOffIcon, ClipboardListIcon, PlusIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { RequirePermission } from '@/components/no-access';
import { usePreferences } from '@/lib/preferences';
import { usePlans, type Plan } from './plan-data';
import { PlanError } from './plan-error';
import { planErrorKey } from './plan-errors';
import { usePlanSummary } from './plan-summary';

/** Plans (plans.manage): the list, and the plan or form open from it. */
export function PlansLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const detailOpen = pathname.replace(/\/$/, '') !== '/plans';
  return (
    <RequirePermission permission="plans.manage">
      <MasterDetail list={<PlanList />} detail={<Outlet />} detailOpen={detailOpen} />
    </RequirePermission>
  );
}

function PlanList() {
  const { t } = useTranslation('plans');
  const plans = usePlans();
  const onSale = plans.data?.filter((plan) => plan.isActive) ?? [];
  const offSale = plans.data?.filter((plan) => !plan.isActive) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('list.title')}
        description={t('list.description')}
        actions={
          <Button asChild size="lg">
            <Link to="/plans/new">
              <PlusIcon data-icon="inline-start" />
              {t('list.add')}
            </Link>
          </Button>
        }
      />
      {plans.isPending ? (
        <GroupedListSkeleton rows={4} />
      ) : plans.isError ? (
        <PlanError error={planErrorKey(plans.error, 'load_plans')} />
      ) : plans.data.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardListIcon />
            </EmptyMedia>
            <EmptyDescription>{t('list.empty')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link to="/plans/new">
                <PlusIcon data-icon="inline-start" />
                {t('list.add')}
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <PlanGroup label={t('list.title')} plans={onSale} />
          {offSale.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="px-1 text-sm text-muted-foreground">{t('list.offSale')}</h2>
              <PlanGroup label={t('list.offSale')} plans={offSale} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function PlanGroup({ label, plans }: { readonly label: string; readonly plans: readonly Plan[] }) {
  const { t } = useTranslation('plans');
  const { language } = usePreferences();
  const summary = usePlanSummary();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (plans.length === 0) return null;

  return (
    <GroupedList aria-label={label}>
      {plans.map((plan) => {
        const selected = pathname === `/plans/${plan.id}`;
        const limits = summary.limits(plan);
        return (
          <GroupedListItem key={plan.id}>
            <Link
              to="/plans/$planId"
              params={{ planId: plan.id }}
              aria-current={selected ? 'page' : undefined}
              data-plan={plan.nameCkb}
              className={groupedRowClass(selected)}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{localizedName(plan, language)}</span>
                  <span className="shrink-0 tabular-nums">{summary.price(plan)}</span>
                </span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  <span>{summary.length(plan)}</span>
                  {limits.map((limit) => (
                    <span key={limit} className="flex items-center gap-2">
                      <span aria-hidden="true">·</span>
                      {limit}
                    </span>
                  ))}
                  {!plan.isActive && (
                    <Badge variant="secondary">
                      <CircleOffIcon aria-hidden="true" />
                      {t('status.offSale')}
                    </Badge>
                  )}
                </span>
              </span>
              <RowChevron />
            </Link>
          </GroupedListItem>
        );
      })}
    </GroupedList>
  );
}

/** Beside the list before a plan is chosen. */
export function PlanPlaceholder() {
  const { t } = useTranslation('plans');
  return (
    <Empty className="min-h-64 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ClipboardListIcon />
        </EmptyMedia>
        <EmptyDescription>{t('list.choose')}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
