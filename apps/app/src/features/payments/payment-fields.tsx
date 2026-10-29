import { PAYMENT_METHODS } from '@gym/core';
import { ChoiceGroup } from '@gym/ui/blocks/choice-group';
import { Field, FieldError, FieldGroup, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useSetting } from '@/features/auth/use-idle-lock';
import { useFormat } from '@/lib/format';
import { paymentFieldsDraft, type PaymentFieldValues } from './payment-draft';

/**
 * One payment against what is owed: dinars, or dollars with the rate (the gym's usual one filled in;
 * their value and the change to give back), the method and its transaction number. `showProblems` once the form was sent.
 */
export function PaymentFields({
  value,
  onChange,
  owed,
  showProblems,
  wholeAmount = false,
}: {
  readonly value: PaymentFieldValues;
  readonly onChange: (value: PaymentFieldValues) => void;
  readonly owed: number;
  readonly showProblems: boolean;
  /** Dinars pay all that is owed: no amount to type. */
  readonly wholeAmount?: boolean;
}) {
  const { t } = useTranslation('subscriptions');
  const { t: tp } = useTranslation('payments');
  const format = useFormat();
  const id = useId();
  // The gym's usual rate (step 10d) fills in an empty rate when dollars are chosen.
  const usualRate = useSetting('payments.usd_rate');
  const draft = paymentFieldsDraft(value, owed);
  const problem = showProblems ? draft.problem : null;
  const set = (change: Partial<PaymentFieldValues>) => {
    onChange({ ...value, ...change });
  };

  return (
    <FieldGroup>
      <Field>
        <FieldLabel>{t('sell.currency')}</FieldLabel>
        <ChoiceGroup
          label={t('sell.currency')}
          value={value.currency}
          choices={(['IQD', 'USD'] as const).map((currency) => ({
            value: currency,
            label: t(`sell.currencies.${currency}`),
          }))}
          onChange={(currency) => {
            set(
              currency === 'USD' && value.rate === '' && usualRate > 0
                ? { currency, rate: String(usualRate) }
                : { currency },
            );
          }}
        />
      </Field>
      {value.currency === 'IQD' ? (
        !wholeAmount && (
          <Field data-invalid={problem === 'amount'}>
            <FieldLabel htmlFor={`${id}-amount`}>{t('sell.amount')}</FieldLabel>
            <Input
              id={`${id}-amount`}
              inputMode="numeric"
              dir="ltr"
              className="w-44 tabular-nums"
              aria-invalid={problem === 'amount'}
              value={value.amount}
              onChange={(event) => {
                set({ amount: event.target.value });
              }}
            />
            {problem === 'amount' && (
              <FieldError>{tp('errors.amount', { amount: format.money(owed) })}</FieldError>
            )}
          </Field>
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={problem === 'usdAmount'}>
            <FieldLabel htmlFor={`${id}-usd`}>{t('sell.usdAmount')}</FieldLabel>
            <Input
              id={`${id}-usd`}
              inputMode="decimal"
              dir="ltr"
              className="tabular-nums"
              aria-invalid={problem === 'usdAmount'}
              value={value.usdAmount}
              onChange={(event) => {
                set({ usdAmount: event.target.value });
              }}
            />
            {problem === 'usdAmount' && <FieldError>{t('sell.errors.usdAmount')}</FieldError>}
          </Field>
          <Field data-invalid={problem === 'rate'}>
            <FieldLabel htmlFor={`${id}-rate`}>{t('sell.rate')}</FieldLabel>
            <Input
              id={`${id}-rate`}
              inputMode="decimal"
              dir="ltr"
              className="tabular-nums"
              aria-invalid={problem === 'rate'}
              value={value.rate}
              onChange={(event) => {
                set({ rate: event.target.value });
              }}
            />
            {problem === 'rate' && <FieldError>{t('sell.errors.rate')}</FieldError>}
          </Field>
          {draft.usd && (
            <p className="text-sm sm:col-span-2" data-testid="payment-usd-value">
              {t('sell.usdValue', { amount: format.money(draft.usd.value) })}
              {draft.usd.change > 0 && (
                <>
                  {' · '}
                  {t('sell.change', { amount: format.money(draft.usd.change) })}
                </>
              )}
            </p>
          )}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${id}-method`}>{t('sell.method')}</FieldLabel>
          <NativeSelect
            id={`${id}-method`}
            value={value.method}
            onChange={(event) => {
              const method = PAYMENT_METHODS.find((each) => each === event.target.value);
              if (method) set({ method });
            }}
          >
            {PAYMENT_METHODS.map((method) => (
              <NativeSelectOption key={method} value={method}>
                {t(`sell.methods.${method}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        {value.method !== 'cash' && (
          <Field>
            <FieldLabel htmlFor={`${id}-reference`}>{t('sell.reference')}</FieldLabel>
            <Input
              id={`${id}-reference`}
              dir="ltr"
              autoComplete="off"
              value={value.reference}
              onChange={(event) => {
                set({ reference: event.target.value });
              }}
            />
          </Field>
        )}
      </div>
    </FieldGroup>
  );
}
