/**
 * The permission catalog (public.permissions), in the order of its sort_order, grouped by module.
 * The database is the authority; this copy gives the screens typed keys for their labels
 * (packages/i18n, namespace `permissions`). A test keeps it the same as the migrations.
 *
 * Adding a permission: add it in a migration (README → How access works), here in the same place,
 * and its label in every language.
 */
export const PERMISSIONS = [
  { key: 'dashboard.view', module: 'dashboard' },
  { key: 'branches.manage', module: 'branches' },
  { key: 'staff.view', module: 'staff' },
  { key: 'staff.manage', module: 'staff' },
  { key: 'roles.manage', module: 'staff' },
  { key: 'devices.manage', module: 'devices' },
  { key: 'settings.edit', module: 'settings' },
  { key: 'backups.export', module: 'settings' },
  { key: 'audit.view', module: 'settings' },
  { key: 'billing.view', module: 'settings' },
  { key: 'support.grant', module: 'settings' },
  { key: 'server.manage', module: 'settings' },
  { key: 'backups.restore', module: 'settings' },
  { key: 'members.view', module: 'members' },
  { key: 'members.create', module: 'members' },
  { key: 'members.edit', module: 'members' },
  { key: 'members.delete', module: 'members' },
  { key: 'members.medical.view', module: 'members' },
  { key: 'members.import', module: 'members' },
  { key: 'members.export', module: 'members' },
  { key: 'cards.manage', module: 'members' },
  { key: 'cards.blacklist', module: 'members' },
  { key: 'plans.manage', module: 'subscriptions' },
  { key: 'subscriptions.sell', module: 'subscriptions' },
  { key: 'subscriptions.freeze', module: 'subscriptions' },
  { key: 'subscriptions.change', module: 'subscriptions' },
  { key: 'subscriptions.transfer', module: 'subscriptions' },
  { key: 'subscriptions.cancel', module: 'subscriptions' },
  { key: 'discount.apply.max_10', module: 'subscriptions' },
  { key: 'discount.apply.max_25', module: 'subscriptions' },
  { key: 'discount.apply.max_50', module: 'subscriptions' },
  { key: 'discount.apply.any', module: 'subscriptions' },
  { key: 'payments.view', module: 'payments' },
  { key: 'payments.create', module: 'payments' },
  { key: 'payments.refund', module: 'payments' },
  { key: 'payments.void', module: 'payments' },
  { key: 'checkin.perform', module: 'checkin' },
  { key: 'checkin.manual', module: 'checkin' },
  { key: 'checkin.override', module: 'checkin' },
  { key: 'attendance.view', module: 'checkin' },
  { key: 'attendance.void', module: 'checkin' },
  { key: 'lockers.view', module: 'lockers' },
  { key: 'lockers.assign', module: 'lockers' },
  { key: 'lockers.manage', module: 'lockers' },
  { key: 'spa.view', module: 'spa' },
  { key: 'spa.book', module: 'spa' },
  { key: 'spa.manage', module: 'spa' },
  { key: 'classes.view', module: 'classes' },
  { key: 'classes.book', module: 'classes' },
  { key: 'classes.manage', module: 'classes' },
  { key: 'pt.log', module: 'classes' },
  { key: 'pt.manage', module: 'classes' },
  { key: 'hr.view', module: 'hr' },
  { key: 'hr.manage', module: 'hr' },
  { key: 'pos.sell', module: 'shop' },
  { key: 'products.manage', module: 'shop' },
  { key: 'inventory.adjust', module: 'shop' },
  { key: 'cash_register.operate', module: 'shop' },
  { key: 'cash_register.view_all', module: 'shop' },
  { key: 'notifications.send', module: 'notifications' },
  { key: 'notifications.templates.manage', module: 'notifications' },
  { key: 'reports.view', module: 'reports' },
  { key: 'reports.financial.view', module: 'reports' },
  { key: 'reports.export', module: 'reports' },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];
export type PermissionModule = (typeof PERMISSIONS)[number]['module'];

export interface PermissionGroup {
  readonly module: PermissionModule;
  readonly keys: readonly PermissionKey[];
}

/** The catalog grouped by module, in catalog order (the permission table's sections). */
export const PERMISSION_GROUPS: readonly PermissionGroup[] = PERMISSIONS.reduce<PermissionGroup[]>(
  (groups, { key, module }) => {
    const last = groups.at(-1);
    if (last?.module === module) {
      return [...groups.slice(0, -1), { module, keys: [...last.keys, key] }];
    }
    return [...groups, { module, keys: [key] }];
  },
  [],
);

export function isPermissionKey(value: unknown): value is PermissionKey {
  return PERMISSIONS.some((permission) => permission.key === value);
}

/** The percentage of a discount.apply.max_<n> permission (its label shows it); null otherwise. */
export function discountLimit(key: PermissionKey): number | null {
  const match = /^discount\.apply\.max_(\d+)$/.exec(key);
  return match ? Number(match[1]) : null;
}

/**
 * The permissions to save for a role: the chosen ones the catalog knows, plus any the role already
 * has that this copy doesn't know (a newer server), so saving never drops them. Sorted, once each.
 */
export function rolePermissionsToSave(
  chosen: Iterable<string>,
  current: readonly string[],
): string[] {
  const kept = current.filter((key) => !isPermissionKey(key));
  return [...new Set([...[...chosen].filter(isPermissionKey), ...kept])].sort();
}
