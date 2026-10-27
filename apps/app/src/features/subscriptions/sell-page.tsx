import { PAYMENT_METHODS, maxDiscountPercent, parseDecimal, renewalStart } from '@gym/core';
import { localizedName } from '@gym/i18n';
import { ChoiceGroup } from '@gym/ui/blocks/choice-group';
import { StickyActionBar } from '@gym/ui/blocks/sticky-action-bar';
import { Alert, AlertDescription, AlertTitle } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@gym/ui/components/card';
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
import { useSideBySide } from '@gym/ui/hooks/use-side-by-side';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useParams, useSearch } from '@tanstack/react-router';
import { ChevronRightIcon, CircleCheckIcon, InfoIcon } from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { RequirePermission } from '@/components/no-access';
import { DateSelectField } from '@/components/date-select-field';
import { usePermissions } from '@/features/auth/use-permissions';
import { MemberCardsCard } from '@/features/cards/member-cards';
import { useMember, type Member } from '@/features/members/member-data';
import { memberErrorKey } from '@/features/members/member-errors';
import { MemberError } from '@/features/members/member-error';
import { MemberNotFound } from '@/features/members/member-page';
import { useMoneyBranch } from '@/features/payments/money-branch';
import { usePlans, type Plan } from '@/features/plans/plan-data';
import { usePlanSummary } from '@/features/plans/plan-summary';
import { useAdminBranches, type AdminBranch } from '@/features/staff/admin-data';
import { useAdminWriteState } from '@/features/staff/write-state';
import { WriteStateNotice } from '@/features/staff/write-state-notice';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { useUnsavedChanges } from '@/lib/unsaved-changes';
import { useBaghdadToday } from '@/lib/use-today';
import {
  CURRENCIES,
  INSTALLMENT_COUNT,
  PAY_CHOICES,
  emptySellForm,
  saleDraft,
  sellFormSchema,
  type SellContext,
  type SellFormValues,
  type SellProblem,
} from './sell-form';
import {
  useMemberSubscriptions,
  useSellSubscription,
  type MemberSubscription,
  type Sale,
  type SaleResult,
} from './subscription-data';
import { SubscriptionError } from './subscription-error';
import { subscriptionErrorKey, type SubscriptionErrorKey } from './subscription-errors';

/** /members/$memberId/sell: selling a member a subscription (subscriptions.sell). */
export function SellPage() {
  const { memberId } = useParams({ from: '/members/$memberId/sell' });
  const { plan: planId } = useSearch({ from: '/members/$memberId/sell' });
  const member = useMember(memberId);
  const plans = usePlans();
  const subscriptions = useMemberSubscriptions(memberId);
  const branches = useAdminBranches();

  let content: ReactNode;
  if (member.isPending || plans.isPending || subscriptions.isPending || branches.isPending) {
    content = <Skeleton className="h-96 rounded-3xl" />;
  } else if (member.isError) {
    content = <MemberError error={memberErrorKey(member.error, 'load')} />;
  } else if (member.data === null) {
    content = <MemberNotFound />;
  } else if (plans.isError || subscriptions.isError || branches.isError) {
    content = (
      <SubscriptionError
        error={subscriptionErrorKey(plans.error ?? subscriptions.error ?? branches.error, 'load')}
      />
    );
  } else {
    content = (
      <SellForm
        key={member.data.id}
        member={member.data}
        plans={plans.data}
        subscriptions={subscriptions.data}
        branches={branches.data}
        planId={planId ?? null}
      />
    );
  }
  return <RequirePermission permission="subscriptions.sell">{content}</RequirePermission>;
}

/** The ids of one sale, made once, so sending it again after a lost answer saves it once. */
function newSaleIds() {
  return {
    subscriptionId: crypto.randomUUID(),
    invoiceId: crypto.randomUUID(),
    paymentId: crypto.randomUUID(),
    installmentIds: Array.from({ length: INSTALLMENT_COUNT[1] }, () => crypto.randomUUID()),
  };
}

function SellForm({
  member,
  plans,
  subscriptions,
  branches,
  planId,
}: {
  readonly member: Member;
  readonly plans: readonly Plan[];
  readonly subscriptions: readonly MemberSubscription[];
  readonly branches: readonly AdminBranch[];
  /** Renewing: the plan chosen at first, when it is still sold to this member. */
  readonly planId: string | null;
}) {
  const { t } = useTranslation('subscriptions');
  const { language } = usePreferences();
  const format = useFormat();
  const formId = useId();
  const sideBySide = useSideBySide();
  const Heading = sideBySide ? 'h2' : 'h1';
  const today = useBaghdadToday();
  const permissions = usePermissions();
  const { online, readOnly } = useAdminWriteState();
  const sell = useSellSubscription();
  const [ids] = useState(newSaleIds);
  const [result, setResult] = useState<SaleResult | null>(null);
  const [error, setError] = useState<SubscriptionErrorKey | null>(null);

  const forMember = plans.filter(
    (plan) => plan.isActive && (plan.gender === 'any' || plan.gender === member.gender),
  );
  const otherGenderHidden = plans.some(
    (plan) => plan.isActive && plan.gender !== 'any' && plan.gender !== member.gender,
  );
  const context: SellContext = useMemo(
    () => ({
      plans: forMember,
      today,
      renewalStart: renewalStart(subscriptions, today),
      maxDiscountPercent: maxDiscountPercent(permissions),
      canPay: permissions.has('payments.create'),
    }),
    // forMember is made from plans and the member's gender each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plans, member.gender, subscriptions, today, permissions],
  );
  const activeBranches = branches.filter((branch) => branch.isActive);
  const moneyBranch = useMoneyBranch(branches);
  const [branchId, setBranchId] = useState(moneyBranch);

  const form = useForm<SellFormValues>({
    resolver: zodResolver(sellFormSchema(context)),
    defaultValues: emptySellForm(
      context,
      forMember.some((plan) => plan.id === planId) ? planId : null,
    ),
  });
  const { errors, isDirty } = form.formState;
  useUnsavedChanges(isDirty && result === null);
  const watched = useWatch({ control: form.control });
  const values: SellFormValues = { ...emptySellForm(context, null), ...watched };
  const draft = saleDraft(values, context);
  const showPayment = context.canPay && draft.total > 0;

  /** The message of a field's problem. */
  const problem = (key: SellProblem | undefined) => {
    if (!key) return null;
    if (key === 'installmentCount') {
      return t('sell.errors.installmentCount', {
        min: format.number(INSTALLMENT_COUNT[0]),
        max: format.number(INSTALLMENT_COUNT[1]),
      });
    }
    if (key === 'installments') {
      return t('sell.errors.installments', { amount: format.money(draft.remaining) });
    }
    return t(`sell.errors.${key}`);
  };
  const fieldProblem = (field: keyof SellFormValues) =>
    problem(errors[field]?.message as SellProblem | undefined);

  const submit = form.handleSubmit((submitted) => {
    const sale = saleDraft(submitted, context);
    if (sale.plan === null || sale.startDate === null) return;
    setError(null);
    const payment: Sale['payment'] =
      showPayment && submitted.pay !== 'later' && sale.paidNow > 0
        ? submitted.currency === 'USD'
          ? {
              id: ids.paymentId,
              method: submitted.method,
              reference: submitted.reference.trim() || null,
              currency: 'USD',
              foreignAmount: parseDecimal(submitted.usdAmount) ?? 0,
              exchangeRate: parseDecimal(submitted.rate) ?? 0,
            }
          : {
              id: ids.paymentId,
              method: submitted.method,
              reference: submitted.reference.trim() || null,
              currency: 'IQD',
              amount: sale.paidNow,
            }
        : null;
    sell.mutate(
      {
        subscriptionId: ids.subscriptionId,
        invoiceId: ids.invoiceId,
        memberId: member.id,
        planId: sale.plan.id,
        branchId,
        startDate: sale.startDate,
        price: sale.plan.price,
        discount: sale.discount,
        discountReason: sale.discount > 0 ? submitted.discountReason.trim() : null,
        payment,
        installments: sale.installments.map((installment, index) => ({
          id: ids.installmentIds[index] ?? crypto.randomUUID(),
          ...installment,
        })),
      },
      {
        onSuccess: (sold) => {
          setResult(sold);
        },
        onError: (thrown) => {
          setError(subscriptionErrorKey(thrown, 'sell'));
        },
      },
    );
  });

  if (result) return <SoldScreen member={member} result={result} />;

  const disabled = !online || readOnly || member.status !== 'active';
  const yearChoices = [
    Number(today.slice(0, 4)) - 1,
    Number(today.slice(0, 4)),
    Number(today.slice(0, 4)) + 1,
  ];
  const maxDiscount = draft.plan
    ? Math.floor((draft.plan.price * context.maxDiscountPercent) / 100)
    : 0;

  return (
    <div className="flex flex-col gap-4" data-sell-page={member.id}>
      <BackToMember memberId={member.id} />
      <div className="flex flex-col gap-1">
        <Heading className="text-2xl">{t('sell.title')}</Heading>
        <p className="text-muted-foreground">{t('sell.for', { name: member.fullName })}</p>
      </div>
      <WriteStateNotice area="members" />
      {member.status !== 'active' && (
        <Alert>
          <InfoIcon />
          <AlertDescription>{t('card.notActive')}</AlertDescription>
        </Alert>
      )}

      <form id={formId} noValidate onSubmit={(event) => void submit(event)}>
        <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('sell.plan')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {forMember.length === 0 ? (
                <p className="text-muted-foreground">{t('sell.noPlans')}</p>
              ) : (
                <Controller
                  control={form.control}
                  name="planId"
                  render={({ field }) => (
                    <PlanChoice
                      plans={forMember}
                      value={field.value}
                      onChange={field.onChange}
                      label={t('sell.plan')}
                    />
                  )}
                />
              )}
              {otherGenderHidden && (
                <p className="text-sm text-muted-foreground">{t('sell.otherGender')}</p>
              )}
              {fieldProblem('planId') && <FieldError>{fieldProblem('planId')}</FieldError>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('sell.start')}</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Controller
                  control={form.control}
                  name="start"
                  render={({ field }) => (
                    <ChoiceGroup
                      label={t('sell.start')}
                      value={field.value}
                      choices={[
                        ...(context.renewalStart
                          ? [{ value: 'after' as const, label: t('sell.startAfter') }]
                          : []),
                        { value: 'today' as const, label: t('sell.startToday') },
                        { value: 'other' as const, label: t('sell.startOther') },
                      ]}
                      onChange={field.onChange}
                    />
                  )}
                />
                {values.start === 'other' && (
                  <Controller
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <DateSelectField
                        label={t('sell.startOther')}
                        value={field.value}
                        onChange={field.onChange}
                        years={yearChoices}
                        allowEmpty={false}
                      />
                    )}
                  />
                )}
                {draft.startDate && draft.plan && (
                  <p className="text-sm" data-testid="sell-ends">
                    {draft.endDate
                      ? t('sell.endsOn', { date: format.date(draft.endDate, 'long') })
                      : t('sell.noEnd')}
                  </p>
                )}
                {fieldProblem('startDate') && <FieldError>{fieldProblem('startDate')}</FieldError>}
                {context.renewalStart && values.start !== 'after' && (
                  <Alert variant="warning">
                    <InfoIcon />
                    <AlertDescription>
                      {t('sell.overlap', {
                        date: format.date(lastDayBefore(context.renewalStart)),
                      })}
                    </AlertDescription>
                  </Alert>
                )}
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('sell.discount')}</CardTitle>
            </CardHeader>
            <CardContent>
              {context.maxDiscountPercent === 0 ? (
                <p className="text-sm text-muted-foreground">{t('sell.noDiscountRight')}</p>
              ) : (
                <FieldGroup>
                  <Field data-invalid={Boolean(errors.discount)}>
                    <FieldLabel htmlFor={`${formId}-discount`}>
                      {t('sell.discountAmount')}
                    </FieldLabel>
                    <Input
                      id={`${formId}-discount`}
                      inputMode="numeric"
                      dir="ltr"
                      className="w-44 tabular-nums"
                      aria-invalid={Boolean(errors.discount)}
                      {...form.register('discount')}
                    />
                    {draft.plan && (
                      <FieldDescription>
                        {t('sell.discountMax', { amount: format.money(maxDiscount) })}
                      </FieldDescription>
                    )}
                    {fieldProblem('discount') && (
                      <FieldError>{fieldProblem('discount')}</FieldError>
                    )}
                  </Field>
                  {draft.discount > 0 && (
                    <Field data-invalid={Boolean(errors.discountReason)}>
                      <FieldLabel htmlFor={`${formId}-reason`}>
                        {t('sell.discountReason')}
                      </FieldLabel>
                      <Input id={`${formId}-reason`} {...form.register('discountReason')} />
                      {fieldProblem('discountReason') && (
                        <FieldError>{fieldProblem('discountReason')}</FieldError>
                      )}
                    </Field>
                  )}
                </FieldGroup>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('sell.payment')}</CardTitle>
            </CardHeader>
            <CardContent>
              {!context.canPay ? (
                <p className="text-sm text-muted-foreground">{t('sell.noPaymentRight')}</p>
              ) : (
                showPayment && (
                  <FieldGroup>
                    <Controller
                      control={form.control}
                      name="pay"
                      render={({ field }) => (
                        <ChoiceGroup
                          label={t('sell.payment')}
                          value={field.value}
                          choices={PAY_CHOICES.map((choice) => ({
                            value: choice,
                            label: t(
                              choice === 'full'
                                ? 'sell.payFull'
                                : choice === 'part'
                                  ? 'sell.payPart'
                                  : 'sell.payLater',
                            ),
                          }))}
                          onChange={field.onChange}
                        />
                      )}
                    />
                    {values.pay !== 'later' && (
                      <>
                        <Field>
                          <FieldLabel>{t('sell.currency')}</FieldLabel>
                          <Controller
                            control={form.control}
                            name="currency"
                            render={({ field }) => (
                              <ChoiceGroup
                                label={t('sell.currency')}
                                value={field.value}
                                choices={CURRENCIES.map((currency) => ({
                                  value: currency,
                                  label: t(`sell.currencies.${currency}`),
                                }))}
                                onChange={field.onChange}
                              />
                            )}
                          />
                        </Field>
                        {values.currency === 'IQD' && values.pay === 'part' && (
                          <Field data-invalid={Boolean(errors.amount)}>
                            <FieldLabel htmlFor={`${formId}-amount`}>{t('sell.amount')}</FieldLabel>
                            <Input
                              id={`${formId}-amount`}
                              inputMode="numeric"
                              dir="ltr"
                              className="w-44 tabular-nums"
                              aria-invalid={Boolean(errors.amount)}
                              {...form.register('amount')}
                            />
                            {fieldProblem('amount') && (
                              <FieldError>{fieldProblem('amount')}</FieldError>
                            )}
                          </Field>
                        )}
                        {values.currency === 'USD' && (
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field data-invalid={Boolean(errors.usdAmount)}>
                              <FieldLabel htmlFor={`${formId}-usd`}>
                                {t('sell.usdAmount')}
                              </FieldLabel>
                              <Input
                                id={`${formId}-usd`}
                                inputMode="decimal"
                                dir="ltr"
                                className="tabular-nums"
                                aria-invalid={Boolean(errors.usdAmount)}
                                {...form.register('usdAmount')}
                              />
                              {fieldProblem('usdAmount') && (
                                <FieldError>{fieldProblem('usdAmount')}</FieldError>
                              )}
                            </Field>
                            <Field data-invalid={Boolean(errors.rate)}>
                              <FieldLabel htmlFor={`${formId}-rate`}>{t('sell.rate')}</FieldLabel>
                              <Input
                                id={`${formId}-rate`}
                                inputMode="decimal"
                                dir="ltr"
                                className="tabular-nums"
                                aria-invalid={Boolean(errors.rate)}
                                {...form.register('rate')}
                              />
                              {fieldProblem('rate') && (
                                <FieldError>{fieldProblem('rate')}</FieldError>
                              )}
                            </Field>
                            {draft.usd && (
                              <p className="text-sm sm:col-span-2" data-testid="sell-usd-value">
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
                            <FieldLabel htmlFor={`${formId}-method`}>{t('sell.method')}</FieldLabel>
                            <NativeSelect id={`${formId}-method`} {...form.register('method')}>
                              {PAYMENT_METHODS.map((method) => (
                                <NativeSelectOption key={method} value={method}>
                                  {t(`sell.methods.${method}`)}
                                </NativeSelectOption>
                              ))}
                            </NativeSelect>
                          </Field>
                          {values.method !== 'cash' && (
                            <Field>
                              <FieldLabel htmlFor={`${formId}-reference`}>
                                {t('sell.reference')}
                              </FieldLabel>
                              <Input
                                id={`${formId}-reference`}
                                dir="ltr"
                                autoComplete="off"
                                {...form.register('reference')}
                              />
                            </Field>
                          )}
                        </div>
                      </>
                    )}
                  </FieldGroup>
                )
              )}
              {draft.remaining > 0 && (
                <FieldGroup className={showPayment ? 'mt-6' : undefined}>
                  <Field>
                    <FieldLabel>{t('sell.installments')}</FieldLabel>
                    <Controller
                      control={form.control}
                      name="split"
                      render={({ field }) => (
                        <ChoiceGroup
                          label={t('sell.installments')}
                          value={field.value ? 'split' : 'whole'}
                          choices={[
                            { value: 'whole', label: t('sell.noInstallments') },
                            { value: 'split', label: t('sell.withInstallments') },
                          ]}
                          onChange={(choice) => {
                            field.onChange(choice === 'split');
                          }}
                        />
                      )}
                    />
                  </Field>
                  {values.split && (
                    <>
                      <Field data-invalid={Boolean(errors.installmentCount)}>
                        <FieldLabel htmlFor={`${formId}-count`}>
                          {t('sell.installmentCount')}
                        </FieldLabel>
                        <NativeSelect id={`${formId}-count`} {...form.register('installmentCount')}>
                          {Array.from(
                            { length: INSTALLMENT_COUNT[1] - INSTALLMENT_COUNT[0] + 1 },
                            (_, index) => INSTALLMENT_COUNT[0] + index,
                          ).map((count) => (
                            <NativeSelectOption key={count} value={String(count)}>
                              {format.number(count)}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                        {fieldProblem('installmentCount') && (
                          <FieldError>{fieldProblem('installmentCount')}</FieldError>
                        )}
                      </Field>
                      <Controller
                        control={form.control}
                        name="firstDue"
                        render={({ field }) => (
                          <DateSelectField
                            label={t('sell.dueDate')}
                            value={field.value}
                            onChange={field.onChange}
                            years={yearChoices.slice(1)}
                            allowEmpty={false}
                            error={fieldProblem('firstDue')}
                          />
                        )}
                      />
                      {draft.installments.length > 0 && (
                        <ol className="flex flex-col gap-1 text-sm" data-testid="sell-installments">
                          {draft.installments.map((installment, index) => (
                            <li key={installment.dueDate} className="flex justify-between gap-2">
                              <span>
                                {t('sell.installmentNumber', { number: format.number(index + 1) })}
                                {' · '}
                                {format.date(installment.dueDate)}
                              </span>
                              <span className="tabular-nums">
                                {format.money(installment.amount)}
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </>
                  )}
                </FieldGroup>
              )}
            </CardContent>
          </Card>

          {activeBranches.length > 1 && (
            <Field>
              <FieldLabel htmlFor={`${formId}-branch`}>{t('sell.branch')}</FieldLabel>
              <NativeSelect
                id={`${formId}-branch`}
                value={branchId}
                onChange={(event) => {
                  setBranchId(event.target.value);
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

          <Card data-testid="sell-summary">
            <CardHeader>
              <CardTitle>{t('sell.summary')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-2">
                <SummaryLine label={t('sell.price')} value={format.money(draft.plan?.price ?? 0)} />
                {draft.discount > 0 && (
                  <SummaryLine label={t('sell.discount')} value={format.money(-draft.discount)} />
                )}
                <SummaryLine label={t('sell.total')} value={format.money(draft.total)} strong />
                <SummaryLine label={t('sell.paidNow')} value={format.money(draft.paidNow)} />
                <SummaryLine
                  label={t('sell.remaining')}
                  value={format.money(draft.remaining)}
                  testId="sell-remaining"
                />
              </dl>
            </CardContent>
          </Card>
          <SubscriptionError error={error} />
        </fieldset>
      </form>

      <StickyActionBar>
        <Button
          type="submit"
          form={formId}
          size="lg"
          disabled={disabled || sell.isPending || forMember.length === 0 || branchId === ''}
        >
          {sell.isPending && <Spinner />}
          {t('sell.confirm')}
        </Button>
      </StickyActionBar>
    </div>
  );
}

/** Back to the member's page, also beside the list: the sell page is one of the member's. */
function BackToMember({ memberId }: { readonly memberId: string }) {
  const { t } = useTranslation('subscriptions');
  return (
    <Button
      asChild
      variant="ghost"
      className="-ms-2 gap-1 self-start ps-1 text-base font-medium text-primary hover:bg-primary/8 hover:text-primary"
    >
      <Link to="/members/$memberId" params={{ memberId }}>
        {/* Points back to the reading start: right in Kurdish and Arabic, left in English. */}
        <ChevronRightIcon className="size-6 ltr:rotate-180" aria-hidden="true" />
        {t('sell.back')}
      </Link>
    </Button>
  );
}

/** The day before a date: the last day of the subscription a renewal follows. */
function lastDayBefore(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

function SummaryLine({
  label,
  value,
  strong = false,
  testId,
}: {
  readonly label: string;
  readonly value: string;
  readonly strong?: boolean;
  readonly testId?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? 'text-xl tabular-nums' : 'tabular-nums'} data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

/** The plans to choose from: name, length and price. */
function PlanChoice({
  plans,
  value,
  onChange,
  label,
}: {
  readonly plans: readonly Plan[];
  readonly value: string;
  readonly onChange: (planId: string) => void;
  readonly label: string;
}) {
  const { language } = usePreferences();
  const summary = usePlanSummary();
  const id = useId();
  return (
    <RadioGroup
      aria-label={label}
      value={value}
      onValueChange={onChange}
      className="grid gap-2 sm:grid-cols-2"
    >
      {plans.map((plan) => {
        const itemId = `${id}-${plan.id}`;
        return (
          <Label
            key={plan.id}
            htmlFor={itemId}
            className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 font-normal transition-colors hover:bg-muted/50 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted"
          >
            <RadioGroupItem id={itemId} value={plan.id} className="mt-1" />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{localizedName(plan, language)}</span>
                <span className="tabular-nums">{summary.price(plan)}</span>
              </span>
              <span className="text-sm text-muted-foreground">
                {[summary.length(plan), ...summary.limits(plan)].join(' · ')}
              </span>
            </span>
          </Label>
        );
      })}
    </RadioGroup>
  );
}

/** After the sale: its numbers, and the member's card (give one now if they have none). */
function SoldScreen({ member, result }: { readonly member: Member; readonly result: SaleResult }) {
  const { t } = useTranslation('subscriptions');
  const format = useFormat();
  return (
    <div className="flex flex-col gap-4" data-testid="sold">
      <Alert variant="success">
        <CircleCheckIcon />
        <AlertTitle>{t('sell.soldTitle')}</AlertTitle>
        <AlertDescription>
          <dl className="flex flex-col gap-1">
            <div className="flex gap-2">
              <dt>{t('sell.invoiceNumber')}</dt>
              <dd dir="ltr" className="tabular-nums" data-testid="sold-invoice">
                {result.invoice_number}
              </dd>
            </div>
            {result.receipt_number && (
              <div className="flex gap-2">
                <dt>{t('sell.receiptNumber')}</dt>
                <dd dir="ltr" className="tabular-nums" data-testid="sold-receipt">
                  {result.receipt_number}
                </dd>
              </div>
            )}
            <div className="flex gap-2">
              <dt>{t('sell.paidNow')}</dt>
              <dd className="tabular-nums">{format.money(result.paid)}</dd>
            </div>
            {result.change_given > 0 && (
              <div className="flex gap-2">
                <dd className="tabular-nums">
                  {t('sell.change', { amount: format.money(result.change_given) })}
                </dd>
              </div>
            )}
            <div className="flex gap-2">
              <dt>{t('sell.remaining')}</dt>
              <dd className="tabular-nums">{format.money(result.total - result.paid)}</dd>
            </div>
          </dl>
        </AlertDescription>
      </Alert>
      <p className="text-sm text-muted-foreground">{t('sell.cardHint')}</p>
      <MemberCardsCard member={member} />
      <StickyActionBar>
        <Button asChild size="lg">
          <Link to="/members/$memberId" params={{ memberId: member.id }}>
            {t('sell.done')}
          </Link>
        </Button>
      </StickyActionBar>
    </div>
  );
}
