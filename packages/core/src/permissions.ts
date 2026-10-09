/** The role that always has every permission, including ones added later (see app.role_permission_keys). */
export const SUPER_ADMIN_ROLE = 'super_admin';

/**
 * The permissions a role gives, worked out the same way as app.role_permission_keys() on the
 * server: Super Admin gets the whole catalog, every other role its role_permissions rows.
 */
export function resolvePermissions(
  roleKey: string | null,
  rolePermissionKeys: readonly string[],
  catalog: readonly string[],
): string[] {
  if (roleKey === null) return [];
  const keys = roleKey === SUPER_ADMIN_ROLE ? catalog : rolePermissionKeys;
  return [...new Set(keys)].sort();
}
