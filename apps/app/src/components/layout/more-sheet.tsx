import { NAV_TAB_COUNT } from '@gym/core';
import { Link, useRouterState } from '@tanstack/react-router';
import { PencilIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isNavItemActive, visibleNavGroups, type OpenNavItem } from '@/app/navigation';
import { ListGroup, ListRow } from '@gym/ui/blocks/list-group';
import { Button } from '@gym/ui/components/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@gym/ui/components/sheet';
import { useActiveAccount } from '@/features/auth/auth-context';
import { usePermissions } from '@/features/auth/use-permissions';
import { cn } from '@gym/ui/lib/utils';
import { NavArt } from './nav-art';
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
  const permissions = usePermissions();
  const savedTabs = useActiveAccount()?.navTabs ?? null;
  // A choice only when there are more pages than tabs (pages not built yet don't count), or to
  // go back from an earlier choice.
  const pageCount = visibleNavGroups(permissions).reduce(
    (count, group) => count + group.items.length,
    0,
  );
  const canChooseTabs = pageCount > NAV_TAB_COUNT || savedTabs !== null;
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
      <SheetContent side="bottom" className="max-h-[88svh] gap-0 bg-background">
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
            {canChooseTabs && (
              <SheetFooter className="border-t bg-background">
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
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MenuGrid({ onNavigate }: { readonly onNavigate: () => void }) {
  const { t } = useTranslation('nav');
  const groups = visibleNavGroups(usePermissions());
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="flex flex-col gap-5 overflow-y-auto bg-background px-4 pt-1 pb-4">
      {groups.map((group) => (
        <ListGroup key={group.key} title={t(`groups.${group.key}`)}>
          {group.items.map((item) => (
            <MenuRow
              key={item.key}
              item={item}
              isActive={isNavItemActive(item, pathname)}
              onNavigate={onNavigate}
            />
          ))}
        </ListGroup>
      ))}
    </div>
  );
}

function MenuRow({
  item,
  isActive,
  onNavigate,
}: {
  readonly item: OpenNavItem;
  readonly isActive: boolean;
  readonly onNavigate: () => void;
}) {
  const { t } = useTranslation('nav');
  return (
    <ListRow
      asChild
      title={t(`items.${item.key}`)}
      leading={<NavArt art={item.art} className="size-9" />}
      className={cn(isActive && 'bg-accent')}
    >
      <Link to={item.to} aria-current={isActive ? 'page' : undefined} onClick={onNavigate} />
    </ListRow>
  );
}
