import { LanguagesIcon, LockIcon, LogOutIcon, SunMoonIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { LanguageRadioItems } from '@/components/layout/language-menu';
import { ThemeRadioItems } from '@/components/layout/theme-menu';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { logError } from '@/lib/logger';
import { useActiveAccount, useAuthController } from './auth-context';

/**
 * The active staff member, with Lock (let someone else in) and Log out of this device. Compact (on
 * phones): only their initial, and the language and theme choices the top bar has no room for.
 */
export function UserMenu({ compact = false }: { readonly compact?: boolean }) {
  const { t } = useTranslation(['auth', 'common']);
  const controller = useAuthController();
  const account = useActiveAccount();
  const [confirmLogout, setConfirmLogout] = useState(false);
  if (!account) return null;

  const logout = () => {
    controller.logout(account.staffId).catch((error: unknown) => {
      logError(error, { area: 'auth', action: 'logout' });
      toast.error(t('errors.unexpected'));
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={t('menu.label')} className="max-w-40">
            <span
              aria-hidden
              className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
            >
              {account.fullName.charAt(0)}
            </span>
            {!compact && <span className="hidden truncate md:inline">{account.fullName}</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel className="grid">
            <span className="truncate">{account.fullName}</span>
            <span
              dir="ltr"
              className="truncate text-start text-xs font-normal text-muted-foreground"
            >
              {account.username}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {compact && (
            <>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <LanguagesIcon />
                  {t('common:language.label')}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <LanguageRadioItems />
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <SunMoonIcon />
                  {t('common:theme.label')}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <ThemeRadioItems />
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem
            onSelect={() => {
              controller.lock();
            }}
          >
            <LockIcon />
            <span className="grid">
              <span>{t('menu.lock')}</span>
              <span className="text-xs text-muted-foreground">{t('menu.lockHint')}</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              setConfirmLogout(true);
            }}
          >
            <LogOutIcon />
            {t('menu.logout')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('menu.logoutTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('menu.logoutDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('menu.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={logout}>
              {t('menu.logoutConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
