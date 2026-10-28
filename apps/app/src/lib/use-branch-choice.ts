import { useState } from 'react';
import { useMoneyBranch } from '@/features/payments/money-branch';
import { useAdminBranches } from '@/features/staff/admin-data';

/**
 * The branch a screen shows: chosen here, else this device's branch when the staff member works
 * there, else their first active one ('' when they have none).
 */
export function useBranchChoice() {
  const branches = useAdminBranches();
  const fallback = useMoneyBranch(branches.data);
  const [chosen, setChosen] = useState<string | null>(null);
  const active = (branches.data ?? []).filter((branch) => branch.isActive);
  const branchId =
    chosen !== null && active.some((branch) => branch.id === chosen) ? chosen : fallback;
  return { branchId, setBranchId: setChosen, active, loaded: branches.isSuccess };
}
