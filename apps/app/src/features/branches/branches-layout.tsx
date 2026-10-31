import { localizedName } from '@gym/i18n';
import { AddTile } from '@gym/ui/blocks/add-tile';
import { MasterDetail } from '@gym/ui/blocks/master-detail';
import {
  GroupedList,
  GroupedListItem,
  GroupedListSkeleton,
  RowChevron,
} from '@gym/ui/blocks/list-group';
import { groupedRowClass } from '@gym/ui/lib/grouped-list';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { Badge } from '@gym/ui/components/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@gym/ui/components/empty';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { Building2Icon, CircleOffIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { RequirePermission } from '@/components/no-access';
import { useActiveAccount } from '@/features/auth/auth-context';
import { useGymLimits } from '@/features/staff/admin-data';
import { adminErrorKey } from '@/features/staff/admin-errors';
import { AdminError } from '@/features/staff/admin-error';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { useBranchDetails } from './branch-data';

/** Branches (branches.manage): the list, and the branch or form open from it. */
export function BranchesLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const detailOpen = pathname.replace(/\/$/, '') !== '/branches';
  return (
    <RequirePermission permission="branches.manage">
      <MasterDetail list={<BranchList />} detail={<Outlet />} detailOpen={detailOpen} />
    </RequirePermission>
  );
}

/** "Active branches: 3 of 5" when the gym has a limit. */
export function LimitLine({ kind }: { readonly kind: 'branches' | 'devices' }) {
  const { t } = useTranslation('branches');
  const format = useFormat();
  const limits = useGymLimits().data;
  const max = kind === 'branches' ? limits?.maxBranches : limits?.maxDevices;
  if (limits == null || max == null) return null;
  const used = kind === 'branches' ? limits.activeBranches : limits.activeDevices;
  return (
    <p className="text-sm text-muted-foreground tabular-nums" data-testid={`${kind}-limit`}>
      {t(kind === 'branches' ? 'limits.branches' : 'limits.devices', {
        used: format.number(used),
        max: format.number(max),
      })}
    </p>
  );
}

function BranchList() {
  const { t } = useTranslation('branches');
  const { language } = usePreferences();
  const account = useActiveAccount();
  const branches = useBranchDetails();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('list.title')} description={t('list.description')} />
      <LimitLine kind="branches" />
      {account?.allBranches && (
        <AddTile asChild label={t('list.add')}>
          <Link to="/branches/new" />
        </AddTile>
      )}
      {branches.isPending ? (
        <GroupedListSkeleton rows={3} />
      ) : branches.isError ? (
        <AdminError error={adminErrorKey(branches.error, 'branches')} />
      ) : (
        <GroupedList aria-label={t('list.title')}>
          {branches.data.map((branch) => {
            const selected = pathname === `/branches/${branch.id}`;
            return (
              <GroupedListItem key={branch.id}>
                <Link
                  to="/branches/$branchId"
                  params={{ branchId: branch.id }}
                  aria-current={selected ? 'page' : undefined}
                  data-branch={branch.code}
                  className={groupedRowClass(selected)}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">
                        {localizedName(branch, language)}
                      </span>
                      {!branch.isActive && (
                        <Badge variant="destructive">
                          <CircleOffIcon aria-hidden="true" />
                          {t('status.inactive')}
                        </Badge>
                      )}
                    </span>
                    <span className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
                      <span dir="ltr" className="font-mono">
                        {branch.code}
                      </span>
                      {branch.phone && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span dir="ltr">{branch.phone}</span>
                        </>
                      )}
                    </span>
                  </span>
                  <RowChevron />
                </Link>
              </GroupedListItem>
            );
          })}
        </GroupedList>
      )}
    </div>
  );
}

/** Beside the list before a branch is chosen. */
export function BranchPlaceholder() {
  const { t } = useTranslation('branches');
  return (
    <Empty className="min-h-64 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Building2Icon />
        </EmptyMedia>
        <EmptyDescription>{t('list.choose')}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
