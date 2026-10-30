import { getDirection } from '@gym/i18n';
import { haptic } from '@gym/platform';
import { useQueryClient } from '@tanstack/react-query';
import { Outlet } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PullToRefresh } from '@gym/ui/blocks/pull-to-refresh';
import { SidebarInset, SidebarProvider } from '@gym/ui/components/sidebar';
import { useGymAppearanceSync } from '@/features/appearance/use-gym-appearance';
import { UpdateNotice } from '@/components/update-notice';
import { BillingBanner } from '@/features/billing/billing-banner';
import { LicenseUpdatesBanner } from '@/features/billing/license-updates-banner';
import { SupportBanner } from '@/features/support/support-banner';
import { isOfflineEdition } from '@/lib/edition';
import { useOpenMemberOnScan } from '@/features/cards/use-open-member-on-scan';
import { useLayout } from '@gym/ui/hooks/use-layout';
import { usePreferences } from '@/lib/preferences';
import { AppSidebar } from './app-sidebar';
import { BottomTabBar } from './bottom-tab-bar';
import { CommandPalette } from './command-palette';
import { NavRail } from './nav-rail';
import { TopBar } from './top-bar';

const SIDEBAR_STORAGE_KEY = 'gym.sidebar';

function readSidebarOpen(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) !== 'collapsed';
  } catch {
    return true;
  }
}

function saveSidebarOpen(open: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, open ? 'expanded' : 'collapsed');
  } catch {
    // Storage is blocked: the sidebar just opens expanded next time.
  }
}

/**
 * The frame of every page. Navigation fits the width (CLAUDE.md → Design): the full sidebar on
 * desktops, an icon rail on tablets, a bottom tab bar on phones. Both side menus sit on the
 * reading-start side: right for Kurdish and Arabic. On phones, pulling down at the top of a page
 * reloads its data. A card held to a reader opens its member from any page.
 */
export function AppShell() {
  const { t } = useTranslation();
  const { language } = usePreferences();
  const layout = useLayout();
  const [sidebarOpen, setSidebarOpen] = useState(readSidebarOpen);
  const [searchOpen, setSearchOpen] = useState(false);
  const queryClient = useQueryClient();
  useGymAppearanceSync();
  // A card held to a reader on a screen that doesn't wait for one opens its member.
  useOpenMemberOnScan(() => {
    setSearchOpen(false);
  });

  const handleSidebarOpenChange = (open: boolean): void => {
    setSidebarOpen(open);
    saveSidebarOpen(open);
  };

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={handleSidebarOpenChange}>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 shadow focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
      >
        {t('skipToContent')}
      </a>
      {layout === 'desktop' && (
        <AppSidebar side={getDirection(language) === 'rtl' ? 'right' : 'left'} />
      )}
      {layout === 'tablet' && <NavRail />}
      <SidebarInset data-layout={layout}>
        <TopBar
          layout={layout}
          onOpenSearch={() => {
            setSearchOpen(true);
          }}
        />
        <main
          id="main"
          tabIndex={-1}
          className="flex-1 px-4 pt-3 pb-6 outline-none md:px-8 md:pt-6"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <UpdateNotice />
            <BillingBanner />
            <LicenseUpdatesBanner />
            {!isOfflineEdition && <SupportBanner />}
            {layout === 'phone' ? (
              <PullToRefresh
                label={t('refreshing')}
                onThreshold={() => {
                  haptic('light');
                }}
                onRefresh={() => queryClient.refetchQueries({ type: 'active' })}
              >
                <Outlet />
              </PullToRefresh>
            ) : (
              <Outlet />
            )}
          </div>
        </main>
      </SidebarInset>
      {layout === 'phone' && <BottomTabBar />}
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </SidebarProvider>
  );
}
