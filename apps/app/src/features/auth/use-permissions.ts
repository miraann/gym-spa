import { resolvePermissions } from '@gym/core';
import { useQuery } from '@powersync/react';
import { useMemo } from 'react';
import { useActiveAccount } from './auth-context';

interface RoleRow {
  role_key: string;
  /** JSON arrays */
  keys: string;
  catalog: string;
}

function parseKeys(json: string): string[] {
  const value: unknown = JSON.parse(json);
  return Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string') : [];
}

/**
 * What the active staff member may do, from the synced role permissions (so a role change shows
 * up as soon as it syncs). Before the role has synced, the copy from their last online check is
 * used. Only for showing and hiding things: the server checks every change again.
 */
export function usePermissions(): ReadonlySet<string> {
  const account = useActiveAccount();
  const roleId = account?.roleId ?? '';
  const { data } = useQuery<RoleRow>(
    `SELECT r.key AS role_key,
            (SELECT json_group_array(permission_key) FROM role_permissions WHERE role_id = r.id) AS keys,
            (SELECT json_group_array(id) FROM permissions) AS catalog
       FROM roles r
      WHERE r.id = (SELECT coalesce((SELECT role_id FROM staff_users WHERE id = ?), ?))
        AND r.deleted_at IS NULL`,
    [account?.staffId ?? '', roleId],
  );
  const row = data[0];
  const cached = account?.permissions;

  return useMemo(() => {
    if (!row) return new Set(cached ?? []);
    return new Set(resolvePermissions(row.role_key, parseKeys(row.keys), parseKeys(row.catalog)));
  }, [row, cached]);
}

export function usePermission(permission: string): boolean {
  return usePermissions().has(permission);
}
