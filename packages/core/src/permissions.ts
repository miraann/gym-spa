/**
 * The gym's top role (خاوەن), which always has every permission, including ones added later (see
 * app.role_permission_keys). It was called Super Admin before the multi-tenant step.
 */
export const OWNER_ROLE = 'owner';

/**
 * The permissions a role gives, worked out the same way as app.role_permission_keys() on the
 * server: the Owner gets the whole catalog, every other role its role_permissions rows.
 */
export function resolvePermissions(
  roleKey: string | null,
  rolePermissionKeys: readonly string[],
  catalog: readonly string[],
): string[] {
  if (roleKey === null) return [];
  const keys = roleKey === OWNER_ROLE ? catalog : rolePermissionKeys;
  return [...new Set(keys)].sort();
}
