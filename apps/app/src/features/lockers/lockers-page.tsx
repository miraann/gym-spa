import { LOCKER_ZONES, lockerStatus, type LockerZone } from '@gym/core';
import { localizedName } from '@gym/i18n';
import { AddTile } from '@gym/ui/blocks/add-tile';
import { Chip, ChipRow } from '@gym/ui/blocks/chip-row';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { Button } from '@gym/ui/components/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@gym/ui/components/empty';
import { Field, FieldLabel } from '@gym/ui/components/field';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { Skeleton } from '@gym/ui/components/skeleton';
import { cn } from '@gym/ui/lib/utils';
import { KeyRoundIcon, TagIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RequirePermission } from '@/components/no-access';
import { usePermission } from '@/features/auth/use-permissions';
import { useMoneyBranch } from '@/features/payments/money-branch';
import { useAdminBranches } from '@/features/staff/admin-data';
import { usePreferences } from '@/lib/preferences';
import { useBaghdadToday } from '@/lib/use-today';
import { LockerDialog } from './locker-dialog';
import { AddLockersDialog, LockerSettingsDialog } from './locker-manage';
import { LockerError } from './locker-error';
import { lockerErrorKey } from './locker-errors';
import { NotReturnedList } from './not-returned';
import { useLockerMap } from './locker-data';
import { STATUS_LOOK, type MapLocker } from './locker-look';

/** /lockers (lockers.view): a branch's locker map, by zone, with each locker's status. */
export function LockersPage() {
  return (
    <RequirePermission permission="lockers.view">
      <Lockers />
    </RequirePermission>
  );
}

const FILTERS = ['all', 'free', 'occupied', 'reserved', 'overdue', 'out_of_order'] as const;
type Filter = (typeof FILTERS)[number];

function Lockers() {
  const { t } = useTranslation('lockers');
  const { language } = usePreferences();
  const id = useId();
  const today = useBaghdadToday();
  const branches = useAdminBranches();
  const defaultBranch = useMoneyBranch(branches.data);
  const [chosenBranch, setChosenBranch] = useState<string | null>(null);
  const activeBranches = (branches.data ?? []).filter((branch) => branch.isActive);
  const branchId = chosenBranch ?? defaultBranch;
  const map = useLockerMap(branchId);
  const mayManage = usePermission('lockers.manage');
  const mayPrice = usePermission('settings.edit');
  const [filter, setFilter] = useState<Filter>('all');
  const [zone, setZone] = useState<LockerZone | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pricing, setPricing] = useState(false);

  const all: MapLocker[] = (map.data?.lockers ?? []).map((locker) => {
    const holder = map.data?.holders.get(locker.id) ?? null;
    return { locker, holder, status: lockerStatus(locker.outOfOrderNote !== null, holder, today) };
  });
  const count = (status: Filter) =>
    status === 'all' ? all.length : all.filter((each) => each.status === status).length;
  const shown = all.filter(
    (each) =>
      (filter === 'all' || each.status === filter) && (zone === 'all' || each.locker.zone === zone),
  );
  const zones = LOCKER_ZONES.filter((each) => all.some((item) => item.locker.zone === each));
  const open = all.find((each) => each.locker.id === openId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
        actions={
          <>
            {mayPrice && (
              <Button
                variant="outline"
                onClick={() => {
                  setPricing(true);
                }}
              >
                <TagIcon aria-hidden />
                {t('prices.open')}
              </Button>
            )}
          </>
        }
      />
      {activeBranches.length > 1 && (
        <Field className="md:w-72">
          <FieldLabel htmlFor={`${id}-branch`}>{t('page.branch')}</FieldLabel>
          <NativeSelect
            id={`${id}-branch`}
            value={branchId}
            onChange={(event) => {
              setChosenBranch(event.target.value);
              setOpenId(null);
            }}
          >
            {activeBranches.map((branch) => (
              <NativeSelectOption key={branch.id} value={branch.id}>
                {localizedName(branch, language)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      )}
      {mayManage && branchId !== '' && (
        <AddTile
          label={t('add.open')}
          onClick={() => {
            setAdding(true);
          }}
        />
      )}
      {branches.isSuccess && branchId === '' ? (
        <p className="text-muted-foreground">{t('page.noBranch')}</p>
      ) : map.isPending ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-2">
          {Array.from({ length: 24 }, (_, index) => (
            <Skeleton key={index} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : map.isError ? (
        <LockerError error={lockerErrorKey(map.error, 'load_lockers')} />
      ) : all.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <KeyRoundIcon />
            </EmptyMedia>
            <EmptyDescription>{t('page.empty')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <NotReturnedList branchId={branchId} lockers={all} onOpen={setOpenId} />
          <div className="flex flex-col gap-3">
            <ChipRow label={t('filters.status')}>
              {FILTERS.map((each) => (
                <Chip
                  key={each}
                  selected={filter === each}
                  aria-pressed={filter === each}
                  onClick={() => {
                    setFilter(each);
                  }}
                >
                  {t(`filters.${each}`)}
                  <span className="tabular-nums opacity-70">{count(each)}</span>
                </Chip>
              ))}
            </ChipRow>
            {zones.length > 1 && (
              <ChipRow label={t('filters.zone')}>
                {(['all', ...zones] as const).map((each) => (
                  <Chip
                    key={each}
                    selected={zone === each}
                    aria-pressed={zone === each}
                    onClick={() => {
                      setZone(each);
                    }}
                  >
                    {each === 'all' ? t('filters.allZones') : t(`zones.${each}`)}
                  </Chip>
                ))}
              </ChipRow>
            )}
          </div>
          {shown.length === 0 ? (
            <p className="text-muted-foreground">{t('page.noneShown')}</p>
          ) : (
            LOCKER_ZONES.filter((each) => shown.some((item) => item.locker.zone === each)).map(
              (each) => (
                <section
                  key={each}
                  className="flex flex-col gap-3"
                  aria-labelledby={`${id}-${each}`}
                >
                  <h2 id={`${id}-${each}`} className="text-lg text-muted-foreground">
                    {t(`zones.${each}`)}
                  </h2>
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-2">
                    {shown
                      .filter((item) => item.locker.zone === each)
                      .map((item) => (
                        <li key={item.locker.id}>
                          <LockerTile
                            item={item}
                            onOpen={() => {
                              setOpenId(item.locker.id);
                            }}
                          />
                        </li>
                      ))}
                  </ul>
                </section>
              ),
            )
          )}
        </>
      )}
      {open && (
        <LockerDialog
          item={open}
          branchId={branchId}
          onClose={() => {
            setOpenId(null);
          }}
        />
      )}
      {adding && (
        <AddLockersDialog
          branchId={branchId}
          onClose={() => {
            setAdding(false);
          }}
        />
      )}
      {pricing && (
        <LockerSettingsDialog
          branchId={branchId}
          onClose={() => {
            setPricing(false);
          }}
        />
      )}
    </div>
  );
}

function LockerTile({ item, onOpen }: { readonly item: MapLocker; readonly onOpen: () => void }) {
  const { t } = useTranslation('lockers');
  const look = STATUS_LOOK[item.status];
  const Icon = look.icon;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-locker={item.locker.number}
      data-status={item.status}
      aria-label={t('tile.label', {
        number: item.locker.number,
        status: t(`status.${item.status}`),
      })}
      className={cn(
        'flex h-20 w-full flex-col items-center justify-center gap-1 rounded-2xl px-1 transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-safe:active:scale-95',
        look.tile,
      )}
    >
      <span dir="ltr" className="text-xl font-semibold tabular-nums">
        {item.locker.number}
      </span>
      <span className="flex max-w-full items-center gap-1 text-xs">
        <Icon aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">{t(`status.${item.status}`)}</span>
      </span>
    </button>
  );
}
