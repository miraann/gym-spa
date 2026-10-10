import { CHECKIN_TAB, NAV_TAB_COUNT, arrangeNavTabs, type NavItemKey } from '@gym/core';
import { useMutation } from '@tanstack/react-query';
import { CheckIcon, WifiOffIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { navItem, navTabItems, visibleNavGroups } from '@/app/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SheetFooter } from '@/components/ui/sheet';
import { useActiveAccount, useAuthController } from '@/features/auth/auth-context';
import { AuthErrorMessage } from '@/features/auth/screens/form-error';
import { authErrorKey, type AuthErrorKey } from '@/features/auth/staff-api';
import { usePermissions } from '@/features/auth/use-permissions';
import { useConnection } from '@/lib/connection';
import { useFormat } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The staff member picks their own 4 phone tabs, in the order they tap them (check-in always
 * goes to the middle). Saved on their profile, so the tabs follow them to every device.
 */
export function TabEditor({ onDone }: { readonly onDone: () => void }) {
  const { t } = useTranslation('nav');
  const format = useFormat();
  const controller = useAuthController();
  const account = useActiveAccount();
  const permissions = usePermissions();
  const online = useConnection().state === 'connected';
  const saved = account?.navTabs ?? null;
  const [picked, setPicked] = useState<NavItemKey[]>(() =>
    navTabItems(saved, account?.roleKey ?? null, permissions).map((item) => item.key),
  );
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const tabs = arrangeNavTabs(picked);
  const groups = visibleNavGroups(permissions);
  const canCheckIn = groups.some((group) => group.items.some((item) => item.key === CHECKIN_TAB));

  const save = useMutation({
    mutationFn: (next: readonly NavItemKey[] | null) => controller.saveNavTabs(next),
    onMutate: () => {
      setError(null);
    },
    onSuccess: () => {
      toast.success(t('tabEditor.saved'));
      onDone();
    },
    onError: (failure) => {
      setError(authErrorKey(failure, 'save-nav-tabs'));
    },
  });

  const toggle = (key: NavItemKey) => {
    setPicked((current) => {
      if (current.includes(key)) return current.filter((each) => each !== key);
      return current.length < NAV_TAB_COUNT ? [...current, key] : current;
    });
  };

  return (
    <>
      <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
        <section aria-label={t('tabEditor.preview')} className="flex flex-col gap-2">
          <ol className="flex items-stretch gap-1 rounded-full border bg-card p-1">
            {Array.from({ length: NAV_TAB_COUNT }, (_, index) => {
              const key = tabs[index];
              const item = key === undefined ? undefined : navItem(key);
              const Icon = item?.icon;
              return (
                <li
                  key={key ?? `empty-${String(index)}`}
                  className={cn(
                    'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-1.5',
                    !item && 'border border-dashed text-muted-foreground',
                  )}
                >
                  {Icon && <Icon aria-hidden className="size-5" />}
                  <span className="max-w-full truncate px-0.5 text-[0.6875rem] leading-tight">
                    {item ? t(`short.${item.key}`) : t('tabEditor.emptySlot')}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {t('tabEditor.chosen', {
              count: format.number(picked.length),
              total: format.number(NAV_TAB_COUNT),
            })}
            {canCheckIn && ` ${t('tabEditor.checkinMiddle')}`}
          </p>
        </section>

        {groups.map((group) => (
          <section key={group.key} aria-labelledby={`tabs-${group.key}`}>
            <h3 id={`tabs-${group.key}`} className="mb-2 text-xs text-muted-foreground">
              {t(`groups.${group.key}`)}
            </h3>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {group.items.map((item) => {
                const position = tabs.indexOf(item.key);
                const selected = position >= 0;
                const full = picked.length >= NAV_TAB_COUNT;
                const Icon = item.icon;
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      disabled={!selected && full}
                      onClick={() => {
                        toggle(item.key);
                      }}
                      className={cn(
                        'flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-start text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50',
                        selected ? 'bg-accent text-accent-foreground' : 'bg-muted/60',
                      )}
                    >
                      <Icon aria-hidden className="size-5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{t(`items.${item.key}`)}</span>
                      {selected && (
                        <span
                          aria-hidden
                          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground tabular-nums"
                        >
                          {format.number(position + 1)}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <SheetFooter className="border-t">
        {!online && (
          <Alert variant="warning">
            <WifiOffIcon />
            <AlertDescription>{t('tabEditor.needsConnection')}</AlertDescription>
          </Alert>
        )}
        <AuthErrorMessage error={error} />
        <Button
          size="lg"
          disabled={picked.length !== NAV_TAB_COUNT || !online || save.isPending}
          onClick={() => {
            save.mutate(tabs);
          }}
        >
          <CheckIcon aria-hidden />
          {t('tabEditor.save')}
        </Button>
        {/* Long labels wrap instead of overflowing the half-width buttons. */}
        <div className="grid grid-cols-2 gap-2 *:h-auto *:min-h-11 *:py-2 *:whitespace-normal">
          <Button variant="outline" disabled={save.isPending} onClick={onDone}>
            {t('tabEditor.cancel')}
          </Button>
          <Button
            variant="ghost"
            disabled={saved === null || !online || save.isPending}
            onClick={() => {
              save.mutate(null);
            }}
          >
            {t('tabEditor.reset')}
          </Button>
        </div>
      </SheetFooter>
    </>
  );
}
