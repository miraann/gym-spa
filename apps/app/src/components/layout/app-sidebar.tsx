import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { isNavItemActive, visibleNavGroups, type NavItem } from '@/app/navigation';
import { usePermissions } from '@/features/auth/use-permissions';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { GymMark } from './gym-mark';
import { useGymName } from './use-gym-name';

/** Desktops (≥ 1280px): the full menu, grouped by module. Collapses to icons on request. */
export function AppSidebar({ side }: { readonly side: 'left' | 'right' }) {
  const { t } = useTranslation(['common', 'nav']);
  const groups = visibleNavGroups(usePermissions());
  const gymName = useGymName();

  return (
    <Sidebar side={side} collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <GymMark />
                {/* The gym's name first: staff work for the gym, the app is secondary. */}
                <span className="grid flex-1 text-start leading-tight">
                  <span className="truncate">{gymName ?? t('app.name')}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {gymName ? t('app.name') : t('app.fullName')}
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.key}>
            <SidebarGroupLabel>{t(`nav:groups.${group.key}`)}</SidebarGroupLabel>
            <SidebarMenu>
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
          className="px-2 text-end text-xs text-muted-foreground group-data-[collapsible=icon]:hidden"
        >
          {import.meta.env.VITE_APP_VERSION}
        </span>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function NavMenuItem({ item }: { readonly item: NavItem }) {
  const { t } = useTranslation(['common', 'nav']);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const label = t(`nav:items.${item.key}`);
  const Icon = item.icon;

  if (item.to === undefined) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton disabled>
          <Icon />
          <span>{label}</span>
        </SidebarMenuButton>
        <SidebarMenuBadge className="text-[0.65rem] font-normal text-muted-foreground">
          {t('sidebar.soon')}
        </SidebarMenuBadge>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isNavItemActive(item, pathname)}
        tooltip={label}
        className="data-active:bg-accent data-active:text-accent-foreground"
      >
        <Link to={item.to}>
          <Icon />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
