import { matchesSearch } from '@gym/core';
import { localizedName } from '@gym/i18n';
import { Chip, ChipRow } from '@gym/ui/blocks/chip-row';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { Button } from '@gym/ui/components/button';
import { Card } from '@gym/ui/components/card';
import { Input } from '@gym/ui/components/input';
import { Skeleton } from '@gym/ui/components/skeleton';
import { useLayout } from '@gym/ui/hooks/use-layout';
import { Link } from '@tanstack/react-router';
import { Building2Icon, PlusIcon, SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGyms, type GymRow } from '@/lib/api';
import { panelErrorKey } from '@/lib/errors';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { FormError } from '@/shell/form-error';
import { GymStateBadge, gymState, type GymState } from './gym-state';

const FILTERS = ['all', 'active', 'grace', 'read_only', 'suspended', 'locked'] as const;
type Filter = (typeof FILTERS)[number];

function PaidUntil({ gym }: { readonly gym: GymRow }) {
  const { t } = useTranslation('seller');
  const format = useFormat();
  if (gym.edition === 'offline') return <span>{t('gyms.offline')}</span>;
  if (gym.paid_until === null) return <span>{t('gyms.noEnd')}</span>;
  // The end of the paid day: one millisecond before paid_until is that day.
  return <span>{format.date(Date.parse(gym.paid_until) - 1)}</span>;
}

function Usage({ gym }: { readonly gym: GymRow }) {
  const { t } = useTranslation('seller');
  const format = useFormat();
  return (
    <span className="tabular-nums">
      {t('gyms.usageShort', {
        members: format.number(gym.members),
        branches: format.number(gym.active_branches),
        staff: format.number(gym.active_staff),
        devices: format.number(gym.active_devices),
      })}
    </span>
  );
}

/** Every gym: code, name, state, subscription and usage counts (members too). Never any of its data. */
export function GymsPage() {
  const { t } = useTranslation('seller');
  const { language } = usePreferences();
  const layout = useLayout();
  const gyms = useGyms();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const shown = (gyms.data ?? []).filter(
    (gym) =>
      (filter === 'all' || gymState(gym) === (filter satisfies GymState)) &&
      matchesSearch(query, gym.code, gym.name_ckb, gym.name_en, gym.name_ar),
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('gyms.title')}
        actions={
          <Button asChild size="lg">
            <Link to="/gyms/new">
              <PlusIcon data-icon="inline-start" />
              {t('gyms.new')}
            </Link>
          </Button>
        }
      />
      <div className="relative max-w-md">
        <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          placeholder={t('gyms.search')}
          aria-label={t('gyms.search')}
          className="ps-9"
        />
      </div>
      <ChipRow label={t('gyms.state')}>
        {FILTERS.map((each) => (
          <Chip
            key={each}
            selected={filter === each}
            onClick={() => {
              setFilter(each);
            }}
          >
            {each === 'all' ? t('gyms.all') : t(`state.${each}`)}
          </Chip>
        ))}
      </ChipRow>

      {gyms.isPending ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : gyms.isError ? (
        <FormError error={panelErrorKey(gyms.error)} />
      ) : shown.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
          <Building2Icon className="size-8" aria-hidden="true" />
          {gyms.data.length === 0 ? t('gyms.empty') : t('gyms.noMatch')}
        </Card>
      ) : layout === 'phone' ? (
        <ul className="flex flex-col gap-2">
          {shown.map((gym) => (
            <li key={gym.id}>
              <Link
                to="/gyms/$gymId"
                params={{ gymId: gym.id }}
                className="flex flex-col gap-2 rounded-2xl bg-card p-4 ring-1 ring-border"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-base">
                    {localizedName(gymNames(gym), language)}
                  </span>
                  <GymStateBadge state={gymState(gym)} />
                </span>
                <span dir="ltr" className="font-mono text-sm text-muted-foreground">
                  {gym.code}
                </span>
                <span className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
                  <PaidUntil gym={gym} />
                  <Usage gym={gym} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-3 text-start font-normal">{t('gyms.code')}</th>
                <th className="px-4 py-3 text-start font-normal">{t('gyms.name')}</th>
                <th className="px-4 py-3 text-start font-normal">{t('gyms.state')}</th>
                <th className="px-4 py-3 text-start font-normal">{t('gyms.paidUntil')}</th>
                <th className="px-4 py-3 text-start font-normal">{t('gyms.usage')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((gym) => (
                <tr key={gym.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <Link
                      to="/gyms/$gymId"
                      params={{ gymId: gym.id }}
                      dir="ltr"
                      className="font-mono text-primary hover:underline"
                    >
                      {gym.code}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{localizedName(gymNames(gym), language)}</td>
                  <td className="px-4 py-3">
                    <GymStateBadge state={gymState(gym)} />
                  </td>
                  <td className="px-4 py-3">
                    <PaidUntil gym={gym} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <Usage gym={gym} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

/** A gym's names in the shape localizedName() reads. */
export function gymNames(gym: Pick<GymRow, 'name_ckb' | 'name_en' | 'name_ar'>) {
  return { nameCkb: gym.name_ckb, nameEn: gym.name_en, nameAr: gym.name_ar };
}
