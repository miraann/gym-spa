import { MasterDetail } from '@gym/ui/blocks/master-detail';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@gym/ui/components/empty';
import { Outlet, useRouterState } from '@tanstack/react-router';
import { UserCogIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { RequirePermission } from '@/components/no-access';
import { StaffList } from './staff-list';

/** Staff (staff.view): the list, and the staff member or form open from it. */
export function StaffLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const detailOpen = pathname.replace(/\/$/, '') !== '/staff';
  return (
    <RequirePermission permission="staff.view">
      <MasterDetail list={<StaffList />} detail={<Outlet />} detailOpen={detailOpen} />
    </RequirePermission>
  );
}

/** Beside the list before anyone is chosen. */
export function StaffPlaceholder() {
  const { t } = useTranslation('staff');
  return (
    <Empty className="min-h-64 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <UserCogIcon />
        </EmptyMedia>
        <EmptyDescription>{t('list.choose')}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
