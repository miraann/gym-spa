import { matchesSearch } from '@gym/core';
import { localizedName } from '@gym/i18n';
import { AddTile } from '@gym/ui/blocks/add-tile';
import { Chip, ChipRow } from '@gym/ui/blocks/chip-row';
import {
  GroupedList,
  GroupedListItem,
  GroupedListSkeleton,
  RowChevron,
} from '@gym/ui/blocks/list-group';
import { groupedRowClass } from '@gym/ui/lib/grouped-list';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { Button } from '@gym/ui/components/button';
import { Card } from '@gym/ui/components/card';
import { Input } from '@gym/ui/components/input';
import { Link, useRouterState } from '@tanstack/react-router';
import { CalendarRangeIcon, ClockIcon, SearchIcon, UsersIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermission } from '@/features/auth/use-permissions';
import { initials } from '@/lib/initials';
import { usePreferences } from '@/lib/preferences';
import { useRoleOverview, useStaffDirectory } from './admin-data';
import { adminErrorKey } from './admin-errors';
import { AdminError } from './admin-error';
import { StaffBadges } from './staff-badges';

const FILTERS = ['active', 'inactive', 'all'] as const;
type Filter = (typeof FILTERS)[number];

/** The staff the acting staff member may see: search, active or not, and the way to add one. */
export function StaffList() {
  const { t } = useTranslation('staff');
  const { language } = usePreferences();
  const canManage = usePermission('staff.manage');
  const mayViewHr = usePermission('hr.view');
  const { t: hr } = useTranslation('hr');
  const staff = useStaffDirectory();
  const roles = useRoleOverview();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('active');

  const roleName = (roleId: string) => {
    const role = roles.data?.find((each) => each.id === roleId);
    return role ? localizedName(role, language) : '';
  };
  const shown = (staff.data ?? []).filter(
    (member) =>
      (filter === 'all' || member.isActive === (filter === 'active')) &&
      matchesSearch(
        query,
        member.fullName,
        member.username,
        member.phone ?? '',
        roleName(member.roleId),
      ),
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('list.title')}
        actions={
          <>
            {mayViewHr && (
              <>
                <Button asChild variant="outline">
                  <Link to="/hr/clock">
                    <ClockIcon data-icon="inline-start" />
                    {hr('links.clock')}
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/hr/shifts">
                    <CalendarRangeIcon data-icon="inline-start" />
                    {hr('links.shifts')}
                  </Link>
                </Button>
              </>
            )}
          </>
        }
      />
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
      <ChipRow label={t('list.filter')}>
        {FILTERS.map((each) => (
          <Chip
            key={each}
            selected={filter === each}
            aria-pressed={filter === each}
            onClick={() => {
              setFilter(each);
            }}
          >
            {t(`list.filters.${each}`)}
          </Chip>
        ))}
      </ChipRow>

      {canManage && (
        <AddTile asChild label={t('list.add')}>
          <Link to="/staff/new" />
        </AddTile>
      )}

      {staff.isPending ? (
        <GroupedListSkeleton avatar />
      ) : staff.isError ? (
        <AdminError error={adminErrorKey(staff.error, 'list')} />
      ) : shown.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
          <UsersIcon className="size-8" aria-hidden="true" />
          {staff.data.length === 0 ? t('list.empty') : t('list.noMatch')}
        </Card>
      ) : (
        <GroupedList aria-label={t('list.title')}>
          {shown.map((member) => {
            const selected = pathname === `/staff/${member.id}`;
            return (
              <GroupedListItem key={member.id} inset>
                <Link
                  to="/staff/$staffId"
                  params={{ staffId: member.id }}
                  aria-current={selected ? 'page' : undefined}
                  data-staff={member.username}
                  className={groupedRowClass(selected)}
                >
                  <span
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/12 font-bold text-primary"
                  >
                    {initials(member.fullName)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{member.fullName}</span>
                      <span className="flex shrink-0 flex-wrap justify-end gap-1">
                        <StaffBadges member={member} />
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                      <span dir="ltr" className="font-mono">
                        {member.username}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{roleName(member.roleId)}</span>
                    </span>
                  </span>
                  <RowChevron />
                </Link>
              </GroupedListItem>
            );
          })}
        </GroupedList>
      )}
    </div>
  );
}
