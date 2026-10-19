import { localizedName } from '@gym/i18n';
import { MasterDetail } from '@gym/ui/blocks/master-detail';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { Badge } from '@gym/ui/components/badge';
import { Button } from '@gym/ui/components/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@gym/ui/components/empty';
import { Skeleton } from '@gym/ui/components/skeleton';
import { cn } from '@gym/ui/lib/utils';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { PlusIcon, ShieldCheckIcon } from 'lucide-react';
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
      <PageHeader
        title={t('roles.title')}
        description={t('roles.description')}
        actions={
          <Button asChild size="lg">
            <Link to="/roles/new">
              <PlusIcon data-icon="inline-start" />
              {t('roles.add')}
            </Link>
          </Button>
        }
      />
      {roles.isPending ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : roles.isError ? (
        <AdminError error={adminErrorKey(roles.error, 'roles')} />
      ) : (
        <ul className="flex flex-col gap-2" aria-label={t('roles.title')}>
          {roles.data.map((role) => {
            const selected = pathname === `/roles/${role.id}`;
            return (
              <li key={role.id}>
                <Link
                  to="/roles/$roleId"
                  params={{ roleId: role.id }}
                  aria-current={selected ? 'page' : undefined}
                  data-role={role.key ?? role.nameCkb}
                  className={cn(
                    'flex flex-col gap-1 rounded-2xl bg-card p-4 ring-1 ring-border transition-colors hover:bg-muted/50',
                    selected && 'ring-2 ring-primary',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-base">{localizedName(role, language)}</span>
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
                    <span>{t('roles.staffCount', { number: format.number(role.staffCount) })}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
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
