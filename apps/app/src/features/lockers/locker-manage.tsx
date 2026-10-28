import {
  LOCKER_MAX_ADD,
  LOCKER_PREFIX_PATTERN,
  normalizeLockerNumber,
  parseWholeNumber,
  type LockerKind,
  type LockerZone,
} from '@gym/core';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Button } from '@gym/ui/components/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Spinner } from '@gym/ui/components/spinner';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import { ZoneAndKind } from './locker-actions';
import { useAddLockers, useLockerPrices, useSaveLockerPrices } from './locker-data';
import { LockerError } from './locker-error';
import { lockerErrorKey, type LockerErrorKey } from './locker-errors';

/** The largest locker number (lockers.number has at most 4 digits). */
const MAX_NUMBER = 9999;

/** Lockers numbered from–to in one zone and kind (lockers.manage). */
export function AddLockersDialog({
  branchId,
  onClose,
}: {
  readonly branchId: string;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('lockers');
  const format = useFormat();
  const id = useId();
  const { online, readOnly } = useAdminWriteState();
  const add = useAddLockers();
  const [zone, setZone] = useState<LockerZone>('men');
  const [kind, setKind] = useState<LockerKind>('daily');
  const [prefix, setPrefix] = useState('');
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('20');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<LockerErrorKey | null>(null);
  const letters = normalizeLockerNumber(prefix);
  const first = parseWholeNumber(from);
  const last = parseWholeNumber(to);
  const prefixProblem = !LOCKER_PREFIX_PATTERN.test(letters);
  const rangeProblem =
    first === null ||
    last === null ||
    first < 1 ||
    last > MAX_NUMBER ||
    last < first ||
    last - first >= LOCKER_MAX_ADD;

  const confirm = () => {
    setSent(true);
    if (prefixProblem || rangeProblem) return;
    setError(null);
    add.mutate(
      { branchId, zone, kind, prefix: letters, from: first, to: last },
      {
        onSuccess: () => {
          toast.success(t('add.done', { count: format.number(last - first + 1) }));
          onClose();
        },
        onError: (thrown) => {
          setError(lockerErrorKey(thrown, 'add'));
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
      title={t('add.title')}
      description={t('add.description')}
      footer={
        <>
          <Button disabled={!online || readOnly || add.isPending} onClick={confirm}>
            {add.isPending && <Spinner />}
            {t('add.confirm')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </>
      }
    >
      <FieldGroup data-testid="add-lockers">
        <ZoneAndKind zone={zone} onZone={setZone} kind={kind} onKind={setKind} />
        <Field data-invalid={(sent && prefixProblem) || undefined}>
          <FieldLabel htmlFor={`${id}-prefix`}>{t('add.prefix')}</FieldLabel>
          <Input
            id={`${id}-prefix`}
            dir="ltr"
            className="w-24"
            maxLength={3}
            value={prefix}
            onChange={(event) => {
              setPrefix(event.target.value);
            }}
          />
          <FieldDescription>{t('add.prefixHint')}</FieldDescription>
          {sent && prefixProblem && <FieldError>{t('add.prefixProblem')}</FieldError>}
        </Field>
        <div className="flex gap-4">
          <Field data-invalid={(sent && rangeProblem) || undefined}>
            <FieldLabel htmlFor={`${id}-from`}>{t('add.from')}</FieldLabel>
            <Input
              id={`${id}-from`}
              inputMode="numeric"
              dir="ltr"
              className="w-28 tabular-nums"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
              }}
            />
          </Field>
          <Field data-invalid={(sent && rangeProblem) || undefined}>
            <FieldLabel htmlFor={`${id}-to`}>{t('add.to')}</FieldLabel>
            <Input
              id={`${id}-to`}
              inputMode="numeric"
              dir="ltr"
              className="w-28 tabular-nums"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
              }}
            />
          </Field>
        </div>
        {sent && rangeProblem ? (
          <FieldError>{t('add.rangeProblem', { max: format.number(LOCKER_MAX_ADD) })}</FieldError>
        ) : (
          !prefixProblem &&
          !rangeProblem && (
            <p className="text-muted-foreground">
              {t('add.preview', {
                first: `${letters}${String(first)}`,
                last: `${letters}${String(last)}`,
                count: format.number(last - first + 1),
              })}
            </p>
          )
        )}
        <LockerError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}

/** The gym's locker prices (settings.edit): the month's rent and the lost key fee. */
export function LockerPricesDialog({
  branchId,
  onClose,
}: {
  readonly branchId: string;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('lockers');
  const prices = useLockerPrices(branchId);
  return prices.isSuccess ? (
    <PricesForm
      rentMonthPrice={prices.data.rentMonthPrice}
      lostKeyFee={prices.data.lostKeyFee}
      onClose={onClose}
    />
  ) : (
    <ResponsiveDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('prices.title')}
      footer={
        <Button variant="outline" onClick={onClose}>
          {t('actions.close')}
        </Button>
      }
    >
      {prices.isError ? (
        <LockerError error={lockerErrorKey(prices.error, 'load_prices')} />
      ) : (
        <Spinner />
      )}
    </ResponsiveDialog>
  );
}

function PricesForm({
  rentMonthPrice,
  lostKeyFee,
  onClose,
}: {
  readonly rentMonthPrice: number;
  readonly lostKeyFee: number;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('lockers');
  const id = useId();
  const { online, readOnly } = useAdminWriteState();
  const save = useSaveLockerPrices();
  const [rent, setRent] = useState(String(rentMonthPrice));
  const [fee, setFee] = useState(String(lostKeyFee));
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<LockerErrorKey | null>(null);
  const rentValue = parseWholeNumber(rent);
  const feeValue = parseWholeNumber(fee);
  const rentProblem = rentValue === null || rentValue < 0 || rentValue > 1_000_000_000;
  const feeProblem = feeValue === null || feeValue < 0 || feeValue > 1_000_000_000;

  const confirm = () => {
    setSent(true);
    if (rentProblem || feeProblem) return;
    setError(null);
    save.mutate(
      { rentMonthPrice: rentValue, lostKeyFee: feeValue },
      {
        onSuccess: () => {
          toast.success(t('prices.done'));
          onClose();
        },
        onError: (thrown) => {
          setError(lockerErrorKey(thrown, 'save_prices'));
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
      title={t('prices.title')}
      description={t('prices.description')}
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
      <FieldGroup data-testid="locker-prices">
        <Field data-invalid={(sent && rentProblem) || undefined}>
          <FieldLabel htmlFor={`${id}-rent`}>{t('prices.rent')}</FieldLabel>
          <Input
            id={`${id}-rent`}
            inputMode="numeric"
            dir="ltr"
            className="w-44 tabular-nums"
            value={rent}
            onChange={(event) => {
              setRent(event.target.value);
            }}
          />
          <FieldDescription>{t('prices.rentHint')}</FieldDescription>
          {sent && rentProblem && <FieldError>{t('prices.problem')}</FieldError>}
        </Field>
        <Field data-invalid={(sent && feeProblem) || undefined}>
          <FieldLabel htmlFor={`${id}-fee`}>{t('prices.fee')}</FieldLabel>
          <Input
            id={`${id}-fee`}
            inputMode="numeric"
            dir="ltr"
            className="w-44 tabular-nums"
            value={fee}
            onChange={(event) => {
              setFee(event.target.value);
            }}
          />
          <FieldDescription>{t('prices.feeHint')}</FieldDescription>
          {sent && feeProblem && <FieldError>{t('prices.problem')}</FieldError>}
        </Field>
        <LockerError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}
