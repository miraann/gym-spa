import { Link, useRouterState } from '@tanstack/react-router';
import { DumbbellIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NAV_GROUPS, type NavItem } from '@/app/navigation';
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
  useSidebar,
} from '@/components/ui/sidebar';

export function AppSidebar({ side }: { readonly side: 'left' | 'right' }) {
  const { t } = useTranslation(['common', 'nav']);

  return (
    <Sidebar side={side} collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <DumbbellIcon className="size-4" />
                </span>
                <span className="grid flex-1 text-start leading-tight">
                  <span className="truncate font-semibold">{t('app.name')}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {t('app.fullName')}
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => (
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
  const { isMobile, setOpenMobile } = useSidebar();
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

  const isActive = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
        <Link
          to={item.to}
          onClick={() => {
            if (isMobile) setOpenMobile(false);
          }}
        >
          <Icon />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
