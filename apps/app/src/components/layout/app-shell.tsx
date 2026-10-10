import { getDirection } from '@gym/i18n';
import { Outlet } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { useGymAppearanceSync } from '@/features/appearance/use-gym-appearance';
import { useLayout } from '@/hooks/use-layout';
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
 * reading-start side: right for Kurdish and Arabic.
 */
export function AppShell() {
  const { t } = useTranslation();
  const { language } = usePreferences();
  const layout = useLayout();
  const [sidebarOpen, setSidebarOpen] = useState(readSidebarOpen);
  const [searchOpen, setSearchOpen] = useState(false);
  useGymAppearanceSync();

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
        <main id="main" tabIndex={-1} className="flex-1 p-4 outline-none md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
      {layout === 'phone' && <BottomTabBar />}
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </SidebarProvider>
  );
}
