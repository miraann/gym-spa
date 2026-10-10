import { Link, useRouterState } from '@tanstack/react-router';
import { PencilIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isNavItemActive, visibleNavGroups, type NavItem } from '@/app/navigation';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { usePermissions } from '@/features/auth/use-permissions';
import { cn } from '@/lib/utils';
import { TabEditor } from './tab-editor';

/** Phones: "More" opens the whole menu as a bottom sheet, and the staff member's tab choice. */
export function MoreSheet({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('nav');
  const [editing, setEditing] = useState(false);
  const close = () => {
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setEditing(false);
      }}
    >
      <SheetContent side="bottom" className="max-h-[85svh] gap-0 rounded-t-3xl">
        <SheetHeader className="pe-12">
          <SheetTitle>{editing ? t('tabEditor.title') : t('tabBar.moreTitle')}</SheetTitle>
          <SheetDescription>
            {editing ? t('tabEditor.description') : t('tabBar.moreDescription')}
          </SheetDescription>
        </SheetHeader>
        {editing ? (
          <TabEditor
            onDone={() => {
              setEditing(false);
            }}
          />
        ) : (
          <>
            <MenuGrid onNavigate={close} />
            <SheetFooter className="border-t">
              <Button
                variant="outline"
                size="lg"
                onClick={() => {
                  setEditing(true);
                }}
              >
                <PencilIcon aria-hidden />
                {t('tabEditor.open')}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MenuGrid({ onNavigate }: { readonly onNavigate: () => void }) {
  const { t } = useTranslation('nav');
  const groups = visibleNavGroups(usePermissions());

  return (
    <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`more-${group.key}`}>
          <h3 id={`more-${group.key}`} className="mb-2 text-xs text-muted-foreground">
            {t(`groups.${group.key}`)}
          </h3>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {group.items.map((item) => (
              <li key={item.key}>
                <MenuTile item={item} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function MenuTile({
  item,
  onNavigate,
}: {
  readonly item: NavItem;
  readonly onNavigate: () => void;
}) {
  const { t } = useTranslation(['common', 'nav']);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isActive = isNavItemActive(item, pathname);
  const Icon = item.icon;
  const className = cn(
    'flex min-h-20 w-full flex-col items-center justify-center gap-1.5 rounded-2xl p-2 text-center outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
    isActive ? 'bg-accent text-accent-foreground' : 'bg-muted/60',
  );
  const content = (
    <>
      <Icon aria-hidden className="size-6" />
      <span className="line-clamp-2 text-xs leading-tight">{t(`nav:items.${item.key}`)}</span>
    </>
  );

  if (item.to === undefined) {
    return (
      <div aria-disabled="true" className={cn(className, 'opacity-50')}>
        {content}
        <span className="text-[0.625rem] text-muted-foreground">{t('sidebar.soon')}</span>
      </div>
    );
  }
  return (
    <Link
      to={item.to}
      aria-current={isActive ? 'page' : undefined}
      onClick={onNavigate}
      className={className}
    >
      {content}
    </Link>
  );
}
