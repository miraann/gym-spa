import {
  DURATION_UNITS,
  PLAN_GENDERS,
  PLAN_KINDS,
  WEEK_ORDER,
  parseWholeNumber,
  planEndDate,
  planHasDuration,
  planHasVisits,
} from '@gym/core';
import { localizedName, resources } from '@gym/i18n';
import { ChoiceGroup } from '@gym/ui/blocks/choice-group';
import { StickyActionBar } from '@gym/ui/blocks/sticky-action-bar';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Badge } from '@gym/ui/components/badge';
import { Button } from '@gym/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Checkbox } from '@gym/ui/components/checkbox';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@gym/ui/components/empty';
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
import { Skeleton } from '@gym/ui/components/skeleton';
import { Spinner } from '@gym/ui/components/spinner';
import { useSideBySide } from '@gym/ui/hooks/use-side-by-side';
import { cn } from '@gym/ui/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from '@tanstack/react-router';
import { CircleOffIcon, LockIcon, SearchXIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useActiveAccount } from '@/features/auth/auth-context';
import { useAdminBranches } from '@/features/staff/admin-data';
import { BackToList } from '@/features/staff/admin-error';
import { PlanSpaSessions } from '@/features/spa/plan-spa-sessions';
import { useAdminWriteState } from '@/features/staff/write-state';
import { WriteStateNotice } from '@/features/staff/write-state-notice';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { useUnsavedChanges } from '@/lib/unsaved-changes';
import { useBaghdadToday } from '@/lib/use-today';
import { usePlans, useSavePlan, type Plan, type PlanDraft } from './plan-data';
import { PlanError } from './plan-error';
import { planErrorKey, type PlanErrorKey } from './plan-errors';
import { PLAN_FORM_LIMITS, planFormSchema, planFormValues, type PlanFormValues } from './plan-form';

/** /plans/$planId: one plan. */
export function PlanPage() {
  const { t } = useTranslation('plans');
  const { planId } = useParams({ from: '/plans/$planId' });
  const plans = usePlans();
  const plan = plans.data?.find((each) => each.id === planId);

  if (plans.isPending) return <Skeleton className="h-96 rounded-3xl" />;
  if (plans.isError) return <PlanError error={planErrorKey(plans.error, 'load_plans')} />;
  if (!plan) {
    return (
      <div className="flex flex-col gap-4">
        <BackToList to="/plans" label={t('list.back')} />
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyDescription>{t('detail.notFound')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }
  return <PlanEditor key={plan.id} plan={plan} />;
}

/** /plans/new: a new plan. */
export function NewPlanPage() {
  return <PlanEditor plan={null} />;
}

type Scope = 'all' | 'some';

/** The messages of plan-form.ts that have no limits in them. */
const PLAIN_MESSAGES = ['nameRequired', 'name', 'price', 'branches', 'days', 'hours'] as const;

function PlanEditor({ plan }: { readonly plan: Plan | null }) {
  const { t } = useTranslation('plans');
  const { language } = usePreferences();
  const format = useFormat();
  const navigate = useNavigate();
  const account = useActiveAccount();
  const branches = useAdminBranches();
  const sideBySide = useSideBySide();
  const today = useBaghdadToday();
  const save = useSavePlan();
  const { online, readOnly } = useAdminWriteState();
  const [error, setError] = useState<PlanErrorKey | null>(null);
  const formId = useId();
  const Heading = sideBySide ? 'h2' : 'h1';
  const allBranchAccess = account?.allBranches === true;

  // Changing a plan needs access to every branch it works in (the database checks it too).
  const reachable = new Set(branches.data?.map((branch) => branch.id));
  const canChange =
    plan === null ||
    (plan.branchIds === null
      ? allBranchAccess
      : branches.isSuccess && plan.branchIds.every((id) => reachable.has(id)));

  const form = useForm<PlanFormValues, unknown, PlanDraft>({
    resolver: zodResolver(planFormSchema),
    defaultValues: {
      ...planFormValues(plan),
      // Without access to every branch, a new plan is for some of them.
      ...(plan === null && !allBranchAccess ? { allBranches: false } : {}),
    },
  });
  const { errors, isDirty } = form.formState;
  useUnsavedChanges(isDirty);
  const [kind, durationCount, durationUnit, allBranches, allDays, allDay] = useWatch({
    control: form.control,
    name: ['kind', 'durationCount', 'durationUnit', 'allBranches', 'allDays', 'allDay'],
  });
  const hasDuration = planHasDuration(kind);
  const hasVisits = planHasVisits(kind);
  const count = parseWholeNumber(durationCount);
  const [minCount, maxCount] = PLAN_FORM_LIMITS.durationCount[durationUnit];
  const endsOn =
    hasDuration && count !== null && count >= minCount && count <= maxCount
      ? planEndDate(today, durationUnit, count)
      : null;

  /** A field's message, with its limits when it has them. */
  const message = (field: { readonly message?: string } | undefined) => {
    const key = field?.message;
    if (
      key === 'durationCount' ||
      key === 'visitCount' ||
      key === 'dailyLimit' ||
      key === 'freezeDays'
    ) {
      const [min, max] =
        key === 'durationCount'
          ? PLAN_FORM_LIMITS.durationCount[durationUnit]
          : PLAN_FORM_LIMITS[key];
      return (
        <FieldError>
          {t(`form.errors.${key}`, { min: format.number(min), max: format.number(max) })}
        </FieldError>
      );
    }
    const plain = PLAIN_MESSAGES.find((each) => each === key);
    return plain ? <FieldError>{t(`form.errors.${plain}`)}</FieldError> : null;
  };

  const submit = form.handleSubmit((values) => {
    setError(null);
    save.mutate(
      { planId: plan?.id ?? null, plan: values },
      {
        onSuccess: (planId) => {
          toast.success(t(plan ? 'detail.saved' : 'detail.created'));
          form.reset(form.getValues());
          if (!plan) void navigate({ to: '/plans/$planId', params: { planId } });
        },
        onError: (thrown) => {
          setError(planErrorKey(thrown, 'save_plan'));
        },
      },
    );
  });

  const disabled = !canChange || !online || readOnly;
  const scopeChoices = (all: string, some: string) => [
    { value: 'all' as Scope, label: all },
    { value: 'some' as Scope, label: some },
  ];

  return (
    <div className="flex flex-col gap-4" data-plan-editor={plan?.nameCkb ?? 'new'}>
      <BackToList to="/plans" label={t('list.back')} />
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Heading className="text-2xl">
            {plan ? localizedName(plan, language) : t('detail.newTitle')}
          </Heading>
          {plan && !plan.isActive && (
            <Badge variant="secondary">
              <CircleOffIcon aria-hidden="true" />
              {t('status.offSale')}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {plan ? t('list.description') : t('detail.newDescription')}
        </p>
      </div>
      {canChange ? (
        <WriteStateNotice area="roles" />
      ) : (
        <Alert>
          <LockIcon />
          <AlertDescription>{t('detail.readOnly')}</AlertDescription>
        </Alert>
      )}

      <form id={formId} noValidate onSubmit={(event) => void submit(event)}>
        <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardContent>
              <FieldGroup>
                <Field data-invalid={Boolean(errors.nameCkb)}>
                  <FieldLabel htmlFor={`${formId}-name-ckb`}>{t('form.nameCkb')}</FieldLabel>
                  <Input
                    id={`${formId}-name-ckb`}
                    autoComplete="off"
                    {...form.register('nameCkb')}
                  />
                  <FieldDescription>{t('form.nameHint')}</FieldDescription>
                  {message(errors.nameCkb)}
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field data-invalid={Boolean(errors.nameEn)}>
                    <FieldLabel htmlFor={`${formId}-name-en`}>{t('form.nameEn')}</FieldLabel>
                    <Input
                      id={`${formId}-name-en`}
                      dir="ltr"
                      lang="en"
                      autoComplete="off"
                      {...form.register('nameEn')}
                    />
                    {message(errors.nameEn)}
                  </Field>
                  <Field data-invalid={Boolean(errors.nameAr)}>
                    <FieldLabel htmlFor={`${formId}-name-ar`}>{t('form.nameAr')}</FieldLabel>
                    <Input
                      id={`${formId}-name-ar`}
                      dir="rtl"
                      lang="ar"
                      autoComplete="off"
                      {...form.register('nameAr')}
                    />
                    {message(errors.nameAr)}
                  </Field>
                </div>
                <Field>
                  <FieldLabel>{t('form.kind')}</FieldLabel>
                  <Controller
                    control={form.control}
                    name="kind"
                    render={({ field }) => (
                      <ChoiceGroup
                        label={t('form.kind')}
                        value={field.value}
                        choices={PLAN_KINDS.map((each) => ({
                          value: each,
                          label: t(`kinds.${each}`),
                        }))}
                        onChange={field.onChange}
                      />
                    )}
                  />
                  <FieldDescription>{t(`kindHints.${kind}`)}</FieldDescription>
                </Field>
                {hasDuration && (
                  <Field data-invalid={Boolean(errors.durationCount)}>
                    <FieldLabel htmlFor={`${formId}-duration`}>{t('form.duration')}</FieldLabel>
                    <div className="flex gap-2">
                      <Input
                        id={`${formId}-duration`}
                        inputMode="numeric"
                        dir="ltr"
                        className="w-28"
                        aria-label={t('form.durationCount')}
                        aria-invalid={Boolean(errors.durationCount)}
                        {...form.register('durationCount')}
                      />
                      <NativeSelect
                        aria-label={t('form.durationUnit')}
                        {...form.register('durationUnit')}
                      >
                        {DURATION_UNITS.map((unit) => (
                          <NativeSelectOption key={unit} value={unit}>
                            {t(`form.units.${unit}`)}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                    {endsOn && (
                      <FieldDescription data-testid="plan-ends-preview">
                        {t('form.endsPreview', { date: format.date(endsOn, 'long') })}
                      </FieldDescription>
                    )}
                    {message(errors.durationCount)}
                  </Field>
                )}
                {hasVisits && (
                  <Field data-invalid={Boolean(errors.visitCount)}>
                    <FieldLabel htmlFor={`${formId}-visits`}>{t('form.visitCount')}</FieldLabel>
                    <Input
                      id={`${formId}-visits`}
                      inputMode="numeric"
                      dir="ltr"
                      className="w-28"
                      aria-invalid={Boolean(errors.visitCount)}
                      {...form.register('visitCount')}
                    />
                    {message(errors.visitCount)}
                  </Field>
                )}
                <Field data-invalid={Boolean(errors.price)}>
                  <FieldLabel htmlFor={`${formId}-price`}>{t('form.price')}</FieldLabel>
                  <Input
                    id={`${formId}-price`}
                    inputMode="numeric"
                    dir="ltr"
                    className="w-44 tabular-nums"
                    placeholder="25,000"
                    aria-invalid={Boolean(errors.price)}
                    {...form.register('price')}
                  />
                  {message(errors.price)}
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('form.rules')}</CardTitle>
              <CardDescription>{t('form.rulesHint')}</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel>{t('form.gender')}</FieldLabel>
                  <Controller
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                      <ChoiceGroup
                        label={t('form.gender')}
                        value={field.value}
                        choices={PLAN_GENDERS.map((each) => ({
                          value: each,
                          label: t(`form.genders.${each}`),
                        }))}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </Field>

                <Field data-invalid={Boolean(errors.branchIds)}>
                  <FieldLabel>{t('form.branches')}</FieldLabel>
                  <Controller
                    control={form.control}
                    name="allBranches"
                    render={({ field }) => (
                      <ChoiceGroup
                        label={t('form.branches')}
                        value={field.value ? 'all' : 'some'}
                        choices={scopeChoices(t('form.allBranches'), t('form.someBranches')).filter(
                          (choice) => choice.value === 'some' || allBranchAccess || field.value,
                        )}
                        onChange={(value) => {
                          field.onChange(value === 'all');
                        }}
                      />
                    )}
                  />
                  {!allBranches && (
                    <Controller
                      control={form.control}
                      name="branchIds"
                      render={({ field }) => (
                        <div
                          className="flex flex-col gap-2"
                          role="group"
                          aria-label={t('form.someBranches')}
                        >
                          {branches.isPending ? (
                            <Skeleton className="h-11 rounded-xl" />
                          ) : (
                            branches.data?.map((branch) => {
                              const id = `${formId}-branch-${branch.id}`;
                              return (
                                <div key={branch.id} className="flex items-center gap-3">
                                  <Checkbox
                                    id={id}
                                    checked={field.value.includes(branch.id)}
                                    onCheckedChange={(checked) => {
                                      field.onChange(
                                        checked === true
                                          ? [...field.value, branch.id]
                                          : field.value.filter((each) => each !== branch.id),
                                      );
                                    }}
                                  />
                                  <Label htmlFor={id} className="font-normal">
                                    {localizedName(branch, language)}
                                  </Label>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    />
                  )}
                  {message(errors.branchIds)}
                </Field>

                <Field data-invalid={Boolean(errors.days)}>
                  <FieldLabel>{t('form.days')}</FieldLabel>
                  <Controller
                    control={form.control}
                    name="allDays"
                    render={({ field }) => (
                      <ChoiceGroup
                        label={t('form.days')}
                        value={field.value ? 'all' : 'some'}
                        choices={scopeChoices(t('form.allDays'), t('form.someDays'))}
                        onChange={(value) => {
                          field.onChange(value === 'all');
                        }}
                      />
                    )}
                  />
                  {!allDays && (
                    <Controller
                      control={form.control}
                      name="days"
                      render={({ field }) => (
                        <div
                          className="flex flex-wrap gap-2"
                          role="group"
                          aria-label={t('form.someDays')}
                        >
                          {WEEK_ORDER.map((day) => {
                            const chosen = field.value.includes(day);
                            return (
                              <Button
                                key={day}
                                type="button"
                                variant={chosen ? 'default' : 'outline'}
                                aria-pressed={chosen}
                                className={cn('rounded-full', !chosen && 'text-muted-foreground')}
                                onClick={() => {
                                  field.onChange(
                                    chosen
                                      ? field.value.filter((each) => each !== day)
                                      : [...field.value, day],
                                  );
                                }}
                              >
                                {resources[language].dates.weekdays[day % 7]}
                              </Button>
                            );
                          })}
                        </div>
                      )}
                    />
                  )}
                  {message(errors.days)}
                </Field>

                <Field data-invalid={Boolean(errors.until)}>
                  <FieldLabel>{t('form.hours')}</FieldLabel>
                  <Controller
                    control={form.control}
                    name="allDay"
                    render={({ field }) => (
                      <ChoiceGroup
                        label={t('form.hours')}
                        value={field.value ? 'all' : 'some'}
                        choices={scopeChoices(t('form.allDay'), t('form.someHours'))}
                        onChange={(value) => {
                          field.onChange(value === 'all');
                        }}
                      />
                    )}
                  />
                  {!allDay && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Label htmlFor={`${formId}-from`} className="font-normal">
                        {t('form.from')}
                      </Label>
                      <Input
                        id={`${formId}-from`}
                        type="time"
                        dir="ltr"
                        className="w-36"
                        {...form.register('from')}
                      />
                      <Label htmlFor={`${formId}-until`} className="font-normal">
                        {t('form.until')}
                      </Label>
                      <Input
                        id={`${formId}-until`}
                        type="time"
                        dir="ltr"
                        className="w-36"
                        aria-invalid={Boolean(errors.until)}
                        {...form.register('until')}
                      />
                    </div>
                  )}
                  {message(errors.until)}
                </Field>

                <Field data-invalid={Boolean(errors.dailyLimit)}>
                  <FieldLabel htmlFor={`${formId}-daily`}>{t('form.dailyLimit')}</FieldLabel>
                  <Input
                    id={`${formId}-daily`}
                    inputMode="numeric"
                    dir="ltr"
                    className="w-28"
                    aria-invalid={Boolean(errors.dailyLimit)}
                    {...form.register('dailyLimit')}
                  />
                  <FieldDescription>{t('form.dailyLimitHint')}</FieldDescription>
                  {message(errors.dailyLimit)}
                </Field>

                {hasDuration && (
                  <Field data-invalid={Boolean(errors.freezeDays)}>
                    <FieldLabel htmlFor={`${formId}-freeze`}>{t('form.freezeDays')}</FieldLabel>
                    <Input
                      id={`${formId}-freeze`}
                      inputMode="numeric"
                      dir="ltr"
                      className="w-28"
                      aria-invalid={Boolean(errors.freezeDays)}
                      {...form.register('freezeDays')}
                    />
                    <FieldDescription>{t('form.freezeDaysHint')}</FieldDescription>
                    {message(errors.freezeDays)}
                  </Field>
                )}

                <Controller
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <Field>
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id={`${formId}-on-sale`}
                          checked={field.value}
                          onCheckedChange={(checked) => {
                            field.onChange(checked === true);
                          }}
                        />
                        <Label htmlFor={`${formId}-on-sale`} className="font-normal">
                          {t('form.onSale')}
                        </Label>
                      </div>
                      <FieldDescription>{t('form.onSaleHint')}</FieldDescription>
                    </Field>
                  )}
                />
                <PlanError error={error} />
              </FieldGroup>
            </CardContent>
          </Card>
        </fieldset>
      </form>
      {plan && <PlanSpaSessions planId={plan.id} disabled={disabled} />}

      {canChange && (
        <StickyActionBar>
          <Button
            type="submit"
            form={formId}
            size="lg"
            disabled={!online || readOnly || (plan !== null && !isDirty) || save.isPending}
          >
            {save.isPending && <Spinner />}
            {plan ? t('detail.save') : t('detail.create')}
          </Button>
        </StickyActionBar>
      )}
    </div>
  );
}
