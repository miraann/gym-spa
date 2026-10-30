import { isValidAdminEmail, normalizeAdminEmail } from '@gym/core';
import { AddTile } from '@gym/ui/blocks/add-tile';
import { CopyableSecret } from '@gym/ui/blocks/copyable-secret';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Badge } from '@gym/ui/components/badge';
import { Button } from '@gym/ui/components/button';
import { Card } from '@gym/ui/components/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gym/ui/components/dropdown-menu';
import { Field, FieldError, FieldGroup, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Spinner } from '@gym/ui/components/spinner';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CircleCheckIcon,
  CircleOffIcon,
  EllipsisIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { useMe } from '@/auth/session';
import {
  useAddAdmin,
  useAdminChange,
  useAdmins,
  useResetAdminPassword,
  type AdminAction,
  type AdminRow,
} from '@/lib/api';
import { panelErrorKey, type PanelErrorKey } from '@/lib/errors';
import { useFormat } from '@/lib/format';
import { FormError } from '@/shell/form-error';

type Change = AdminAction | 'reset_admin_password';

const CHANGE_TEXTS = {
  deactivate_admin: {
    title: 'admins.deactivateTitle',
    description: 'admins.deactivateDescription',
    confirm: 'admins.deactivate',
  },
  reactivate_admin: {
    title: 'admins.reactivateTitle',
    description: 'admins.reactivateDescription',
    confirm: 'admins.reactivate',
  },
  reset_admin_two_step: {
    title: 'admins.resetTwoStepTitle',
    description: 'admins.resetTwoStepDescription',
    confirm: 'admins.resetTwoStep',
  },
  reset_admin_password: {
    title: 'admins.resetPasswordTitle',
    description: 'admins.resetPasswordDescription',
    confirm: 'admins.resetPassword',
  },
} as const;

/** A temporary password just made for someone, shown once. */
interface ShownPassword {
  readonly name: string;
  readonly password: string;
}

function PasswordDialog({
  shown,
  onClose,
}: {
  readonly shown: ShownPassword | null;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('seller');
  return (
    <ResponsiveDialog
      open={shown !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('admins.passwordTitle', { name: shown?.name ?? '' })}
      footer={
        <Button size="lg" onClick={onClose}>
          {t('common.done')}
        </Button>
      }
    >
      {shown !== null && (
        <CopyableSecret
          value={shown.password}
          texts={{
            label: t('temporaryPassword.label'),
            copy: t('temporaryPassword.copy'),
            copied: t('temporaryPassword.copied'),
            copyFailed: t('temporaryPassword.copyFailed'),
            shownOnce: t('admins.passwordShownOnce'),
          }}
        />
      )}
    </ResponsiveDialog>
  );
}

function ChangeDialog({
  admin,
  change,
  onClose,
  onPassword,
}: {
  readonly admin: AdminRow | null;
  readonly change: Change;
  readonly onClose: () => void;
  readonly onPassword: (shown: ShownPassword) => void;
}) {
  const { t } = useTranslation('seller');
  const adminChange = useAdminChange();
  const resetPassword = useResetAdminPassword();
  const [error, setError] = useState<PanelErrorKey | null>(null);
  const texts = CHANGE_TEXTS[change];
  const pending = adminChange.isPending || resetPassword.isPending;

  const close = () => {
    setError(null);
    onClose();
  };
  const confirm = () => {
    if (admin === null) return;
    const fail = (thrown: unknown) => {
      setError(panelErrorKey(thrown));
    };
    if (change === 'reset_admin_password') {
      resetPassword.mutate(admin.user_id, {
        onSuccess: (result) => {
          close();
          onPassword({ name: admin.full_name, password: result.temporaryPassword });
        },
        onError: fail,
      });
      return;
    }
    adminChange.mutate(
      { action: change, userId: admin.user_id },
      {
        onSuccess: () => {
          toast.success(t(texts.confirm));
          close();
        },
        onError: fail,
      },
    );
  };

  return (
    <ResponsiveDialog
      open={admin !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={t(texts.title, { name: admin?.full_name ?? '' })}
      description={t(texts.description)}
      footer={
        <>
          <Button variant="outline" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={change === 'reactivate_admin' ? 'default' : 'destructive'}
            disabled={pending}
            onClick={confirm}
          >
            {pending && <Spinner />}
            {t(texts.confirm)}
          </Button>
        </>
      }
    >
      <FormError error={error} />
    </ResponsiveDialog>
  );
}

// Messages are keys of seller:admins.
const addSchema = z.object({
  email: z.string().transform(normalizeAdminEmail).refine(isValidAdminEmail, 'emailInvalid'),
  fullName: z.string().trim().min(1, 'fullName').max(100),
});

function AddAdminDialog({
  open,
  onOpenChange,
  onPassword,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPassword: (shown: ShownPassword) => void;
}) {
  const { t } = useTranslation('seller');
  const add = useAddAdmin();
  const [error, setError] = useState<PanelErrorKey | null>(null);
  const form = useForm<z.input<typeof addSchema>, unknown, z.output<typeof addSchema>>({
    resolver: zodResolver(addSchema),
    defaultValues: { email: '', fullName: '' },
  });
  const { errors } = form.formState;

  const submit = form.handleSubmit((values) => {
    setError(null);
    add.mutate(values, {
      onSuccess: (result) => {
        form.reset();
        onOpenChange(false);
        onPassword({ name: values.fullName, password: result.temporaryPassword });
      },
      onError: (thrown) => {
        setError(panelErrorKey(thrown));
      },
    });
  });

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('admins.addTitle')}
      description={t('admins.addDescription')}
      footer={
        <Button disabled={add.isPending} onClick={() => void submit()}>
          {add.isPending && <Spinner />}
          {t('admins.addSubmit')}
        </Button>
      }
    >
      <form noValidate onSubmit={(event) => void submit(event)}>
        <FieldGroup>
          <Field data-invalid={Boolean(errors.email)}>
            <FieldLabel htmlFor="admin-email">{t('admins.email')}</FieldLabel>
            <Input id="admin-email" type="email" dir="ltr" {...form.register('email')} />
            {errors.email && <FieldError>{t('admins.emailInvalid')}</FieldError>}
          </Field>
          <Field data-invalid={Boolean(errors.fullName)}>
            <FieldLabel htmlFor="admin-name">{t('admins.fullName')}</FieldLabel>
            <Input id="admin-name" {...form.register('fullName')} />
            {errors.fullName && <FieldError>{t('createGym.fullNameRequired')}</FieldError>}
          </Field>
          <FormError error={error} />
        </FieldGroup>
      </form>
    </ResponsiveDialog>
  );
}

function AdminActions({
  admin,
  onChange,
}: {
  readonly admin: AdminRow;
  readonly onChange: (admin: AdminRow, change: Change) => void;
}) {
  const { t } = useTranslation('seller');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('admins.actions')}>
          <EllipsisIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {admin.is_active ? (
          <>
            <DropdownMenuItem
              onSelect={() => {
                onChange(admin, 'reset_admin_two_step');
              }}
            >
              {t('admins.resetTwoStep')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                onChange(admin, 'reset_admin_password');
              }}
            >
              {t('admins.resetPassword')}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                onChange(admin, 'deactivate_admin');
              }}
            >
              {t('admins.deactivate')}
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem
            onSelect={() => {
              onChange(admin, 'reactivate_admin');
            }}
          >
            {t('admins.reactivate')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Click Group's platform admins: at least two, each with two-step login. */
export function AdminsPage() {
  const { t } = useTranslation('seller');
  const format = useFormat();
  const me = useMe();
  const admins = useAdmins();
  const [adding, setAdding] = useState(false);
  const [changing, setChanging] = useState<{ admin: AdminRow; change: Change } | null>(null);
  const [password, setPassword] = useState<ShownPassword | null>(null);
  const activeCount = (admins.data ?? []).filter((admin) => admin.is_active).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('admins.title')} />
      <AddTile
        label={t('admins.add')}
        onClick={() => {
          setAdding(true);
        }}
      />
      {admins.data && activeCount < 2 && (
        <Alert variant="warning" data-testid="only-one-admin">
          <TriangleAlertIcon />
          <AlertDescription>{t('admins.onlyOne')}</AlertDescription>
        </Alert>
      )}
      {admins.isPending ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : admins.isError ? (
        <FormError error={panelErrorKey(admins.error)} />
      ) : (
        <Card className="p-0">
          <ul>
            {admins.data.map((admin) => (
              <li
                key={admin.user_id}
                data-admin={admin.email}
                className="flex items-start gap-3 border-b px-4 py-3 last:border-0"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span>{admin.full_name}</span>
                    {admin.user_id === me.user_id && (
                      <Badge variant="secondary">{t('admins.you')}</Badge>
                    )}
                    {admin.is_active ? (
                      <Badge variant="success">
                        <CircleCheckIcon aria-hidden="true" />
                        {t('admins.active')}
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <CircleOffIcon aria-hidden="true" />
                        {t('admins.inactive')}
                      </Badge>
                    )}
                  </span>
                  <span dir="ltr" className="truncate text-sm text-muted-foreground">
                    {admin.email}
                  </span>
                  <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      {admin.has_two_step ? (
                        <ShieldCheckIcon className="size-4 text-success" aria-hidden="true" />
                      ) : (
                        <ShieldAlertIcon className="size-4 text-warning" aria-hidden="true" />
                      )}
                      {t('admins.twoStep')}:{' '}
                      {admin.has_two_step ? t('admins.twoStepOn') : t('admins.twoStepOff')}
                    </span>
                    <span>{t('admins.codesLeft', { count: admin.recovery_codes_left })}</span>
                    {admin.must_change_password && <span>{t('admins.mustChange')}</span>}
                    <span>
                      {t('admins.lastLogin')}:{' '}
                      {admin.last_sign_in_at === null
                        ? t('common.never')
                        : format.dateTime(admin.last_sign_in_at)}
                    </span>
                  </span>
                </div>
                {admin.user_id !== me.user_id && (
                  <AdminActions
                    admin={admin}
                    onChange={(target, change) => {
                      setChanging({ admin: target, change });
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <AddAdminDialog open={adding} onOpenChange={setAdding} onPassword={setPassword} />
      <ChangeDialog
        admin={changing?.admin ?? null}
        change={changing?.change ?? 'deactivate_admin'}
        onClose={() => {
          setChanging(null);
        }}
        onPassword={setPassword}
      />
      <PasswordDialog
        shown={password}
        onClose={() => {
          setPassword(null);
        }}
      />
    </div>
  );
}
