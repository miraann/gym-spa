import { localizedName } from '@gym/i18n';
import { AddTile } from '@gym/ui/blocks/add-tile';
import { ChoiceGroup } from '@gym/ui/blocks/choice-group';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Button } from '@gym/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@gym/ui/components/field';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { Spinner } from '@gym/ui/components/spinner';
import { Textarea } from '@gym/ui/components/textarea';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePermission } from '@/features/auth/use-permissions';
import { useTrainers } from '@/features/hr/hr-data';
import type { Member } from '@/features/members/member-data';
import { useMoneyBranch } from '@/features/payments/money-branch';
import { PayNow } from '@/features/payments/pay-now';
import { usePayNow } from '@/features/payments/use-pay-now';
import { useAdminBranches } from '@/features/staff/admin-data';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { useBaghdadToday } from '@/lib/use-today';
import {
  useLogPtSession,
  useMemberPtPackages,
  usePtPackages,
  useSellPtPackage,
  type MemberPtPackage,
  type PtPackage,
} from './pt-data';
import { PtError } from './pt-error';
import { ptErrorKey, type PtErrorKey } from './pt-errors';

/**
 * A member's personal training, on their page: their packages with the sessions left, logging a
 * session (pt.log) and selling a package (pt.log and payments.create). Nothing when there is
 * nothing to show or do.
 */
export function MemberPtCard({ member }: { readonly member: Member }) {
  const { t } = useTranslation('pt');
  const { language } = usePreferences();
  const format = useFormat();
  const today = useBaghdadToday();
  const mayLog = usePermission('pt.log');
  const mayTakeMoney = usePermission('payments.create');
  const packages = useMemberPtPackages(member.id);
  const forSale = usePtPackages();
  const trainers = useTrainers(null);
  const [selling, setSelling] = useState(false);
  const [logging, setLogging] = useState<MemberPtPackage | null>(null);
  const onSale = (forSale.data ?? []).filter((pack) => pack.isActive);
  const canSell = mayLog && mayTakeMoney && onSale.length > 0 && member.status !== 'archived';
  const owned = packages.data ?? [];
  if (owned.length === 0 && !canSell) return null;
  const trainerName = (id: string) => trainers.data?.find((each) => each.id === id)?.fullName ?? '';

  return (
    <Card data-testid="member-pt">
      <CardHeader>
        <CardTitle>
          <h3>{t('member.title')}</h3>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {canSell && (
          <AddTile
            label={t('member.sell')}
            onClick={() => {
              setSelling(true);
            }}
          />
        )}
        {packages.isError ? (
          <PtError error={ptErrorKey(packages.error, 'load_member_packages')} />
        ) : owned.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('member.none')}</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {owned.map((pack) => {
              const usable = pack.left > 0 && (pack.expiresOn === null || pack.expiresOn >= today);
              return (
                <li
                  key={pack.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
                  data-pt-package={pack.nameCkb}
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{localizedName(pack, language)}</span>
                    <span className="text-sm text-muted-foreground">
                      {[
                        t('member.trainer', { name: trainerName(pack.trainerId) }),
                        pack.expiresOn
                          ? t('member.until', { date: format.date(pack.expiresOn) })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="ms-auto tabular-nums">
                    {t('member.left', {
                      left: format.number(pack.left),
                      total: format.number(pack.sessionCount),
                    })}
                  </span>
                  {mayLog && usable && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setLogging(pack);
                      }}
                    >
                      {t('log.open')}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      {selling && (
        <SellPtDialog
          member={member}
          packages={onSale}
          onClose={() => {
            setSelling(false);
          }}
        />
      )}
      {logging && (
        <LogSessionDialog
          pack={logging}
          name={member.fullName}
          onClose={() => {
            setLogging(null);
          }}
        />
      )}
    </Card>
  );
}

function SellPtDialog({
  member,
  packages,
  onClose,
}: {
  readonly member: Member;
  readonly packages: readonly PtPackage[];
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('pt');
  const { language } = usePreferences();
  const format = useFormat();
  const id = useId();
  const { online, readOnly } = useAdminWriteState();
  const branches = useAdminBranches();
  const branchId = useMoneyBranch(branches.data);
  const trainers = useTrainers(null);
  const sell = useSellPtPackage();
  const [ids] = useState(() => ({
    sale: crypto.randomUUID(),
    invoice: crypto.randomUUID(),
    payment: crypto.randomUUID(),
  }));
  const [packageId, setPackageId] = useState(packages[0]?.id ?? '');
  const [trainerId, setTrainerId] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<PtErrorKey | null>(null);
  const chosen = packages.find((each) => each.id === packageId) ?? packages[0];
  const trainer = trainers.data?.find((each) => each.id === trainerId) ?? trainers.data?.[0];
  const pay = usePayNow(chosen?.price ?? 0);

  const confirm = () => {
    setSent(true);
    if (!chosen || !trainer || pay.problem || branchId === '') return;
    setError(null);
    sell.mutate(
      {
        memberPackageId: ids.sale,
        invoiceId: ids.invoice,
        packageId: chosen.id,
        memberId: member.id,
        trainerId: trainer.id,
        branchId,
        payment: pay.input(ids.payment),
      },
      {
        onSuccess: (invoice) => {
          toast.success(t('member.sold', { invoice: invoice ?? '' }));
          onClose();
        },
        onError: (thrown) => {
          setError(ptErrorKey(thrown, 'sell'));
        },
      },
    );
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('member.sellTitle', { name: member.fullName })}
      footer={
        <>
          <Button disabled={!online || readOnly || sell.isPending || !trainer} onClick={confirm}>
            {sell.isPending && <Spinner />}
            {t('member.confirm')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </>
      }
    >
      <FieldGroup data-testid="pt-sell">
        <Field>
          <FieldLabel htmlFor={`${id}-package`}>{t('member.package')}</FieldLabel>
          <NativeSelect
            id={`${id}-package`}
            value={chosen?.id ?? ''}
            onChange={(event) => {
              setPackageId(event.target.value);
            }}
          >
            {packages.map((pack) => (
              <NativeSelectOption key={pack.id} value={pack.id}>
                {`${localizedName(pack, language)} · ${format.money(pack.price)}`}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-trainer`}>{t('member.trainerLabel')}</FieldLabel>
          {trainers.isSuccess && trainers.data.length === 0 ? (
            <FieldDescription>{t('member.noTrainers')}</FieldDescription>
          ) : (
            <NativeSelect
              id={`${id}-trainer`}
              value={trainer?.id ?? ''}
              onChange={(event) => {
                setTrainerId(event.target.value);
              }}
            >
              {(trainers.data ?? []).map((each) => (
                <NativeSelectOption key={each.id} value={each.id}>
                  {each.fullName}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </Field>
        {chosen && (
          <PayNow
            label={t('member.payNow')}
            total={chosen.price}
            payNow={pay.payNow}
            onPayNow={pay.setPayNow}
            payment={pay.values}
            onPayment={pay.setPayment}
            showProblems={sent}
          />
        )}
        <PtError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}

/** Logs a session of a member's package: done or a no-show, with a note (pt.log). */
export function LogSessionDialog({
  pack,
  name,
  onClose,
}: {
  readonly pack: MemberPtPackage;
  readonly name: string;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('pt');
  const format = useFormat();
  const id = useId();
  const { online, readOnly } = useAdminWriteState();
  const branches = useAdminBranches();
  const deviceBranch = useMoneyBranch(branches.data);
  const log = useLogPtSession();
  const [sessionId] = useState(() => crypto.randomUUID());
  const [status, setStatus] = useState<'done' | 'no_show'>('done');
  const [note, setNote] = useState('');
  const [error, setError] = useState<PtErrorKey | null>(null);

  const confirm = () => {
    setError(null);
    log.mutate(
      {
        id: sessionId,
        memberPackageId: pack.id,
        branchId: deviceBranch === '' ? pack.branchId : deviceBranch,
        status,
        note: note.trim() === '' ? null : note.trim(),
      },
      {
        onSuccess: (left) => {
          toast.success(t('log.saved', { left: format.number(left) }));
          onClose();
        },
        onError: (thrown) => {
          setError(ptErrorKey(thrown, 'log'));
        },
      },
    );
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('log.title', { name })}
      footer={
        <>
          <Button disabled={!online || readOnly || log.isPending} onClick={confirm}>
            {log.isPending && <Spinner />}
            {t('log.confirm')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </>
      }
    >
      <FieldGroup data-testid="pt-log">
        <Field>
          <FieldLabel>{t('log.status')}</FieldLabel>
          <ChoiceGroup
            label={t('log.status')}
            value={status}
            choices={[
              { value: 'done' as const, label: t('log.done') },
              { value: 'no_show' as const, label: t('log.noShow') },
            ]}
            onChange={setStatus}
          />
          {status === 'no_show' && <FieldDescription>{t('log.noShowHint')}</FieldDescription>}
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-note`}>{t('log.note')}</FieldLabel>
          <Textarea
            id={`${id}-note`}
            maxLength={500}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
        </Field>
        <PtError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}
