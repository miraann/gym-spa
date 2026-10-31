import { localizedName } from '@gym/i18n';
import { AddTile } from '@gym/ui/blocks/add-tile';
import { MasterDetail } from '@gym/ui/blocks/master-detail';
import {
  GroupedList,
  GroupedListItem,
  GroupedListSkeleton,
  RowChevron,
} from '@gym/ui/blocks/list-group';
import { groupedRowClass } from '@gym/ui/lib/grouped-list';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { Badge } from '@gym/ui/components/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@gym/ui/components/empty';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { ShieldCheckIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { RequirePermission } from '@/components/no-access';
import { useRoleOverview } from '@/features/staff/admin-data';
import { adminErrorKey } from '@/features/staff/admin-errors';
import { AdminError } from '@/features/staff/admin-error';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';

/** Roles and permissions (roles.manage): the list, and the role or form open from it. */
export function RolesLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const detailOpen = pathname.replace(/\/$/, '') !== '/roles';
  return (
    <RequirePermission permission="roles.manage">
      <MasterDetail list={<RoleList />} detail={<Outlet />} detailOpen={detailOpen} />
    </RequirePermission>
  );
}

function RoleList() {
  const { t } = useTranslation('staff');
  const { language } = usePreferences();
  const format = useFormat();
  const roles = useRoleOverview();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('roles.title')} description={t('roles.description')} />
      <AddTile asChild label={t('roles.add')}>
        <Link to="/roles/new" />
      </AddTile>
      {roles.isPending ? (
        <GroupedListSkeleton rows={3} />
      ) : roles.isError ? (
        <AdminError error={adminErrorKey(roles.error, 'roles')} />
      ) : (
        <GroupedList aria-label={t('roles.title')}>
          {roles.data.map((role) => {
            const selected = pathname === `/roles/${role.id}`;
            return (
              <GroupedListItem key={role.id}>
                <Link
                  to="/roles/$roleId"
                  params={{ roleId: role.id }}
                  aria-current={selected ? 'page' : undefined}
                  data-role={role.key ?? role.nameCkb}
                  className={groupedRowClass(selected)}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{localizedName(role, language)}</span>
                      <span className="flex shrink-0 gap-1">
                        {role.isOwnRole && <Badge variant="secondary">{t('roles.yourRole')}</Badge>}
                        {role.isSystem && <Badge variant="outline">{t('roles.builtIn')}</Badge>}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                      <span>
                        {role.key === 'owner'
                          ? t('roles.allPermissions')
                          : t('roles.permissionCount', {
                              number: format.number(role.permissionKeys.length),
                            })}
                      </span>
                      <span>
                        {t('roles.staffCount', { number: format.number(role.staffCount) })}
                      </span>
                    </span>
                  </span>
                  <RowChevron />
                </Link>
              </GroupedListItem>
            );
          })}
        </GroupedList>
      )}
    </div>
  );
}

/** Beside the list before a role is chosen. */
export function RolePlaceholder() {
  const { t } = useTranslation('staff');
  return (
    <Empty className="min-h-64 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ShieldCheckIcon />
        </EmptyMedia>
        <EmptyDescription>{t('roles.choose')}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
