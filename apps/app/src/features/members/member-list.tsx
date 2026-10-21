import { GENDERS, formatMemberNumber, formatMemberPhone } from '@gym/core';
import { localizedName } from '@gym/i18n';
import { Chip, ChipRow } from '@gym/ui/blocks/chip-row';
import { ColumnVisibilityMenu, DataTable } from '@gym/ui/blocks/data-table';
import { dataTableFeatures, type DataTableFeatures } from '@gym/ui/lib/data-table-features';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { StickyActionBar } from '@gym/ui/blocks/sticky-action-bar';
import { Button } from '@gym/ui/components/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from '@gym/ui/components/empty';
import { Input } from '@gym/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { Skeleton } from '@gym/ui/components/skeleton';
import { useLayout } from '@gym/ui/hooks/use-layout';
import { useSideBySide } from '@gym/ui/hooks/use-side-by-side';
import { cn } from '@gym/ui/lib/utils';
import { createColumnHelper, useTable, type ColumnVisibilityState } from '@tanstack/react-table';
import { Link, useNavigate, useRouterState, useSearch } from '@tanstack/react-router';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon,
  UserPlusIcon,
  UsersIcon,
} from 'lucide-react';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermission } from '@/features/auth/use-permissions';
import { useAdminBranches } from '@/features/staff/admin-data';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { HealthNotesBadge, MemberAvatar, MemberStatusBadge } from './member-badges';
import { useBranchName } from './member-branch-name';
import { MEMBER_PAGE_SIZE, useMemberPage, useMemberTags, type Member } from './member-data';
import { memberErrorKey } from './member-errors';
import { MemberError } from './member-error';
import {
  MEMBER_SORTS,
  STATUS_FILTERS,
  isUnfiltered,
  memberListParams,
  type MemberListSearch,
} from './member-list-search';

/** The /members page: the list in its full layout. */
export function FullMemberList() {
  return <MemberList layout="full" />;
}

/** Waits this long after the last key before searching, so typing doesn't send a request per key. */
const SEARCH_DELAY_MS = 300;

/**
 * The members of the gym, searched, filtered, sorted and paged by the server. layout full: the
 * list alone (a table when the screen is wide); compact: beside an open member (cards).
 */
export function MemberList({ layout }: { readonly layout: 'full' | 'compact' }) {
  const { t } = useTranslation('members');
  const search = useSearch({ from: '/members' });
  const params = memberListParams(search);
  const navigate = useNavigate({ from: '/members' });
  const phone = useLayout() === 'phone';
  const sideBySide = useSideBySide();
  const canCreate = usePermission('members.create');
  const result = useMemberPage(params);
  const showTable = layout === 'full' && sideBySide;

  const update = (change: Partial<MemberListSearch>) => {
    void navigate({
      to: '.',
      search: (previous) => ({ ...previous, page: undefined, ...change }),
      replace: true,
    });
  };

  const total = result.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / MEMBER_PAGE_SIZE));
  const outOfRange = result.data !== undefined && params.page > pages;
  useEffect(() => {
    // The list got shorter than the page shown (a member archived, a filter changed elsewhere).
    if (outOfRange) update({ page: undefined });
  });

  const addButton = canCreate && (
    <Button asChild size="lg">
      <Link to="/members/new" search={(previous) => previous}>
        <UserPlusIcon data-icon="inline-start" />
        {t('list.add')}
      </Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('list.title')}
        actions={
          <div className="flex items-center gap-2">
            {result.data && (
              <span className="text-sm text-muted-foreground" data-testid="members-total">
                {t('list.total', { count: total })}
              </span>
            )}
            {!phone && addButton}
          </div>
        }
      />
      <SearchBox
        value={params.q}
        onSearch={(q) => {
          update({ q: q === '' ? undefined : q });
        }}
      />
      <ChipRow label={t('list.statusFilter')}>
        {STATUS_FILTERS.map((status) => (
          <Chip
            key={status}
            selected={params.status === status}
            aria-pressed={params.status === status}
            onClick={() => {
              update({ status: status === 'current' ? undefined : status });
            }}
          >
            {t(`list.statuses.${status}`)}
          </Chip>
        ))}
      </ChipRow>
      <ListFilters search={search} onChange={update} compact={layout === 'compact'} />

      {result.isPending ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton key={row} className="h-18 rounded-2xl" />
          ))}
        </div>
      ) : result.isError ? (
        <MemberError error={memberErrorKey(result.error, 'list')} />
      ) : result.data.members.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyDescription>
              {isUnfiltered(params) ? t('list.empty') : t('list.noMatch')}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {isUnfiltered(params) ? (
              addButton
            ) : (
              <Button asChild variant="outline">
                <Link to="." search={{}} replace>
                  {t('list.clear')}
                </Link>
              </Button>
            )}
          </EmptyContent>
        </Empty>
      ) : showTable ? (
        <MemberTable members={result.data.members} />
      ) : (
        <MemberCards members={result.data.members} />
      )}

      {pages > 1 && (
        <nav
          aria-label={t('list.page', { page: params.page, pages })}
          className="flex items-center justify-between gap-2"
        >
          <Button
            variant="outline"
            disabled={params.page <= 1}
            onClick={() => {
              update({ page: params.page - 1 > 1 ? params.page - 1 : undefined });
            }}
          >
            {/* Points to the reading start: right in Kurdish and Arabic, left in English. */}
            <ChevronRightIcon className="ltr:rotate-180" aria-hidden="true" />
            {t('list.previous')}
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">
            {t('list.page', { page: params.page, pages })}
          </span>
          <Button
            variant="outline"
            disabled={params.page >= pages}
            onClick={() => {
              update({ page: params.page + 1 });
            }}
          >
            {t('list.next')}
            <ChevronLeftIcon className="ltr:rotate-180" aria-hidden="true" />
          </Button>
        </nav>
      )}

      {phone && layout === 'full' && canCreate && <StickyActionBar>{addButton}</StickyActionBar>}
    </div>
  );
}

/** The search box: it searches once typing pauses, and follows the address (Back, Clear). */
function SearchBox({
  value,
  onSearch,
}: {
  readonly value: string;
  readonly onSearch: (query: string) => void;
}) {
  const { t } = useTranslation('members');
  const [query, setQuery] = useState(value);
  // The query last sent to the address. A change there that didn't come from typing (Back, Clear)
  // shows in the box; our own change doesn't overwrite what is typed meanwhile.
  const [sent, setSent] = useState(value);
  if (value !== sent) {
    setSent(value);
    setQuery(value);
  }
  const search = useEffectEvent((next: string) => {
    setSent(next);
    onSearch(next);
  });

  useEffect(() => {
    const next = query.trim();
    if (next === sent) return;
    const timer = window.setTimeout(() => {
      search(next);
    }, SEARCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [query, sent]);

  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        placeholder={t('list.search')}
        aria-label={t('list.search')}
        className="ps-9"
      />
    </div>
  );
}

/** Gender, branch, tag and sorting: one select each. */
function ListFilters({
  search,
  onChange,
  compact,
}: {
  readonly search: MemberListSearch;
  readonly onChange: (change: Partial<MemberListSearch>) => void;
  readonly compact: boolean;
}) {
  const { t } = useTranslation('members');
  const { language } = usePreferences();
  const branches = useAdminBranches();
  const tags = useMemberTags();
  const tagOptions = tags.data ?? [];
  return (
    <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4')}>
      <NativeSelect
        aria-label={t('list.gender')}
        value={search.gender ?? ''}
        onChange={(event) => {
          const gender = GENDERS.find((each) => each === event.target.value);
          onChange({ gender });
        }}
      >
        <NativeSelectOption value="">{t('list.anyGender')}</NativeSelectOption>
        {GENDERS.map((gender) => (
          <NativeSelectOption key={gender} value={gender}>
            {t(`gender.${gender}`)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label={t('list.branch')}
        value={search.branch ?? ''}
        onChange={(event) => {
          onChange({ branch: event.target.value === '' ? undefined : event.target.value });
        }}
      >
        <NativeSelectOption value="">{t('list.anyBranch')}</NativeSelectOption>
        {(branches.data ?? []).map((branch) => (
          <NativeSelectOption key={branch.id} value={branch.id}>
            {localizedName(branch, language)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label={t('list.tag')}
        value={search.tag ?? ''}
        onChange={(event) => {
          onChange({ tag: event.target.value === '' ? undefined : event.target.value });
        }}
      >
        <NativeSelectOption value="">{t('list.anyTag')}</NativeSelectOption>
        {/* A tag chosen before it went out of use stays choosable, so the filter can be seen. */}
        {search.tag !== undefined && !tagOptions.includes(search.tag) && (
          <NativeSelectOption value={search.tag}>{search.tag}</NativeSelectOption>
        )}
        {tagOptions.map((tag) => (
          <NativeSelectOption key={tag} value={tag}>
            {tag}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label={t('list.sort')}
        value={search.sort ?? 'name'}
        onChange={(event) => {
          const sort = MEMBER_SORTS.find((each) => each === event.target.value);
          onChange({ sort: sort === 'name' ? undefined : sort });
        }}
      >
        {MEMBER_SORTS.map((sort) => (
          <NativeSelectOption key={sort} value={sort}>
            {t(`list.sorts.${sort}`)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

/** The open member's id, for marking it in the list. */
function useOpenMemberId(): string | null {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return /^\/members\/([0-9a-f-]{36})/.exec(pathname)?.[1] ?? null;
}

/** Phones, tablets and the list beside an open member: one card per member. */
function MemberCards({ members }: { readonly members: readonly Member[] }) {
  const { t } = useTranslation('members');
  const branchName = useBranchName();
  const openId = useOpenMemberId();
  return (
    <ul className="flex flex-col gap-2" aria-label={t('list.title')}>
      {members.map((member) => {
        const selected = member.id === openId;
        return (
          <li key={member.id}>
            <Link
              to="/members/$memberId"
              params={{ memberId: member.id }}
              search={(previous) => previous}
              aria-current={selected ? 'page' : undefined}
              data-member={formatMemberNumber(member.memberNumber)}
              className={cn(
                'flex items-center gap-3 rounded-2xl bg-card p-3 ring-1 ring-border transition-colors hover:bg-muted/50',
                selected && 'ring-2 ring-primary',
              )}
            >
              <MemberAvatar name={member.fullName} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-base">{member.fullName}</span>
                  <span dir="ltr" className="shrink-0 text-sm text-muted-foreground tabular-nums">
                    {formatMemberNumber(member.memberNumber)}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  {member.phone !== null && (
                    <span dir="ltr" className="tabular-nums">
                      {formatMemberPhone(member.phone)}
                    </span>
                  )}
                  <span>{branchName(member.branchId)}</span>
                  <MemberStatusBadge status={member.status} />
                  {member.hasHealthNotes && <HealthNotesBadge />}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const COLUMN_IDS = ['number', 'name', 'phone', 'status', 'branch', 'joined', 'tags'] as const;
type ColumnId = (typeof COLUMN_IDS)[number];
const COLUMNS_KEY = 'gym:members:columns';
const helper = createColumnHelper<DataTableFeatures, Member>();

/** The staff member's choice of columns, kept on this device (a convenience: it may be lost). */
function useColumnVisibility(): [ColumnVisibilityState, (next: ColumnVisibilityState) => void] {
  const [visibility, setVisibility] = useState<ColumnVisibilityState>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? '{}');
      if (typeof saved !== 'object' || saved === null) return {};
      return Object.fromEntries(
        Object.entries(saved).filter(
          (entry): entry is [ColumnId, boolean] =>
            COLUMN_IDS.some((id) => id === entry[0]) && typeof entry[1] === 'boolean',
        ),
      );
    } catch {
      return {};
    }
  });
  const save = (next: ColumnVisibilityState) => {
    setVisibility(next);
    try {
      localStorage.setItem(COLUMNS_KEY, JSON.stringify(next));
    } catch {
      // Storage refused (private window): the choice lasts until the page closes.
    }
  };
  return [visibility, save];
}

/** Wide screens: a dense table whose columns the staff member chooses. */
function MemberTable({ members }: { readonly members: readonly Member[] }) {
  const { t } = useTranslation('members');
  const format = useFormat();
  const branchName = useBranchName();
  const navigate = useNavigate({ from: '/members' });
  const openId = useOpenMemberId();
  const [columnVisibility, setColumnVisibility] = useColumnVisibility();

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('memberNumber', {
          id: 'number',
          header: () => t('columns.number'),
          cell: (info) => (
            <span dir="ltr" className="text-muted-foreground tabular-nums">
              {formatMemberNumber(info.getValue())}
            </span>
          ),
        }),
        helper.accessor('fullName', {
          id: 'name',
          enableHiding: false,
          header: () => t('columns.name'),
          cell: (info) => (
            <Link
              to="/members/$memberId"
              params={{ memberId: info.row.original.id }}
              search={(previous) => previous}
              data-member={formatMemberNumber(info.row.original.memberNumber)}
              className="flex items-center gap-2 outline-none focus-visible:underline"
              onClick={(event) => {
                // The row opens the member too; one navigation is enough.
                event.stopPropagation();
              }}
            >
              <MemberAvatar name={info.getValue()} />
              <span>{info.getValue()}</span>
            </Link>
          ),
        }),
        helper.accessor('phone', {
          id: 'phone',
          header: () => t('columns.phone'),
          cell: (info) => {
            const phone = info.getValue();
            return phone === null ? null : (
              <span dir="ltr" className="whitespace-nowrap tabular-nums">
                {formatMemberPhone(phone)}
              </span>
            );
          },
        }),
        helper.display({
          id: 'status',
          header: () => t('columns.status'),
          cell: (info) => (
            <span className="flex flex-wrap gap-1">
              <MemberStatusBadge status={info.row.original.status} />
              {info.row.original.hasHealthNotes && <HealthNotesBadge />}
            </span>
          ),
        }),
        helper.accessor('branchId', {
          id: 'branch',
          header: () => t('columns.branch'),
          cell: (info) => branchName(info.getValue()),
        }),
        helper.accessor('createdAt', {
          id: 'joined',
          header: () => t('columns.joined'),
          cell: (info) => (
            <span className="whitespace-nowrap">{format.date(info.getValue(), 'short')}</span>
          ),
        }),
        helper.accessor('tags', {
          id: 'tags',
          header: () => t('columns.tags'),
          cell: (info) => info.getValue().join('، '),
        }),
      ]),
    [t, format, branchName],
  );

  const data = useMemo(() => [...members], [members]);
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    getRowId: (member) => member.id,
    state: { columnVisibility },
    onColumnVisibilityChange: (updater) => {
      setColumnVisibility(typeof updater === 'function' ? updater(columnVisibility) : updater);
    },
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <ColumnVisibilityMenu
          table={table}
          label={t('list.columns')}
          columnLabel={(id) => {
            const column = COLUMN_IDS.find((each) => each === id);
            return column ? t(`columns.${column}`) : id;
          }}
        />
      </div>
      <DataTable
        table={table}
        label={t('list.title')}
        isRowSelected={(member) => member.id === openId}
        onRowClick={(member) => {
          void navigate({
            to: '/members/$memberId',
            params: { memberId: member.id },
            search: (previous) => previous,
          });
        }}
      />
    </div>
  );
}
