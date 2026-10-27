import { PAYMENT_METHODS, parseWholeNumber, type PaymentMethod } from '@gym/core';
import { ChoiceGroup } from '@gym/ui/blocks/choice-group';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Button } from '@gym/ui/components/button';
import { Checkbox } from '@gym/ui/components/checkbox';
import { Field, FieldError, FieldGroup, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Label } from '@gym/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { Spinner } from '@gym/ui/components/spinner';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAdminBranches } from '@/features/staff/admin-data';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import { useMoneyBranch } from './money-branch';
import {
  CHARGE_KINDS,
  useChargeMember,
  usePayInvoice,
  useRefundInvoice,
  useVoid,
  type ChargeKind,
  type MemberInvoice,
} from './payment-data';
import { PaymentError } from './payment-error';
import { paymentErrorKey, type PaymentErrorKey } from './payment-errors';
import {
  emptyPaymentFields,
  paymentFieldsDraft,
  toPaymentInput,
  type PaymentFieldValues,
} from './payment-draft';
import { PaymentFields } from './payment-fields';

/** What staff do in one dialog; the dialog's own ids are made when it opens. */
interface DialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** What is left of the next installment that isn't fully paid, if any. */
function nextInstallmentLeft(invoice: MemberInvoice): number | null {
  const next = invoice.installments.find((installment) => installment.paid < installment.amount);
  return next ? next.amount - next.paid : null;
}

function CancelButton({ onClick }: { readonly onClick: () => void }) {
  const { t } = useTranslation('payments');
  return (
    <Button variant="outline" onClick={onClick}>
      {t('actions.cancel')}
    </Button>
  );
}

/** Taking a payment on an invoice that is owed (payments.create). */
export function PayDialog({
  invoice,
  open,
  onOpenChange,
}: DialogProps & { readonly invoice: MemberInvoice }) {
  const { t } = useTranslation('payments');
  const format = useFormat();
  const pay = usePayInvoice();
  const branchId = useMoneyBranch(useAdminBranches().data);
  const { online, readOnly } = useAdminWriteState();
  const next = nextInstallmentLeft(invoice);
  const [paymentId, setPaymentId] = useState(() => crypto.randomUUID());
  const [values, setValues] = useState<PaymentFieldValues>(() =>
    emptyPaymentFields(next ?? invoice.due),
  );
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<PaymentErrorKey | null>(null);
  const draft = paymentFieldsDraft(values, invoice.due);

  const close = (open: boolean) => {
    if (!open) {
      setPaymentId(crypto.randomUUID());
      setValues(emptyPaymentFields(next ?? invoice.due));
      setSent(false);
      setError(null);
    }
    onOpenChange(open);
  };

  const confirm = () => {
    setSent(true);
    if (draft.problem !== null) return;
    setError(null);
    pay.mutate(
      { invoiceId: invoice.id, branchId, payment: toPaymentInput(values, paymentId) },
      {
        onSuccess: (result) => {
          toast.success(t('pay.done', { number: result.receipt_number }));
          close(false);
        },
        onError: (thrown) => {
          setError(paymentErrorKey(thrown, 'pay'));
        },
      },
    );
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={close}
      title={t('pay.title', { number: invoice.number })}
      description={t('pay.description', { amount: format.money(invoice.due) })}
      footer={
        <>
          <Button
            disabled={!online || readOnly || pay.isPending || branchId === ''}
            onClick={confirm}
          >
            {pay.isPending && <Spinner />}
            {t('pay.confirm')}
          </Button>
          <CancelButton
            onClick={() => {
              close(false);
            }}
          />
        </>
      }
    >
      <div className="flex flex-col gap-4" data-testid="pay-dialog">
        <div className="flex flex-wrap gap-2">
          {next !== null && next < invoice.due && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setValues({ ...values, currency: 'IQD', amount: String(next) });
              }}
            >
              {t('pay.nextInstallment', { amount: format.money(next) })}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setValues({ ...values, currency: 'IQD', amount: String(invoice.due) });
            }}
          >
            {t('pay.all', { amount: format.money(invoice.due) })}
          </Button>
        </div>
        <PaymentFields value={values} onChange={setValues} owed={invoice.due} showProblems={sent} />
        <PaymentError error={error} />
      </div>
    </ResponsiveDialog>
  );
}

/** Giving money back on an invoice (payments.refund), with a reason. */
export function RefundDialog({
  invoice,
  open,
  onOpenChange,
}: DialogProps & { readonly invoice: MemberInvoice }) {
  const { t } = useTranslation('payments');
  const { t: ts } = useTranslation('subscriptions');
  const format = useFormat();
  const id = useId();
  const refund = useRefundInvoice();
  const branchId = useMoneyBranch(useAdminBranches().data);
  const { online, readOnly } = useAdminWriteState();
  const refundable = invoice.paid - invoice.refunded;
  const [refundId, setRefundId] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<PaymentErrorKey | null>(null);
  const parsed = parseWholeNumber(amount);
  const amountProblem = parsed === null || parsed <= 0 || parsed > refundable;
  const reasonProblem = reason.trim() === '';

  const close = (next: boolean) => {
    if (!next) {
      setRefundId(crypto.randomUUID());
      setSent(false);
      setError(null);
    }
    onOpenChange(next);
  };

  const confirm = () => {
    setSent(true);
    if (amountProblem || reasonProblem) return;
    setError(null);
    refund.mutate(
      { refundId, invoiceId: invoice.id, branchId, amount: parsed, method, reason: reason.trim() },
      {
        onSuccess: (result) => {
          toast.success(t('refund.done', { number: result.receipt_number }));
          close(false);
        },
        onError: (thrown) => {
          setError(paymentErrorKey(thrown, 'refund'));
        },
      },
    );
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={close}
      title={t('refund.title', { number: invoice.number })}
      description={t('refund.description', { amount: format.money(refundable) })}
      footer={
        <>
          <Button
            variant="destructive"
            disabled={!online || readOnly || refund.isPending || branchId === ''}
            onClick={confirm}
          >
            {refund.isPending && <Spinner />}
            {t('refund.confirm')}
          </Button>
          <CancelButton
            onClick={() => {
              close(false);
            }}
          />
        </>
      }
    >
      <FieldGroup>
        <Field data-invalid={sent && amountProblem}>
          <FieldLabel htmlFor={`${id}-amount`}>{t('refund.amount')}</FieldLabel>
          <Input
            id={`${id}-amount`}
            inputMode="numeric"
            dir="ltr"
            className="w-44 tabular-nums"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
            }}
          />
          {sent && amountProblem && (
            <FieldError>{t('errors.amount', { amount: format.money(refundable) })}</FieldError>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-method`}>{ts('sell.method')}</FieldLabel>
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
                {ts(`sell.methods.${each}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field data-invalid={sent && reasonProblem}>
          <FieldLabel htmlFor={`${id}-reason`}>{t('refund.reason')}</FieldLabel>
          <Input
            id={`${id}-reason`}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
          {sent && reasonProblem && <FieldError>{t('errors.reason')}</FieldError>}
        </Field>
        <PaymentError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}

/** Voiding today's invoice or payment (payments.void), with a reason. */
export function VoidDialog({
  target,
  open,
  onOpenChange,
}: DialogProps & {
  readonly target: {
    readonly kind: 'invoice' | 'payment';
    readonly id: string;
    readonly number: string;
  };
}) {
  const { t } = useTranslation('payments');
  const id = useId();
  const voiding = useVoid();
  const { online, readOnly } = useAdminWriteState();
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<PaymentErrorKey | null>(null);
  const invoice = target.kind === 'invoice';

  const close = (next: boolean) => {
    if (!next) {
      setSent(false);
      setError(null);
    }
    onOpenChange(next);
  };

  const confirm = () => {
    setSent(true);
    if (reason.trim() === '') return;
    setError(null);
    voiding.mutate(
      { kind: target.kind, id: target.id, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(t(invoice ? 'void.invoiceDone' : 'void.paymentDone'));
          close(false);
        },
        onError: (thrown) => {
          setError(paymentErrorKey(thrown, 'void'));
        },
      },
    );
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={close}
      title={t(invoice ? 'void.invoiceTitle' : 'void.paymentTitle', { number: target.number })}
      description={t(invoice ? 'void.invoiceDescription' : 'void.paymentDescription')}
      footer={
        <>
          <Button
            variant="destructive"
            disabled={!online || readOnly || voiding.isPending}
            onClick={confirm}
          >
            {voiding.isPending && <Spinner />}
            {t('void.confirm')}
          </Button>
          <CancelButton
            onClick={() => {
              close(false);
            }}
          />
        </>
      }
    >
      <FieldGroup>
        <Field data-invalid={sent && reason.trim() === ''}>
          <FieldLabel htmlFor={`${id}-reason`}>{t('void.reason')}</FieldLabel>
          <Input
            id={`${id}-reason`}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
          {sent && reason.trim() === '' && <FieldError>{t('errors.reason')}</FieldError>}
        </Field>
        <PaymentError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}

/** A new invoice for something other than a subscription, such as the card replacement fee. */
export function ChargeDialog({
  memberId,
  initialKind = 'card_replacement',
  open,
  onOpenChange,
}: DialogProps & { readonly memberId: string; readonly initialKind?: ChargeKind }) {
  const { t } = useTranslation('payments');
  const id = useId();
  const charge = useChargeMember();
  const branchId = useMoneyBranch(useAdminBranches().data);
  const { online, readOnly } = useAdminWriteState();
  const [ids, setIds] = useState(() => ({
    invoice: crypto.randomUUID(),
    payment: crypto.randomUUID(),
  }));
  const [kind, setKind] = useState<ChargeKind>(initialKind);
  const [text, setText] = useState(() =>
    initialKind === 'card_replacement' ? t('charge.cardReplacement') : '',
  );
  const [price, setPrice] = useState('');
  const [payNow, setPayNow] = useState(true);
  const [payment, setPayment] = useState<PaymentFieldValues>(() => emptyPaymentFields(null));
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<PaymentErrorKey | null>(null);
  const amount = parseWholeNumber(price);
  const priceProblem = amount === null || amount <= 0;
  const textProblem = text.trim() === '' || text.trim().length > 200;
  // Paid in full in dinars unless dollars are chosen.
  const paymentValues: PaymentFieldValues =
    payment.currency === 'IQD' ? { ...payment, amount: price } : payment;
  const draft = paymentFieldsDraft(paymentValues, amount ?? 0);

  const close = (next: boolean) => {
    if (!next) {
      setIds({ invoice: crypto.randomUUID(), payment: crypto.randomUUID() });
      setSent(false);
      setError(null);
    }
    onOpenChange(next);
  };

  const confirm = () => {
    setSent(true);
    if (priceProblem || textProblem || (payNow && draft.problem !== null)) return;
    setError(null);
    charge.mutate(
      {
        invoiceId: ids.invoice,
        memberId,
        branchId,
        kind,
        text: text.trim(),
        amount,
        payment: payNow ? toPaymentInput(paymentValues, ids.payment) : null,
      },
      {
        onSuccess: (result) => {
          toast.success(t('charge.done', { number: result.invoice_number }));
          close(false);
        },
        onError: (thrown) => {
          setError(paymentErrorKey(thrown, 'charge'));
        },
      },
    );
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={close}
      title={t('charge.title')}
      description={t('charge.description')}
      footer={
        <>
          <Button
            disabled={!online || readOnly || charge.isPending || branchId === ''}
            onClick={confirm}
          >
            {charge.isPending && <Spinner />}
            {t('charge.confirm')}
          </Button>
          <CancelButton
            onClick={() => {
              close(false);
            }}
          />
        </>
      }
    >
      <FieldGroup data-testid="charge-dialog">
        <Field>
          <FieldLabel>{t('charge.kind')}</FieldLabel>
          <ChoiceGroup
            label={t('charge.kind')}
            value={kind}
            choices={CHARGE_KINDS.map((each) => ({
              value: each,
              label: t(`charge.kinds.${each}`),
            }))}
            onChange={(next) => {
              setKind(next);
              setText(next === 'card_replacement' ? t('charge.cardReplacement') : '');
            }}
          />
        </Field>
        <Field data-invalid={sent && textProblem}>
          <FieldLabel htmlFor={`${id}-text`}>{t('charge.text')}</FieldLabel>
          <Input
            id={`${id}-text`}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
            }}
          />
          {sent && textProblem && <FieldError>{t('errors.text')}</FieldError>}
        </Field>
        <Field data-invalid={sent && priceProblem}>
          <FieldLabel htmlFor={`${id}-price`}>{t('charge.amount')}</FieldLabel>
          <Input
            id={`${id}-price`}
            inputMode="numeric"
            dir="ltr"
            className="w-44 tabular-nums"
            value={price}
            onChange={(event) => {
              setPrice(event.target.value);
            }}
          />
          {sent && priceProblem && <FieldError>{t('errors.price')}</FieldError>}
        </Field>
        <div className="flex items-center gap-3">
          <Checkbox
            id={`${id}-pay-now`}
            checked={payNow}
            onCheckedChange={(checked) => {
              setPayNow(checked === true);
            }}
          />
          <Label htmlFor={`${id}-pay-now`} className="font-normal">
            {t('charge.payNow')}
          </Label>
        </div>
        {payNow && amount !== null && amount > 0 && (
          <PaymentFields
            value={paymentValues}
            onChange={setPayment}
            owed={amount}
            showProblems={sent}
            wholeAmount
          />
        )}
        <PaymentError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}
