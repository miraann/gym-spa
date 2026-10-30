import {
  DEFAULT_FIRST_BRANCH_NAME,
  addMonthsToDate,
  baghdadDateOf,
  isReservedGymCode,
  isValidGymCode,
  isValidUsername,
  normalizeGymCode,
  normalizeUsername,
  paidUntilFromDate,
  toLatinDigits,
} from '@gym/core';
import type { CreateGymResult } from '@gym/seller-admin';
import { ChoiceGroup } from '@gym/ui/blocks/choice-group';
import { CopyableSecret } from '@gym/ui/blocks/copyable-secret';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
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
import { Spinner } from '@gym/ui/components/spinner';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from '@tanstack/react-router';
import { CircleCheckIcon, CloudIcon, ServerIcon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { toast } from 'sonner';
import { useCreateGym, useCreateOfflineGym } from '@/lib/api';
import { panelErrorKey, type PanelErrorKey } from '@/lib/errors';
import { FormError } from '@/shell/form-error';
import { SubscriptionPicker } from './gym-dialogs';
import { gymLoginLink } from './gym-page';

const PHONE = /^\+?[0-9][0-9 ]{3,18}[0-9]$/;

/** Like app.is_clean_text: 1 to 100 characters, no space at either end (after trimming). */
const name = z.string().trim().max(100);

// Messages are keys of seller:createGym.
const schema = z.object({
  code: z
    .string()
    .transform(normalizeGymCode)
    .superRefine((code, context) => {
      if (isReservedGymCode(code)) context.addIssue({ code: 'custom', message: 'codeReserved' });
      else if (!isValidGymCode(code)) context.addIssue({ code: 'custom', message: 'codeInvalid' });
    }),
  nameCkb: name.min(1, 'nameRequired'),
  nameEn: name,
  nameAr: name,
  branchName: name.min(1, 'nameRequired'),
  ownerUsername: z.string().transform(normalizeUsername).refine(isValidUsername, 'usernameInvalid'),
  ownerFullName: name.min(1, 'fullNameRequired'),
  ownerPhone: z
    .string()
    .transform((value) => toLatinDigits(value).trim())
    .refine((value) => value === '' || PHONE.test(value), 'phoneInvalid'),
});
type FormInput = z.input<typeof schema>;
type Values = z.output<typeof schema>;

type Edition = 'online' | 'offline';
/** An offline gym's record has only these (its Owner and branches are made on its own server PC). */
const offlineSchema = schema.pick({ code: true, nameCkb: true, nameEn: true, nameAr: true });
type OfflineValues = z.output<typeof offlineSchema>;
const OFFLINE_FIELDS = ['code', 'nameCkb', 'nameEn', 'nameAr'] as const;

/** What the confirmation is about: an online gym with its Owner, or an offline gym's record. */
type Pending =
  | { readonly edition: 'online'; readonly values: Values }
  | { readonly edition: 'offline'; readonly values: OfflineValues };

const MESSAGES = [
  'codeReserved',
  'codeInvalid',
  'nameRequired',
  'usernameInvalid',
  'fullNameRequired',
  'phoneInvalid',
] as const;

function Done({ result }: { readonly result: CreateGymResult }) {
  const { t } = useTranslation('seller');
  const link = gymLoginLink(result.code);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('createGym.doneTitle')} description={t('createGym.doneDescription')} />
      <Card className="max-w-2xl">
        <CardContent className="flex flex-col gap-4 pt-6">
          <Alert variant="success">
            <CircleCheckIcon />
            <AlertDescription>
              <span dir="ltr" className="font-mono">
                {result.code}
              </span>
            </AlertDescription>
          </Alert>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">{t('createGym.link')}</span>
            <code
              dir="ltr"
              data-testid="gym-link"
              className="rounded-xl bg-muted px-3 py-2 break-all select-all"
            >
              {link}
            </code>
            <span className="text-sm text-muted-foreground">{t('createGym.linkHint')}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">{t('createGym.ownerUsername')}</span>
            <span dir="ltr" data-testid="owner-username" className="font-mono text-lg">
              {result.ownerUsername}
            </span>
          </div>
          <CopyableSecret
            value={result.temporaryPassword}
            texts={{
              label: t('temporaryPassword.label'),
              copy: t('temporaryPassword.copy'),
              copied: t('temporaryPassword.copied'),
              copyFailed: t('temporaryPassword.copyFailed'),
              shownOnce: t('temporaryPassword.shownOnce'),
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button asChild size="lg">
              <Link to="/gyms/$gymId" params={{ gymId: result.gymId }}>
                {t('createGym.openGym')}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * A new gym (spec §2.6): online with its first Owner, or an offline gym's record (MT-5). The code
 * is permanent, so it is confirmed.
 */
export function CreateGymPage() {
  const { t } = useTranslation('seller');
  const navigate = useNavigate();
  const create = useCreateGym();
  const createOffline = useCreateOfflineGym();
  const [edition, setEdition] = useState<Edition>('online');
  const pendingSave = create.isPending || createOffline.isPending;
  const [subscription, setSubscription] = useState(() => ({
    date: addMonthsToDate(baghdadDateOf(Date.now()), 1),
    noEnd: false,
  }));
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<PanelErrorKey | null>(null);
  const [result, setResult] = useState<CreateGymResult | null>(null);
  const form = useForm<FormInput, unknown, Values>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      code: '',
      nameCkb: '',
      nameEn: '',
      nameAr: '',
      branchName: DEFAULT_FIRST_BRANCH_NAME,
      ownerUsername: 'owner',
      ownerFullName: '',
      ownerPhone: '',
    },
  });
  const { errors } = form.formState;
  const message = (key: string | undefined) => {
    const known = MESSAGES.find((each) => each === key);
    return known ? t(`createGym.${known}`) : null;
  };

  if (result !== null) return <Done result={result} />;

  const reviewOnline = form.handleSubmit((values) => {
    setError(null);
    if (!subscription.noEnd && subscription.date === '') {
      setError('invalid_request');
      return;
    }
    setPending({ edition: 'online', values });
  });

  const reviewOffline = async () => {
    setError(null);
    if (!(await form.trigger([...OFFLINE_FIELDS]))) return;
    const parsed = offlineSchema.safeParse(form.getValues());
    if (parsed.success) setPending({ edition: 'offline', values: parsed.data });
  };

  const confirmOffline = (values: OfflineValues) => {
    createOffline.mutate(
      {
        code: values.code,
        nameCkb: values.nameCkb,
        nameEn: values.nameEn || null,
        nameAr: values.nameAr || null,
      },
      {
        onSuccess: (gymId) => {
          setPending(null);
          toast.success(t('createGym.offlineDone'));
          void navigate({ to: '/gyms/$gymId', params: { gymId } });
        },
        onError: (thrown) => {
          setPending(null);
          setError(panelErrorKey(thrown));
        },
      },
    );
  };

  const confirm = () => {
    if (pending === null) return;
    if (pending.edition === 'offline') {
      confirmOffline(pending.values);
      return;
    }
    const values = pending.values;
    create.mutate(
      {
        action: 'create_gym',
        code: values.code,
        nameCkb: values.nameCkb,
        nameEn: values.nameEn || null,
        nameAr: values.nameAr || null,
        firstBranchName: values.branchName,
        paidUntil: subscription.noEnd ? null : paidUntilFromDate(subscription.date),
        owner: {
          username: values.ownerUsername,
          fullName: values.ownerFullName,
          phone: values.ownerPhone || null,
        },
      },
      {
        onSuccess: (created) => {
          setPending(null);
          setResult(created);
        },
        onError: (thrown) => {
          setPending(null);
          setError(panelErrorKey(thrown));
        },
      },
    );
  };

  const text = (
    id: keyof FormInput,
    label: string,
    options: { dir?: 'ltr'; hint?: string } = {},
  ) => (
    <Field data-invalid={Boolean(errors[id])}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} dir={options.dir} aria-invalid={Boolean(errors[id])} {...form.register(id)} />
      {errors[id] ? (
        <FieldError>{message(errors[id].message)}</FieldError>
      ) : (
        options.hint && <FieldDescription>{options.hint}</FieldDescription>
      )}
    </Field>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('createGym.title')} />
      <form
        noValidate
        onSubmit={(event) => {
          if (edition === 'online') {
            void reviewOnline(event);
            return;
          }
          event.preventDefault();
          void reviewOffline();
        }}
        className="flex max-w-2xl flex-col gap-4"
      >
        <Card>
          <CardHeader>
            <CardTitle>{t('createGym.edition')}</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <ChoiceGroup
                label={t('createGym.edition')}
                value={edition}
                onChange={setEdition}
                choices={[
                  { value: 'online', label: t('createGym.online'), icon: CloudIcon },
                  { value: 'offline', label: t('createGym.offline'), icon: ServerIcon },
                ]}
              />
              <FieldDescription>
                {edition === 'online' ? t('createGym.onlineHint') : t('createGym.offlineHint')}
              </FieldDescription>
            </FieldGroup>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('createGym.gymSection')}</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              {text('code', t('createGym.code'), { dir: 'ltr', hint: t('createGym.codeHint') })}
              <Alert variant="warning">
                <TriangleAlertIcon />
                <AlertDescription>{t('createGym.codePermanent')}</AlertDescription>
              </Alert>
              {text('nameCkb', t('createGym.nameCkb'))}
              {text('nameEn', t('createGym.nameEn'), { dir: 'ltr' })}
              {text('nameAr', t('createGym.nameAr'))}
              {edition === 'online' && text('branchName', t('createGym.branch'))}
            </FieldGroup>
          </CardContent>
        </Card>
        {edition === 'online' && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{t('createGym.subscriptionSection')}</CardTitle>
              </CardHeader>
              <CardContent>
                <SubscriptionPicker
                  date={subscription.date}
                  noEnd={subscription.noEnd}
                  onChange={setSubscription}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('createGym.ownerSection')}</CardTitle>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <FieldDescription>{t('createGym.ownerNote')}</FieldDescription>
                  {text('ownerUsername', t('createGym.ownerUsername'), {
                    dir: 'ltr',
                    hint: t('createGym.ownerUsernameHint'),
                  })}
                  {text('ownerFullName', t('createGym.ownerFullName'))}
                  {text('ownerPhone', t('createGym.ownerPhone'), { dir: 'ltr' })}
                </FieldGroup>
              </CardContent>
            </Card>
          </>
        )}
        <FormError error={error} />
        <Button type="submit" size="lg" className="self-start">
          {t('createGym.submit')}
        </Button>
      </form>

      <ResponsiveDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !pendingSave) setPending(null);
        }}
        title={t('createGym.confirmTitle')}
        description={t('createGym.confirmDescription')}
        footer={
          <>
            <Button
              variant="outline"
              disabled={pendingSave}
              onClick={() => {
                setPending(null);
              }}
            >
              {t('createGym.change')}
            </Button>
            <Button disabled={pendingSave} onClick={confirm}>
              {pendingSave && <Spinner />}
              {t('createGym.confirm')}
            </Button>
          </>
        }
      >
        <p dir="ltr" data-testid="confirm-code" className="text-center font-mono text-3xl">
          {pending?.values.code}
        </p>
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertDescription>{t('createGym.codePermanent')}</AlertDescription>
        </Alert>
      </ResponsiveDialog>
    </div>
  );
}
