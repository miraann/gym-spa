import { MasterDetail } from '@gym/ui/blocks/master-detail';
import { Outlet, useRouterState } from '@tanstack/react-router';
import { RequirePermission } from '@/components/no-access';
import { MemberList } from './member-list';

/**
 * Members (members.view). The list alone takes the page (a table on wide screens); a member or
 * form opened from it sits beside a compact list when there is room, otherwise alone.
 */
export function MembersLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const detailOpen = pathname.replace(/\/$/, '') !== '/members';
  return (
    <RequirePermission permission="members.view">
      {detailOpen ? (
        <MasterDetail list={<MemberList layout="compact" />} detail={<Outlet />} detailOpen />
      ) : (
        <Outlet />
      )}
    </RequirePermission>
  );
}
