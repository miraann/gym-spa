import { addDays, baghdadMoment, weekStartOf } from '@gym/core';
import { localizedName } from '@gym/i18n';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { Button } from '@gym/ui/components/button';
import { Skeleton } from '@gym/ui/components/skeleton';
import { cn } from '@gym/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleXIcon,
  SettingsIcon,
  UsersIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BranchSelect } from '@/components/branch-select';
import { RequirePermission } from '@/components/no-access';
import { usePermission } from '@/features/auth/use-permissions';
import { useTrainers } from '@/features/hr/hr-data';
import { useBranchChoice } from '@/lib/use-branch-choice';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { useBaghdadToday } from '@/lib/use-today';
import { useClassTypes, useClassWeek, type ClassOccurrence } from './class-data';
import { ClassError } from './class-error';
import { classErrorKey } from './class-errors';
import { SessionDialog } from './session-dialog';

/** /classes (classes.view): a branch's classes of a week; a class opens its bookings. */
export function ClassesPage() {
  return (
    <RequirePermission permission="classes.view">
      <Classes />
    </RequirePermission>
  );
}

function Classes() {
  const { t } = useTranslation('classes');
  const { language } = usePreferences();
  const format = useFormat();
  const today = useBaghdadToday();
  const mayManage = usePermission('classes.manage');
  const { branchId, setBranchId, active, loaded } = useBranchChoice();
  const [weekStart, setWeekStart] = useState(weekStartOf(today));
  const week = useClassWeek(branchId, weekStart);
  const types = useClassTypes();
  const trainers = useTrainers(null);
  const [open, setOpen] = useState<{ scheduleId: string; date: string } | null>(null);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const typeOf = (id: string) => types.data?.find((each) => each.id === id);
  const trainerOf = (id: string | null) => trainers.data?.find((each) => each.id === id)?.fullName;
  const opened =
    open === null
      ? null
      : (week.occurrences.find(
          (each) => each.scheduleId === open.scheduleId && each.date === open.date,
        ) ?? null);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
        actions={
          mayManage && (
            <Button asChild variant="outline">
              <Link to="/classes/setup">
                <SettingsIcon data-icon="inline-start" />
                {t('page.setup')}
              </Link>
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <BranchSelect
          label={t('page.branch')}
          branchId={branchId}
          active={active}
          onChange={setBranchId}
        />
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label={t('page.previousWeek')}
            onClick={() => {
              setWeekStart(addDays(weekStart, -7));
            }}
          >
            <ChevronRightIcon className="ltr:rotate-180" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            disabled={weekStart === weekStartOf(today)}
            onClick={() => {
              setWeekStart(weekStartOf(today));
            }}
          >
            {t('page.thisWeek')}
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={t('page.nextWeek')}
            onClick={() => {
              setWeekStart(addDays(weekStart, 7));
            }}
          >
            <ChevronLeftIcon className="ltr:rotate-180" aria-hidden="true" />
          </Button>
        </div>
        <h2 className="text-lg">{`${format.date(weekStart)} – ${format.date(addDays(weekStart, 6))}`}</h2>
      </div>

      {loaded && branchId === '' ? null : week.error ? (
        <ClassError error={classErrorKey(week.error, 'load_week')} />
      ) : week.isPending ? (
        <Skeleton className="h-64 rounded-3xl" />
      ) : week.occurrences.length === 0 ? (
        <p className="text-muted-foreground">{t('page.empty')}</p>
      ) : (
        <div className="overflow-x-auto" data-testid="class-week">
          <div className="grid min-w-[56rem] grid-cols-7 gap-2">
            {days.map((day) => (
              <section
                key={day}
                aria-label={format.date(day)}
                className={cn(
                  'flex flex-col gap-2 rounded-3xl bg-card p-2',
                  day === today && 'ring-2 ring-primary/30',
                )}
              >
                <h3 className="px-2 py-1 text-sm font-medium">
                  {format.date(baghdadMoment(day, 12 * 60), 'full')}
                </h3>
                {week.occurrences
                  .filter((each) => each.date === day)
                  .map((occurrence) => {
                    const type = typeOf(occurrence.classTypeId);
                    return (
                      <ClassTile
                        key={`${occurrence.scheduleId}-${day}`}
                        occurrence={occurrence}
                        name={type ? localizedName(type, language) : ''}
                        trainer={trainerOf(occurrence.trainerId) ?? t('page.noTrainer')}
                        onOpen={() => {
                          setOpen({ scheduleId: occurrence.scheduleId, date: occurrence.date });
                        }}
                      />
                    );
                  })}
              </section>
            ))}
          </div>
        </div>
      )}
      {opened && (
        <SessionDialog
          occurrence={opened}
          name={(() => {
            const type = typeOf(opened.classTypeId);
            return type ? localizedName(type, language) : '';
          })()}
          trainer={trainerOf(opened.trainerId) ?? t('page.noTrainer')}
          onClose={() => {
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}

function ClassTile({
  occurrence,
  name,
  trainer,
  onOpen,
}: {
  readonly occurrence: ClassOccurrence;
  readonly name: string;
  readonly trainer: string;
  readonly onOpen: () => void;
}) {
  const { t } = useTranslation('classes');
  const format = useFormat();
  const full = occurrence.taken >= occurrence.capacity;
  return (
    <button
      type="button"
      data-class={name}
      data-cancelled={occurrence.cancelled || undefined}
      className={cn(
        'flex flex-col gap-1 rounded-2xl px-3 py-2 text-start text-sm ring-1 ring-border outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/60',
        occurrence.cancelled && 'bg-muted text-muted-foreground line-through',
      )}
      onClick={onOpen}
    >
      <span className="tabular-nums">{`${format.time(occurrence.startsAt)}–${format.time(occurrence.endsAt)}`}</span>
      <span className="font-medium">{name}</span>
      <span className="text-xs text-muted-foreground">{trainer}</span>
      {occurrence.place && (
        <span className="text-xs text-muted-foreground">{occurrence.place}</span>
      )}
      {occurrence.cancelled ? (
        <span className="flex items-center gap-1 text-xs no-underline">
          <CircleXIcon aria-hidden className="size-3.5" />
          {t('page.cancelled')}
        </span>
      ) : (
        <span
          className={cn('flex items-center gap-1 text-xs tabular-nums', full && 'text-warning')}
        >
          <UsersIcon aria-hidden className="size-3.5" />
          {t('page.places', {
            taken: format.number(occurrence.taken),
            capacity: format.number(occurrence.capacity),
          })}
        </span>
      )}
    </button>
  );
}
