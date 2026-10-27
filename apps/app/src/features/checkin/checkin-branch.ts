import { useMoneyBranch } from '@/features/payments/money-branch';
import { useAdminBranches } from '@/features/staff/admin-data';

/** The branch members are checked in at: this device's, else the staff member's first. */
export function useCheckinBranch() {
  const branches = useAdminBranches();
  const branchId = useMoneyBranch(branches.data);
  const branch = branches.data?.find((each) => each.id === branchId);
  return { branchId, branch, pending: branches.isPending };
}
