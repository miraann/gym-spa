import { usePermissions } from '@/features/auth/use-permissions';

/** Whether the staff member gets any of the bell's notifications. */
export function useHasBell(): boolean {
  const permissions = usePermissions();
  return permissions.has('notifications.send') || permissions.has('inventory.adjust');
}
