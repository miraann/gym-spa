import { addMonthsToDate, baghdadDateOf, paidDateOf, paidUntilFromDate } from '@gym/core';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Button } from '@gym/ui/components/button';
import { Checkbox } from '@gym/ui/components/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Spinner } from '@gym/ui/components/spinner';
import { Textarea } from '@gym/ui/components/textarea';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  useGymState,
  useRenameGym,
  useSetLimits,
  useSetPaidUntil,
  type GymRow,
  type GymStateAction,
} from '@/lib/api';
import { panelErrorKey, type PanelErrorKey } from '@/lib/errors';
import { useFormat } from '@/lib/format';
import { FormError } from '@/shell/form-error';

interface DialogProps {
  readonly gym: GymRow;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

function useSaving() {
  const [error, setError] = useState<PanelErrorKey | null>(null);
  return {
    error,
    setError,
    fail: (thrown: unknown) => {
      setError(panelErrorKey(thrown));
    },
  };
}

/** A text or null: empty fields mean "none". */
function optional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

// Suspend, lock, reactivate ---------------------------------------------------------------------

const REASON_REQUIRED: Readonly<Record<GymStateAction, boolean>> = {
  suspend: false,
  lock: true,
  reactivate: false,
};

export function GymStateDialog({
  gym,
  action,
  onClose,
}: {
  readonly gym: GymRow;
  readonly action: GymStateAction | null;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('seller');
  const change = useGymState(gym.id);
  const { error, setError, fail } = useSaving();
  const [reason, setReason] = useState('');
  const shown = action ?? 'suspend';
  const required = REASON_REQUIRED[shown];

  const close = () => {
    setReason('');
    setError(null);
    onClose();
  };
  const confirm = () => {
    const value = optional(reason);
    if (required && value === null) {
      setError('reason_required');
      return;
    }
    change.mutate(
      { action: shown, reason: value },
      {
        onSuccess: () => {
          toast.success(t(`${shown}.title`));
          close();
        },
        onError: fail,
      },
    );
  };

  return (
    <ResponsiveDialog
      open={action !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={t(`${shown}.title`)}
      description={t(`${shown}.description`)}
      footer={
        <>
          <Button variant="outline" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={shown === 'reactivate' ? 'default' : 'destructive'}
            disabled={change.isPending}
            onClick={confirm}
          >
            {change.isPending && <Spinner />}
            {t(`${shown}.confirm`)}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="state-reason">{t(`${shown}.reason`)}</FieldLabel>
          <Textarea
            id="state-reason"
            value={reason}
            maxLength={500}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
        </Field>
        <FormError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}

// The subscription date ---------------------------------------------------------------------------

const QUICK_MONTHS = [1, 3, 6, 12] as const;

/** Picks a Baghdad date (the subscription runs to its end), or no end on purpose. */
export function SubscriptionPicker({
  date,
  noEnd,
  onChange,
}: {
  readonly date: string;
  readonly noEnd: boolean;
  readonly onChange: (value: { date: string; noEnd: boolean }) => void;
}) {
  const { t } = useTranslation('seller');
  const format = useFormat();
  const today = baghdadDateOf(Date.now());
  // Quick picks count from the later of today and the date already chosen.
  const from = date !== '' && date > today ? date : today;
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="paid-until">{t('subscription.date')}</FieldLabel>
        <Input
          id="paid-until"
          type="date"
          dir="ltr"
          value={noEnd ? '' : date}
          disabled={noEnd}
          onChange={(event) => {
            onChange({ date: event.target.value, noEnd: false });
          }}
        />
        {!noEnd && date !== '' && (
          <FieldDescription>
            {t('subscription.chosen', {
              date: format.date(Date.parse(paidUntilFromDate(date)) - 1),
            })}
          </FieldDescription>
        )}
      </Field>
      <div className="flex flex-wrap gap-2">
        {QUICK_MONTHS.map((months) => (
          <Button
            key={months}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onChange({ date: addMonthsToDate(from, months), noEnd: false });
            }}
          >
            {t('subscription.addMonths', { months: format.number(months) })}
          </Button>
        ))}
      </div>
      <Field orientation="horizontal">
        <Checkbox
          id="no-end"
          checked={noEnd}
          onCheckedChange={(checked) => {
            onChange({ date, noEnd: checked === true });
          }}
        />
        <FieldLabel htmlFor="no-end">{t('subscription.noEnd')}</FieldLabel>
      </Field>
    </FieldGroup>
  );
}

export function SubscriptionDialog({ gym, open, onOpenChange }: DialogProps) {
  const { t } = useTranslation('seller');
  const save = useSetPaidUntil(gym.id);
  const { error, setError, fail } = useSaving();
  const [value, setValue] = useState(() => ({
    date: gym.paid_until === null ? '' : paidDateOf(gym.paid_until),
    noEnd: gym.paid_until === null,
  }));

  const submit = () => {
    if (!value.noEnd && value.date === '') {
      setError('invalid_request');
      return;
    }
    save.mutate(value.noEnd ? null : paidUntilFromDate(value.date), {
      onSuccess: () => {
        toast.success(t('subscription.title'));
        onOpenChange(false);
      },
      onError: fail,
    });
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('subscription.title')}
      description={t('subscription.description')}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button disabled={save.isPending} onClick={submit}>
            {save.isPending && <Spinner />}
            {t('common.save')}
          </Button>
        </>
      }
    >
      <SubscriptionPicker date={value.date} noEnd={value.noEnd} onChange={setValue} />
      <FormError error={error} />
    </ResponsiveDialog>
  );
}

// Limits ----------------------------------------------------------------------------------------

/** A limit field: a whole number of at least 1, or empty for none. */
function parseLimit(value: string): number | null | 'invalid' {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return 'invalid';
  const number = Number(trimmed);
  return number >= 1 ? number : 'invalid';
}

export function LimitsDialog({ gym, open, onOpenChange }: DialogProps) {
  const { t } = useTranslation('seller');
  const save = useSetLimits(gym.id);
  const { error, setError, fail } = useSaving();
  const [branches, setBranches] = useState(gym.max_branches?.toString() ?? '');
  const [devices, setDevices] = useState(gym.max_devices?.toString() ?? '');

  const submit = () => {
    const maxBranches = parseLimit(branches);
    const maxDevices = parseLimit(devices);
    if (maxBranches === 'invalid' || maxDevices === 'invalid') {
      setError('invalid_limit');
      return;
    }
    save.mutate(
      { branches: maxBranches, devices: maxDevices },
      {
        onSuccess: () => {
          toast.success(t('limits.title'));
          onOpenChange(false);
        },
        onError: fail,
      },
    );
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('limits.title')}
      description={t('gym.limitsNote')}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button disabled={save.isPending} onClick={submit}>
            {save.isPending && <Spinner />}
            {t('common.save')}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="max-branches">{t('gym.maxBranches')}</FieldLabel>
          <Input
            id="max-branches"
            dir="ltr"
            inputMode="numeric"
            value={branches}
            placeholder={t('gym.noLimit')}
            onChange={(event) => {
              setBranches(event.target.value);
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="max-devices">{t('gym.maxDevices')}</FieldLabel>
          <Input
            id="max-devices"
            dir="ltr"
            inputMode="numeric"
            value={devices}
            placeholder={t('gym.noLimit')}
            onChange={(event) => {
              setDevices(event.target.value);
            }}
          />
        </Field>
        <FormError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}

// The name --------------------------------------------------------------------------------------

export function RenameDialog({ gym, open, onOpenChange }: DialogProps) {
  const { t } = useTranslation('seller');
  const save = useRenameGym(gym.id);
  const { error, setError, fail } = useSaving();
  const [names, setNames] = useState({
    ckb: gym.name_ckb,
    en: gym.name_en ?? '',
    ar: gym.name_ar ?? '',
  });

  const submit = () => {
    const ckb = optional(names.ckb);
    if (ckb === null) {
      setError('invalid_request');
      return;
    }
    save.mutate(
      { ckb, en: optional(names.en), ar: optional(names.ar) },
      {
        onSuccess: () => {
          toast.success(t('rename.title'));
          onOpenChange(false);
        },
        onError: fail,
      },
    );
  };

  const field = (key: 'ckb' | 'en' | 'ar', label: string, lang: string) => (
    <Field>
      <FieldLabel htmlFor={`name-${key}`}>{label}</FieldLabel>
      <Input
        id={`name-${key}`}
        lang={lang}
        dir={key === 'en' ? 'ltr' : 'rtl'}
        maxLength={100}
        value={names[key]}
        onChange={(event) => {
          setNames((current) => ({ ...current, [key]: event.target.value }));
        }}
      />
    </Field>
  );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('rename.title')}
      description={t('gym.codeNote')}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button disabled={save.isPending} onClick={submit}>
            {save.isPending && <Spinner />}
            {t('common.save')}
          </Button>
        </>
      }
    >
      <FieldGroup>
        {field('ckb', t('createGym.nameCkb'), 'ckb')}
        {field('en', t('createGym.nameEn'), 'en')}
        {field('ar', t('createGym.nameAr'), 'ar')}
        <FormError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}
