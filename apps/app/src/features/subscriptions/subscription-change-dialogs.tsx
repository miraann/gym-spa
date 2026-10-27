import { PAYMENT_METHODS, frozenDays, parseWholeNumber, type PaymentMethod } from '@gym/core';
import { localizedName } from '@gym/i18n';
import { ChoiceGroup } from '@gym/ui/blocks/choice-group';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Button } from '@gym/ui/components/button';
import { Checkbox } from '@gym/ui/components/checkbox';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Label } from '@gym/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { RadioGroup, RadioGroupItem } from '@gym/ui/components/radio-group';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Spinner } from '@gym/ui/components/spinner';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { DateSelectField } from '@/components/date-select-field';
import { usePermissions } from '@/features/auth/use-permissions';
import { useMemberSearch, type Member } from '@/features/members/member-data';
import { useMoneyBranch } from '@/features/payments/money-branch';
import {
  emptyPaymentFields,
  paymentFieldsDraft,
  toPaymentInput,
} from '@/features/payments/payment-draft';
import { PaymentFields } from '@/features/payments/payment-fields';
import { usePlans } from '@/features/plans/plan-data';
import { usePlanSummary } from '@/features/plans/plan-summary';
import { useAdminBranches } from '@/features/staff/admin-data';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { useBaghdadToday } from '@/lib/use-today';
import {
  useCancelSubscription,
  useChangePlan,
  useChangePreview,
  useFreeze,
  useTransfer,
  useUnfreeze,
} from './subscription-change-data';
import type { MemberSubscription } from './subscription-data';
import { SubscriptionError } from './subscription-error';
import { subscriptionErrorKey, type SubscriptionErrorKey } from './subscription-errors';

interface ChangeDialogProps {
  readonly subscription: MemberSubscription;
  readonly onClose: () => void;
}

/** The frame every change dialog shares: title, text, the main button and a way back. */
function ChangeDialog({
  title,
  description,
  confirm,
  onConfirm,
  pending,
  destructive = false,
  onClose,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly confirm: string;
  readonly onConfirm: () => void;
  readonly pending: boolean;
  readonly destructive?: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const { t } = useTranslation('subscriptions');
  const { online, readOnly } = useAdminWriteState();
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      description={description}
      footer={
        <>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={!online || readOnly || pending}
            onClick={onConfirm}
          >
            {pending && <Spinner />}
            {confirm}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('changes.back')}
          </Button>
        </>
      }
    >
      <FieldGroup data-testid="subscription-change">{children}</FieldGroup>
    </ResponsiveDialog>
  );
}

function useName(subscription: MemberSubscription): string {
  const { language } = usePreferences();
  return localizedName(subscription, language);
}

/** Freezing for some days from today or a later date (subscriptions.freeze). */
export function FreezeDialog({ subscription, onClose }: ChangeDialogProps) {
  const { t } = useTranslation('subscriptions');
  const format = useFormat();
  const id = useId();
  const today = useBaghdadToday();
  const freeze = useFreeze();
  const name = useName(subscription);
  const [freezeId] = useState(() => crypto.randomUUID());
  const [when, setWhen] = useState<'today' | 'later'>('today');
  const [startDate, setStartDate] = useState(today);
  const [days, setDays] = useState('');
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<SubscriptionErrorKey | null>(null);
  const used = subscription.freezes.reduce((sum, each) => sum + frozenDays(each), 0);
  const left = Math.max(0, subscription.maxFreezeDays - used);
  const count = parseWholeNumber(days);
  const daysProblem = count === null || count < 1 || count > left;
  const start = when === 'today' ? today : startDate;
  const startProblem =
    start < today || (subscription.endDate !== null && start > subscription.endDate);
  const thisYear = Number(today.slice(0, 4));

  const confirm = () => {
    setSent(true);
    if (daysProblem || startProblem) return;
    setError(null);
    freeze.mutate(
      {
        freezeId,
        subscriptionId: subscription.id,
        startDate: start,
        days: count,
        reason: reason.trim() || null,
      },
      {
        onSuccess: (result) => {
          toast.success(t('changes.frozen', { date: format.date(result.end_date) }));
          onClose();
        },
        onError: (thrown) => {
          setError(subscriptionErrorKey(thrown, 'freeze'));
        },
      },
    );
  };

  return (
    <ChangeDialog
      title={t('changes.freezeTitle', { name })}
      description={t('changes.freezeDescription', { left: format.number(left) })}
      confirm={t('changes.freezeConfirm')}
      onConfirm={confirm}
      pending={freeze.isPending}
      onClose={onClose}
    >
      <Field>
        <FieldLabel>{t('changes.freezeFrom')}</FieldLabel>
        <ChoiceGroup
          label={t('changes.freezeFrom')}
          value={when}
          choices={[
            { value: 'today' as const, label: t('changes.freezeToday') },
            { value: 'later' as const, label: t('changes.freezeLater') },
          ]}
          onChange={setWhen}
        />
      </Field>
      {when === 'later' && (
        <DateSelectField
          label={t('changes.freezeLater')}
          value={startDate}
          onChange={setStartDate}
          years={[thisYear, thisYear + 1]}
          allowEmpty={false}
          error={sent && startProblem ? t('changes.errors.startDate') : null}
        />
      )}
      <Field data-invalid={sent && daysProblem}>
        <FieldLabel htmlFor={`${id}-days`}>{t('changes.freezeDays')}</FieldLabel>
        <Input
          id={`${id}-days`}
          inputMode="numeric"
          dir="ltr"
          className="w-28"
          value={days}
          onChange={(event) => {
            setDays(event.target.value);
          }}
        />
        {sent && daysProblem && (
          <FieldError>
            {t('changes.errors.days', { min: format.number(1), max: format.number(left) })}
          </FieldError>
        )}
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-reason`}>{t('changes.reasonOptional')}</FieldLabel>
        <Input
          id={`${id}-reason`}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </Field>
      <SubscriptionError error={error} />
    </ChangeDialog>
  );
}

/** Ending the freeze in effect or planned: the member is back today. */
export function UnfreezeDialog({ subscription, onClose }: ChangeDialogProps) {
  const { t } = useTranslation('subscriptions');
  const format = useFormat();
  const today = useBaghdadToday();
  const unfreeze = useUnfreeze();
  const name = useName(subscription);
  const [error, setError] = useState<SubscriptionErrorKey | null>(null);
  const open = subscription.freezes.find((each) => each.endedOn === null && each.endDate >= today);

  const confirm = () => {
    if (!open) return;
    setError(null);
    unfreeze.mutate(open.id, {
      onSuccess: (result) => {
        toast.success(t('changes.unfrozen', { date: format.date(result.end_date) }));
        onClose();
      },
      onError: (thrown) => {
        setError(subscriptionErrorKey(thrown, 'unfreeze'));
      },
    });
  };

  return (
    <ChangeDialog
      title={t('changes.unfreezeTitle', { name })}
      description={t('changes.unfreezeDescription')}
      confirm={t('changes.unfreezeConfirm')}
      onConfirm={confirm}
      pending={unfreeze.isPending}
      onClose={onClose}
    >
      <SubscriptionError error={error} />
    </ChangeDialog>
  );
}

/** Changing to another plan from today, the unused part settled pro rata (subscriptions.change). */
export function ChangePlanDialog({
  subscription,
  member,
  onClose,
}: ChangeDialogProps & { readonly member: Member }) {
  const { t } = useTranslation('subscriptions');
  const { language } = usePreferences();
  const format = useFormat();
  const id = useId();
  const permissions = usePermissions();
  const plans = usePlans();
  const preview = useChangePreview(subscription.id, true);
  const summary = usePlanSummary();
  const change = useChangePlan();
  const branchId = useMoneyBranch(useAdminBranches().data);
  const name = useName(subscription);
  const [ids] = useState(() => ({
    subscription: crypto.randomUUID(),
    invoice: crypto.randomUUID(),
    payment: crypto.randomUUID(),
  }));
  const [planId, setPlanId] = useState('');
  const [payNow, setPayNow] = useState(permissions.has('payments.create'));
  const [payment, setPayment] = useState(() => emptyPaymentFields(null));
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<SubscriptionErrorKey | null>(null);
  const choices = (plans.data ?? []).filter(
    (plan) =>
      plan.isActive &&
      plan.id !== subscription.planId &&
      (plan.gender === 'any' || plan.gender === member.gender),
  );
  const plan = choices.find((each) => each.id === planId) ?? null;
  const credit = preview.data?.left_over ?? 0;
  const total = plan ? Math.max(0, plan.price - credit) : 0;
  const paying = payNow && total > 0;
  const paymentValues =
    payment.currency === 'IQD' ? { ...payment, amount: String(total) } : payment;
  const draft = paymentFieldsDraft(paymentValues, total);

  const confirm = () => {
    setSent(true);
    if (plan === null || (paying && draft.problem !== null)) return;
    setError(null);
    change.mutate(
      {
        subscriptionId: subscription.id,
        newSubscriptionId: ids.subscription,
        invoiceId: ids.invoice,
        planId: plan.id,
        branchId,
        price: plan.price,
        payment: paying ? toPaymentInput(paymentValues, ids.payment) : null,
      },
      {
        onSuccess: (result) => {
          toast.success(t('changes.changed', { number: result.invoice_number }));
          onClose();
        },
        onError: (thrown) => {
          setError(subscriptionErrorKey(thrown, 'change_plan'));
        },
      },
    );
  };

  return (
    <ChangeDialog
      title={t('changes.changeTitle', { name })}
      description={t('changes.changeDescription')}
      confirm={t('changes.changeConfirm')}
      onConfirm={confirm}
      pending={change.isPending}
      onClose={onClose}
    >
      {preview.isPending ? (
        <Skeleton className="h-6 rounded-lg" />
      ) : (
        preview.data && (
          <div className="flex flex-col gap-1 text-sm" data-testid="change-preview">
            <span>{t('changes.worth', { amount: format.money(preview.data.worth) })}</span>
            {preview.data.forgiven > 0 && (
              <span>{t('changes.forgiven', { amount: format.money(preview.data.forgiven) })}</span>
            )}
            {credit > 0 && <span>{t('changes.credit', { amount: format.money(credit) })}</span>}
          </div>
        )
      )}
      <RadioGroup
        aria-label={t('sell.plan')}
        value={planId}
        onValueChange={setPlanId}
        className="grid gap-2"
      >
        {choices.map((choice) => (
          <Label
            key={choice.id}
            htmlFor={`${id}-${choice.id}`}
            className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 font-normal has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted"
          >
            <RadioGroupItem id={`${id}-${choice.id}`} value={choice.id} className="mt-1" />
            <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
              <span>
                {localizedName(choice, language)}
                <span className="block text-sm text-muted-foreground">
                  {summary.length(choice)}
                </span>
              </span>
              <span className="tabular-nums">{summary.price(choice)}</span>
            </span>
          </Label>
        ))}
      </RadioGroup>
      {sent && plan === null && <FieldError>{t('changes.errors.plan')}</FieldError>}
      {plan && (
        <p className="tabular-nums" data-testid="change-total">
          {t('changes.newTotal', { amount: format.money(total) })}
        </p>
      )}
      {plan && total > 0 && permissions.has('payments.create') && (
        <>
          <div className="flex items-center gap-3">
            <Checkbox
              id={`${id}-pay`}
              checked={payNow}
              onCheckedChange={(checked) => {
                setPayNow(checked === true);
              }}
            />
            <Label htmlFor={`${id}-pay`} className="font-normal">
              {t('changes.payNow')}
            </Label>
          </div>
          {payNow && (
            <PaymentFields
              value={paymentValues}
              onChange={setPayment}
              owed={total}
              showProblems={sent}
              wholeAmount
            />
          )}
        </>
      )}
      <SubscriptionError error={error} />
    </ChangeDialog>
  );
}

/** Moving what is left to another member of the gym (subscriptions.transfer). */
export function TransferDialog({
  subscription,
  member,
  onClose,
}: ChangeDialogProps & { readonly member: Member }) {
  const { t } = useTranslation('subscriptions');
  const id = useId();
  const transfer = useTransfer();
  const name = useName(subscription);
  const [newId] = useState(() => crypto.randomUUID());
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<Member | null>(null);
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<SubscriptionErrorKey | null>(null);
  const found = useMemberSearch(query, query.trim().length > 1);
  const candidates = (found.data?.members ?? []).filter(
    (each) => each.id !== member.id && each.status === 'active',
  );

  const confirm = () => {
    setSent(true);
    if (target === null || reason.trim() === '') return;
    setError(null);
    transfer.mutate(
      {
        subscriptionId: subscription.id,
        newSubscriptionId: newId,
        memberId: target.id,
        reason: reason.trim(),
      },
      {
        onSuccess: () => {
          toast.success(t('changes.transferred', { name: target.fullName }));
          onClose();
        },
        onError: (thrown) => {
          setError(subscriptionErrorKey(thrown, 'transfer'));
        },
      },
    );
  };

  return (
    <ChangeDialog
      title={t('changes.transferTitle', { name })}
      description={t('changes.transferDescription')}
      confirm={t('changes.transferConfirm')}
      onConfirm={confirm}
      pending={transfer.isPending}
      onClose={onClose}
    >
      <Field>
        <FieldLabel htmlFor={`${id}-search`}>{t('changes.transferSearch')}</FieldLabel>
        <Input
          id={`${id}-search`}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      </Field>
      {query.trim().length > 1 && found.isSuccess && candidates.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('changes.transferNone')}</p>
      )}
      {candidates.length > 0 && (
        <RadioGroup
          aria-label={t('changes.transferSearch')}
          value={target?.id ?? ''}
          onValueChange={(chosen) => {
            setTarget(candidates.find((each) => each.id === chosen) ?? null);
          }}
          className="grid gap-2"
        >
          {candidates.map((candidate) => (
            <Label
              key={candidate.id}
              htmlFor={`${id}-${candidate.id}`}
              className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 font-normal has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted"
            >
              <RadioGroupItem id={`${id}-${candidate.id}`} value={candidate.id} />
              {candidate.fullName}
            </Label>
          ))}
        </RadioGroup>
      )}
      {sent && target === null && <FieldError>{t('changes.errors.member')}</FieldError>}
      <Field data-invalid={sent && reason.trim() === ''}>
        <FieldLabel htmlFor={`${id}-reason`}>{t('changes.reason')}</FieldLabel>
        <Input
          id={`${id}-reason`}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
        {sent && reason.trim() === '' && <FieldError>{t('changes.errors.reason')}</FieldError>}
      </Field>
      <SubscriptionError error={error} />
    </ChangeDialog>
  );
}

/** Cancelling with a reason; what was paid for the unused part may be given back. */
export function CancelDialog({ subscription, onClose }: ChangeDialogProps) {
  const { t } = useTranslation('subscriptions');
  const format = useFormat();
  const id = useId();
  const permissions = usePermissions();
  const preview = useChangePreview(subscription.id, true);
  const cancel = useCancelSubscription();
  const branchId = useMoneyBranch(useAdminBranches().data);
  const name = useName(subscription);
  const [refundId] = useState(() => crypto.randomUUID());
  const [reason, setReason] = useState('');
  const [refundNow, setRefundNow] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<SubscriptionErrorKey | null>(null);
  const refundable = preview.data?.left_over ?? 0;
  const canRefund = permissions.has('payments.refund') && refundable > 0;
  const parsed = parseWholeNumber(amount === '' ? String(refundable) : amount);
  const amountProblem = refundNow && (parsed === null || parsed <= 0 || parsed > refundable);
  const reasonProblem = reason.trim() === '';

  const confirm = () => {
    setSent(true);
    if (reasonProblem || amountProblem) return;
    setError(null);
    cancel.mutate(
      {
        subscriptionId: subscription.id,
        reason: reason.trim(),
        refund:
          refundNow && parsed !== null ? { id: refundId, amount: parsed, method, branchId } : null,
      },
      {
        onSuccess: () => {
          toast.success(t('changes.cancelled'));
          onClose();
        },
        onError: (thrown) => {
          setError(subscriptionErrorKey(thrown, 'cancel'));
        },
      },
    );
  };

  return (
    <ChangeDialog
      title={t('changes.cancelTitle', { name })}
      description={t('changes.cancelDescription')}
      confirm={t('changes.cancelConfirm')}
      onConfirm={confirm}
      pending={cancel.isPending}
      destructive
      onClose={onClose}
    >
      {preview.isPending ? (
        <Skeleton className="h-6 rounded-lg" />
      ) : (
        preview.data && (
          <div className="flex flex-col gap-1 text-sm" data-testid="cancel-preview">
            <span>{t('changes.worth', { amount: format.money(preview.data.worth) })}</span>
            {preview.data.forgiven > 0 && (
              <span>{t('changes.forgiven', { amount: format.money(preview.data.forgiven) })}</span>
            )}
            {refundable > 0 && (
              <span>{t('changes.refundable', { amount: format.money(refundable) })}</span>
            )}
          </div>
        )
      )}
      <Field data-invalid={sent && reasonProblem}>
        <FieldLabel htmlFor={`${id}-reason`}>{t('changes.reason')}</FieldLabel>
        <Input
          id={`${id}-reason`}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
        {sent && reasonProblem && <FieldError>{t('changes.errors.reason')}</FieldError>}
      </Field>
      {canRefund && (
        <>
          <div className="flex items-center gap-3">
            <Checkbox
              id={`${id}-refund`}
              checked={refundNow}
              onCheckedChange={(checked) => {
                setRefundNow(checked === true);
              }}
            />
            <Label htmlFor={`${id}-refund`} className="font-normal">
              {t('changes.refundNow')}
            </Label>
          </div>
          {refundNow && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={sent && amountProblem}>
                <FieldLabel htmlFor={`${id}-amount`}>{t('changes.refundAmount')}</FieldLabel>
                <Input
                  id={`${id}-amount`}
                  inputMode="numeric"
                  dir="ltr"
                  className="tabular-nums"
                  placeholder={String(refundable)}
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                  }}
                />
                <FieldDescription>{format.money(refundable)}</FieldDescription>
                {sent && amountProblem && (
                  <FieldError>
                    {t('changes.errors.amount', { amount: format.money(refundable) })}
                  </FieldError>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-method`}>{t('sell.method')}</FieldLabel>
                <NativeSelect
                  id={`${id}-method`}
                  value={method}
                  onChange={(event) => {
                    const chosen = PAYMENT_METHODS.find((each) => each === event.target.value);
                    if (chosen) setMethod(chosen);
                  }}
                >
                  {PAYMENT_METHODS.map((each) => (
                    <NativeSelectOption key={each} value={each}>
                      {t(`sell.methods.${each}`)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          )}
        </>
      )}
      <SubscriptionError error={error} />
    </ChangeDialog>
  );
}
