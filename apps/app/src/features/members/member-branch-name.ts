import { localizedName } from '@gym/i18n';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminBranches } from '@/features/staff/admin-data';
import { usePreferences } from '@/lib/preferences';

/**
 * Names the branches a member list shows. Members belong to the whole gym, so a member's home
 * branch can be one the staff member doesn't work in: that one is "another branch".
 */
export function useBranchName(): (branchId: string) => string {
  const { t } = useTranslation('members');
  const { language } = usePreferences();
  const { data } = useAdminBranches();
  return useCallback(
    (branchId: string) => {
      const branch = data?.find((each) => each.id === branchId);
      return branch ? localizedName(branch, language) : t('list.otherBranch');
    },
    [data, language, t],
  );
}
