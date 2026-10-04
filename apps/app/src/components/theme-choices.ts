import { MonitorIcon, MoonIcon, SunIcon, type LucideIcon } from 'lucide-react';
import type { ThemePreference } from '@/lib/preferences';

export const THEME_CHOICES: readonly { value: ThemePreference; icon: LucideIcon }[] = [
  { value: 'light', icon: SunIcon },
  { value: 'dark', icon: MoonIcon },
  { value: 'system', icon: MonitorIcon },
];
