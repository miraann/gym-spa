/**
 * The gym's top role (خاوەن), which always has every permission, including ones added later (see
 * app.role_permission_keys). It was called Super Admin before the multi-tenant step.
 */
export const OWNER_ROLE = 'owner';

/**
 * The permissions a role gives, worked out the same way as app.role_permission_keys() on the
 * server: the Owner gets the whole catalog, every other role (built-in or custom, which has no key)
 * its role_permissions rows. No role (deleted, or not visible): nothing.
 */
export function resolvePermissions(
  role: { readonly key: string | null } | null,
  rolePermissionKeys: readonly string[],
  catalog: readonly string[],
): string[] {
  if (role === null) return [];
  const keys = role.key === OWNER_ROLE ? catalog : rolePermissionKeys;
  return [...new Set(keys)].sort();
}
