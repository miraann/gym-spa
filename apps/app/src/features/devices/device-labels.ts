import { localizedName } from '@gym/i18n';
import { GlobeIcon, MonitorIcon, SmartphoneIcon, type LucideIcon } from 'lucide-react';
import type { DevicePlatform } from '@/features/auth/device-registration';
import { useAdminBranches } from '@/features/staff/admin-data';
import { usePreferences } from '@/lib/preferences';

/** Each platform's icon in the devices list and on a device's page. */
export const PLATFORM_ICONS: Readonly<Record<DevicePlatform, LucideIcon>> = {
  web: GlobeIcon,
  android: SmartphoneIcon,
  windows: MonitorIcon,
};

/** A branch's name in the current language, from the branches the acting staff member can see. */
export function useBranchName(): (branchId: string) => string {
  const { language } = usePreferences();
  const branches = useAdminBranches().data;
  return (branchId) => {
    const branch = branches?.find((each) => each.id === branchId);
    return branch ? localizedName(branch, language) : '';
  };
}
