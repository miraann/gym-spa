import { useAuthState } from '@/features/auth/auth-context';
import type { AdminBranch } from '@/features/staff/admin-data';

/**
 * Where money is taken: this device's branch when the staff member works there and it is active,
 * otherwise their first active branch ('' when they have none).
 */
export function useMoneyBranch(branches: readonly AdminBranch[] | undefined): string {
  const { branchId: deviceBranchId } = useAuthState();
  const active = (branches ?? []).filter((branch) => branch.isActive);
  return active.some((branch) => branch.id === deviceBranchId)
    ? (deviceBranchId ?? '')
    : (active[0]?.id ?? '');
}
