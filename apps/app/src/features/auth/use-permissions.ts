import { useMemo } from 'react';
import { useActiveAccount } from './auth-context';

/**
 * What the active staff member may do, from their last check with the server (at unlock and every
 * few minutes). Only for showing and hiding things: the server checks every request again.
 */
export function usePermissions(): ReadonlySet<string> {
  const permissions = useActiveAccount()?.permissions;
  return useMemo(() => new Set(permissions ?? []), [permissions]);
}

export function usePermission(permission: string): boolean {
  return usePermissions().has(permission);
}
