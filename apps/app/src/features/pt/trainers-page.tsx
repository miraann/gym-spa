import { isCleanText, normalizeName, parseWholeNumber } from '@gym/core';
import { localizedName } from '@gym/i18n';
import { AddTile } from '@gym/ui/blocks/add-tile';
import { GroupedList, GroupedListItem, RowChevron } from '@gym/ui/blocks/list-group';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Badge } from '@gym/ui/components/badge';
import { Button } from '@gym/ui/components/button';
import { Checkbox } from '@gym/ui/components/checkbox';
import { Field, FieldError, FieldGroup, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Label } from '@gym/ui/components/label';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Spinner } from '@gym/ui/components/spinner';
import { groupedRowClass } from '@gym/ui/lib/grouped-list';
import { Link } from '@tanstack/react-router';
import { ChartColumnIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { RequirePermission } from '@/components/no-access';
import { usePermission } from '@/features/auth/use-permissions';
import { useTrainers } from '@/features/hr/hr-data';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { useBaghdadToday } from '@/lib/use-today';
import { LogSessionDialog } from './member-pt';
import {
  useOpenPtPackages,
  usePtPackages,
  useSavePtPackage,
  type MemberPtPackage,
  type PtPackage,
} from './pt-data';
import { PtError } from './pt-error';
import { ptErrorKey, type PtErrorKey } from './pt-errors';

/** /trainers (pt.log): members with personal training sessions left, and the PT packages. */
export function TrainersPage() {
  return (
    <RequirePermission permission="pt.log">
      <Trainers />
    </RequirePermission>
  );
}

function Trainers() {
  const { t } = useTranslation('pt');
  const { language } = usePreferences();
  const format = useFormat();
  const today = useBaghdadToday();
  const mayManage = usePermission('pt.manage');
  const mayReport = usePermission('hr.view');
  const clients = useOpenPtPackages(today);
  const packages = usePtPackages();
  const trainers = useTrainers(null);
  const [logging, setLogging] = useState<MemberPtPackage | null>(null);
  const [editing, setEditing] = useState<PtPackage | 'new' | null>(null);
  const trainerName = (id: string) => trainers.data?.find((each) => each.id === id)?.fullName ?? '';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
        actions={
          mayReport && (
            <Button asChild variant="outline">
              <Link to="/trainers/report">
                <ChartColumnIcon data-icon="inline-start" />
                {t('page.report')}
              </Link>
            </Button>
          )
        }
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg">{t('page.clients')}</h2>
        {clients.isPending ? (
          <Skeleton className="h-24 rounded-3xl" />
        ) : clients.isError ? (
          <PtError error={ptErrorKey(clients.error, 'load_clients')} />
        ) : clients.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('page.noClients')}</p>
        ) : (
          <GroupedList aria-label={t('page.clients')}>
            {clients.data.map((pack) => (
              <GroupedListItem key={pack.id}>
                <button
                  type="button"
                  className={groupedRowClass()}
                  data-pt-client={pack.memberName ?? pack.memberId}
                  onClick={() => {
                    setLogging(pack);
                  }}
                >
                  <span className="flex flex-1 flex-col gap-1">
                    <span className="font-medium">{pack.memberName ?? '—'}</span>
                    <span className="text-sm text-muted-foreground">
                      {`${localizedName(pack, language)} · ${trainerName(pack.trainerId)}`}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {t('member.left', {
                      left: format.number(pack.left),
                      total: format.number(pack.sessionCount),
                    })}
                  </span>
                  <RowChevron />
                </button>
              </GroupedListItem>
            ))}
          </GroupedList>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg">{t('page.packages')}</h2>
        {mayManage && (
          <AddTile
            label={t('page.addPackage')}
            onClick={() => {
              setEditing('new');
            }}
          />
        )}
        {packages.isPending ? (
          <Skeleton className="h-24 rounded-3xl" />
        ) : packages.isError ? (
          <PtError error={ptErrorKey(packages.error, 'load_packages')} />
        ) : packages.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('page.noPackages')}</p>
        ) : (
          <GroupedList aria-label={t('page.packages')}>
            {packages.data.map((pack) => (
              <GroupedListItem key={pack.id}>
                <button
                  type="button"
                  className={groupedRowClass()}
                  disabled={!mayManage}
                  data-pt-package-type={pack.nameCkb}
                  onClick={() => {
                    setEditing(pack);
                  }}
                >
                  <span className="flex flex-1 flex-col gap-1">
                    <span className="font-medium">{localizedName(pack, language)}</span>
                    <span className="text-sm text-muted-foreground">
                      {[
                        t('page.sessions', { count: format.number(pack.sessionCount) }),
                        pack.validDays === null
                          ? t('page.noLimit')
                          : t('page.validFor', { count: format.number(pack.validDays) }),
                      ].join(' · ')}
                    </span>
                  </span>
                  <span className="tabular-nums">{format.money(pack.price)}</span>
                  {!pack.isActive && <Badge variant="secondary">{t('page.inactive')}</Badge>}
                  {mayManage && <RowChevron />}
                </button>
              </GroupedListItem>
            ))}
          </GroupedList>
        )}
      </section>

      {logging && (
        <LogSessionDialog
          pack={logging}
          name={logging.memberName ?? ''}
          onClose={() => {
            setLogging(null);
          }}
        />
      )}
      {editing && (
        <PackageDialog
          pack={editing === 'new' ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function PackageDialog({
  pack,
  onClose,
}: {
  readonly pack: PtPackage | null;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('pt');
  const id = useId();
  const { online, readOnly } = useAdminWriteState();
  const save = useSavePtPackage();
  const [nameCkb, setNameCkb] = useState(pack?.nameCkb ?? '');
  const [nameEn, setNameEn] = useState(pack?.nameEn ?? '');
  const [nameAr, setNameAr] = useState(pack?.nameAr ?? '');
  const [sessions, setSessions] = useState(String(pack?.sessionCount ?? 10));
  const [price, setPrice] = useState(pack ? String(pack.price) : '');
  const [validDays, setValidDays] = useState(pack?.validDays == null ? '' : String(pack.validDays));
  const [isActive, setIsActive] = useState(pack?.isActive ?? true);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<PtErrorKey | null>(null);
  const name = normalizeName(nameCkb);
  const sessionsValue = parseWholeNumber(sessions);
  const priceValue = parseWholeNumber(price);
  const daysValue = validDays.trim() === '' ? null : parseWholeNumber(validDays);
  const nameProblem = !isCleanText(name, 80);
  const sessionsProblem = sessionsValue === null || sessionsValue < 1 || sessionsValue > 200;
  const priceProblem = priceValue === null;
  const daysProblem =
    validDays.trim() !== '' && (daysValue === null || daysValue < 1 || daysValue > 3650);

  const confirm = () => {
    setSent(true);
    if (nameProblem || sessionsProblem || priceProblem || daysProblem) return;
    setError(null);
    save.mutate(
      {
        id: pack?.id ?? null,
        pack: {
          nameCkb: name,
          nameEn: normalizeName(nameEn) || null,
          nameAr: normalizeName(nameAr) || null,
          sessionCount: sessionsValue,
          price: priceValue,
          validDays: daysValue,
          isActive,
        },
      },
      {
        onSuccess: () => {
          toast.success(t('package.saved'));
          onClose();
        },
        onError: (thrown) => {
          setError(ptErrorKey(thrown, 'save_package'));
        },
      },
    );
  };

  const text = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    invalid: boolean,
    field: string,
    extra?: { dir?: 'ltr' | 'rtl'; numeric?: boolean },
  ) => (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={`${id}-${field}`}>{label}</FieldLabel>
      <Input
        id={`${id}-${field}`}
        dir={extra?.dir}
        inputMode={extra?.numeric ? 'numeric' : undefined}
        className={extra?.numeric ? 'tabular-nums' : undefined}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      {invalid && (
        <FieldError>
          {field === 'name' ? t('package.nameProblem') : t('package.numberProblem')}
        </FieldError>
      )}
    </Field>
  );

  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('package.title')}
      footer={
        <>
          <Button disabled={!online || readOnly || save.isPending} onClick={confirm}>
            {save.isPending && <Spinner />}
            {t('actions.save')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </>
      }
    >
      <FieldGroup data-testid="pt-package-form">
        {text(t('package.nameCkb'), nameCkb, setNameCkb, sent && nameProblem, 'name')}
        <div className="grid gap-4 sm:grid-cols-2">
          {text(t('package.nameEn'), nameEn, setNameEn, false, 'en', { dir: 'ltr' })}
          {text(t('package.nameAr'), nameAr, setNameAr, false, 'ar', { dir: 'rtl' })}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {text(t('package.sessions'), sessions, setSessions, sent && sessionsProblem, 'sessions', {
            dir: 'ltr',
            numeric: true,
          })}
          {text(t('package.price'), price, setPrice, sent && priceProblem, 'price', {
            dir: 'ltr',
            numeric: true,
          })}
          {text(t('package.validDays'), validDays, setValidDays, sent && daysProblem, 'days', {
            dir: 'ltr',
            numeric: true,
          })}
        </div>
        <div className="flex items-center gap-3">
          <Checkbox
            id={`${id}-active`}
            checked={isActive}
            onCheckedChange={(checked) => {
              setIsActive(checked === true);
            }}
          />
          <Label htmlFor={`${id}-active`} className="font-normal">
            {t('package.active')}
          </Label>
        </div>
        <PtError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}
