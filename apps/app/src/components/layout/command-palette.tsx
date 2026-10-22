import { formatMemberNumber, formatMemberPhone, matchesSearch } from '@gym/core';
import { useNavigate } from '@tanstack/react-router';
import { ListIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { navPages } from '@/app/navigation';
import { usePermissions } from '@/features/auth/use-permissions';
import { MemberAvatar, MemberStatusBadge } from '@/features/members/member-badges';
import { useMemberSearch, useMemberThumbnails } from '@/features/members/member-data';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@gym/ui/components/command';

/** How long typing must pause before the members are searched. */
const SEARCH_DELAY_MS = 200;

/**
 * Ctrl+K search (and the search button on phones): members by name, phone or member number, and
 * the pages. A keyboard-type reader typing a card into the search box is a card scan: the app opens
 * that card's member (useOpenMemberOnScan).
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(['common', 'nav']);
  const permissions = usePermissions();
  const canSeeMembers = permissions.has('members.view');
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  // Every search starts empty.
  if (!open && query !== '') setQuery('');
  const searched = useDebouncedValue(query.trim(), SEARCH_DELAY_MS);
  const members = useMemberSearch(searched, open && canSeeMembers);
  // Only the members of exactly what is typed now: Enter opens the first one.
  const found = searched !== '' && searched === query.trim() ? (members.data ?? null) : null;
  const thumbnails = useMemberThumbnails(found?.members ?? []).data;
  const pages = navPages(permissions).filter((item) =>
    matchesSearch(query, t(`nav:items.${item.key}`)),
  );
  // The highlighted row (Enter opens it): the first member once members are found, else the first
  // page. It follows the results as they arrive, so Enter never opens a page that was first before.
  const [highlighted, setHighlighted] = useState('');
  const first = found?.members[0];
  const firstValue = first ? `member-${first.id}` : pages[0] ? `page-${pages[0].key}` : '';
  const [highlightedFor, setHighlightedFor] = useState(firstValue);
  if (highlightedFor !== firstValue) {
    setHighlightedFor(firstValue);
    setHighlighted(firstValue);
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // `code` is the physical key, so Ctrl+K also works with Kurdish and Arabic keyboard layouts.
      if (event.code === 'KeyK' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onOpenChange]);

  const go = (to: () => Promise<void>) => {
    onOpenChange(false);
    void to();
  };
  const placeholder = t(canSeeMembers ? 'search.placeholderMembers' : 'search.placeholder');
  const typed = canSeeMembers && query.trim() !== '';
  // Until the members are there, "nothing found" would be wrong.
  const searching = typed && (searched !== query.trim() || members.isFetching);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('search.open')}
      description={placeholder}
    >
      <Command shouldFilter={false} loop value={highlighted} onValueChange={setHighlighted}>
        <CommandInput
          placeholder={placeholder}
          value={query}
          onValueChange={setQuery}
          // CARD_INPUT_ATTRIBUTE: a keyboard-type reader typing here is still a scan.
          data-card-input=""
        />
        <CommandList>
          {!searching && <CommandEmpty>{t('search.empty')}</CommandEmpty>}
          {canSeeMembers && !typed && (
            <p className="px-3 pt-3 pb-1 text-sm text-muted-foreground">{t('search.hint')}</p>
          )}
          {typed && (
            <CommandGroup heading={t('search.members')} data-testid="search-members">
              {members.isError && (
                <p role="alert" className="px-2 py-1.5 text-sm text-destructive">
                  {t('search.failed')}
                </p>
              )}
              {found === null && !members.isError && (
                <p className="px-2 py-1.5 text-sm text-muted-foreground">{t('search.searching')}</p>
              )}
              {found?.members.map((member) => (
                <CommandItem
                  key={member.id}
                  value={`member-${member.id}`}
                  data-member={formatMemberNumber(member.memberNumber)}
                  onSelect={() => {
                    go(() =>
                      navigate({ to: '/members/$memberId', params: { memberId: member.id } }),
                    );
                  }}
                >
                  <MemberAvatar name={member.fullName} image={thumbnails?.get(member.id)} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{member.fullName}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span dir="ltr" className="tabular-nums">
                        {formatMemberNumber(member.memberNumber)}
                      </span>
                      {member.phone !== null && (
                        <span dir="ltr" className="tabular-nums">
                          {formatMemberPhone(member.phone)}
                        </span>
                      )}
                    </span>
                  </span>
                  <MemberStatusBadge status={member.status} />
                </CommandItem>
              ))}
              {found?.more === true && (
                <CommandItem
                  value="members-list"
                  onSelect={() => {
                    go(() => navigate({ to: '/members', search: { q: query.trim() } }));
                  }}
                >
                  <ListIcon />
                  <span>{t('search.allMembers')}</span>
                </CommandItem>
              )}
            </CommandGroup>
          )}
          {pages.length > 0 && (
            <CommandGroup heading={t('search.pages')}>
              {pages.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.key}
                    value={`page-${item.key}`}
                    onSelect={() => {
                      go(() => navigate({ to: item.to }));
                    }}
                  >
                    <Icon />
                    <span>{t(`nav:items.${item.key}`)}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
