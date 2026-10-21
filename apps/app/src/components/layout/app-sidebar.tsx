import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { isNavItemActive, visibleNavGroups, type OpenNavItem } from '@/app/navigation';
import { usePermissions } from '@/features/auth/use-permissions';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@gym/ui/components/sidebar';
import { GymMark } from './gym-mark';
import { useGymName } from './use-gym-name';

/**
 * Desktops (≥ 1280px): the full menu, grouped by module, like a tablet app's sidebar. Pages that
 * are not built yet are not shown. Collapses to icons on request.
 */
export function AppSidebar({ side }: { readonly side: 'left' | 'right' }) {
  const { t } = useTranslation(['common', 'nav']);
  const groups = visibleNavGroups(usePermissions());
  const gymName = useGymName();

  return (
    <Sidebar side={side} collapsible="icon">
      <SidebarHeader className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="gap-3 px-2 hover:bg-transparent">
              <Link to="/">
                <GymMark className="size-11 rounded-2xl group-data-[collapsible=icon]:size-10" />
                {/* The gym's name first: staff work for the gym, the app is secondary. */}
                <span className="grid flex-1 text-start leading-tight">
                  <span className="truncate text-base font-bold">{gymName ?? t('app.name')}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {gymName ? t('app.name') : t('app.fullName')}
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-1 px-1">
        {groups.map((group) => (
          <SidebarGroup key={group.key} className="py-1.5">
            <SidebarGroupLabel>{t(`nav:groups.${group.key}`)}</SidebarGroupLabel>
            <SidebarMenu className="gap-0.5">
              {group.items.map((item) => (
                <NavMenuItem key={item.key} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        {/* App version, so support can tell which build a device runs. */}
        <span
          dir="ltr"
          className="px-3 text-end text-xs text-muted-foreground group-data-[collapsible=icon]:hidden"
        >
          {import.meta.env.VITE_APP_VERSION}
        </span>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function NavMenuItem({ item }: { readonly item: OpenNavItem }) {
  const { t } = useTranslation('nav');
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const label = t(`items.${item.key}`);
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isNavItemActive(item, pathname)} tooltip={label}>
        <Link to={item.to}>
          <Icon aria-hidden />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
