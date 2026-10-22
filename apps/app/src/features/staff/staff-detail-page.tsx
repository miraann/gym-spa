import { localizedName } from '@gym/i18n';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { StickyActionBar } from '@gym/ui/blocks/sticky-action-bar';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Badge } from '@gym/ui/components/badge';
import { Button } from '@gym/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@gym/ui/components/empty';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Spinner } from '@gym/ui/components/spinner';
import { useSideBySide } from '@gym/ui/hooks/use-side-by-side';
import { zodResolver } from '@hookform/resolvers/zod';
import { useParams } from '@tanstack/react-router';
import { InfoIcon, LockIcon, SearchXIcon } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { useActiveAccount } from '@/features/auth/auth-context';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { useUnsavedChanges } from '@/lib/unsaved-changes';
import {
  useAdminBranches,
  useRenameStaff,
  useRoleOverview,
  useSaveStaffAccess,
  useStaffAction,
  useStaffDirectory,
  type StaffAction,
  type StaffMember,
} from './admin-data';
import { adminErrorKey, type AdminErrorKey } from './admin-errors';
import { AdminError, BackToList } from './admin-error';
import { StaffBadges } from './staff-badges';
import { BranchPicker, RolePicker } from './staff-fields';
import { staffAccessSchema, usernameSchema, type StaffAccessInput } from './staff-form';
import { TemporaryPasswordDialog } from './temporary-password';
import { useAdminWriteState } from './write-state';
import { WriteStateNotice } from './write-state-notice';

/** One staff member: who they are, their access, and what a manager can do to their account. */
export function StaffDetailPage() {
  const { t } = useTranslation('staff');
  const { staffId } = useParams({ from: '/staff/$staffId' });
  const staff = useStaffDirectory();
  const member = staff.data?.find((each) => each.id === staffId);

  if (staff.isPending) return <Skeleton className="h-96 rounded-3xl" />;
  if (staff.isError) return <AdminError error={adminErrorKey(staff.error, 'list')} />;
  if (!member) {
    return (
      <div className="flex flex-col gap-4">
        <BackToList to="/staff" label={t('list.back')} />
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
  return <StaffDetail key={member.id} member={member} />;
}

function StaffDetail({ member }: { readonly member: StaffMember }) {
  const { t } = useTranslation('staff');
  const { language } = usePreferences();
  const format = useFormat();
  const account = useActiveAccount();
  const roles = useRoleOverview();
  const sideBySide = useSideBySide();
  const isSelf = account?.staffId === member.id;
  const role = roles.data?.find((each) => each.id === member.roleId);
  const Heading = sideBySide ? 'h2' : 'h1';

  return (
    <div className="flex flex-col gap-4" data-staff-detail={member.username}>
      <BackToList to="/staff" label={t('list.back')} />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Heading className="text-2xl">{member.fullName}</Heading>
          {isSelf && <Badge variant="secondary">{t('detail.you')}</Badge>}
          <StaffBadges member={member} />
        </div>
        <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
          <span dir="ltr" className="font-mono">
            {member.username}
          </span>
          {role && (
            <>
              <span aria-hidden="true">·</span>
              <span>{localizedName(role, language)}</span>
            </>
          )}
        </p>
      </div>

      <dl className="grid gap-3 rounded-2xl bg-card p-4 text-sm ring-1 ring-border sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">{t('detail.lastLogin')}</dt>
          <dd>{member.lastLoginAt ? format.dateTime(member.lastLoginAt) : t('detail.never')}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">{t('detail.pin')}</dt>
          <dd>
            {member.pinLocked
              ? t('detail.pinLocked')
              : member.hasPin
                ? t('detail.pinSet')
                : t('detail.pinNotSet')}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">{t('detail.phone')}</dt>
          <dd dir="ltr" className="text-start">
            {member.phone ?? t('detail.noPhone')}
          </dd>
        </div>
      </dl>

      {isSelf ? (
        <Alert>
          <InfoIcon />
          <AlertDescription>{t('detail.selfNotice')}</AlertDescription>
        </Alert>
      ) : !member.canManage ? (
        <Alert>
          <LockIcon />
          <AlertDescription>{t('detail.cannotManage')}</AlertDescription>
        </Alert>
      ) : (
        <>
          <WriteStateNotice area="staff" />
          <AccessForm member={member} />
          <AccountActions member={member} />
        </>
      )}
    </div>
  );
}

/** Name, phone, role and branches, saved together (save_staff_access). */
function AccessForm({ member }: { readonly member: StaffMember }) {
  const { t } = useTranslation('staff');
  const account = useActiveAccount();
  const roles = useRoleOverview();
  const branches = useAdminBranches();
  const save = useSaveStaffAccess();
  const { online, readOnly } = useAdminWriteState();
  const [error, setError] = useState<AdminErrorKey | null>(null);

  const form = useForm<StaffAccessInput, unknown, z.output<typeof staffAccessSchema>>({
    resolver: zodResolver(staffAccessSchema),
    defaultValues: {
      fullName: member.fullName,
      phone: member.phone ?? '',
      roleId: member.roleId,
      allBranches: member.allBranches,
      branchIds: [...member.branchIds],
    },
  });
  const { errors, isDirty } = form.formState;
  useUnsavedChanges(isDirty);
  const [allBranches, branchIds] = useWatch({
    control: form.control,
    name: ['allBranches', 'branchIds'],
  });

  const submit = form.handleSubmit((values) => {
    setError(null);
    save.mutate(
      { staffId: member.id, access: values },
      {
        onSuccess: () => {
          form.reset(values);
          toast.success(t('detail.saved'));
        },
        onError: (thrown) => {
          setError(adminErrorKey(thrown, 'save_access'));
        },
      },
    );
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3>{t('detail.accessTitle')}</h3>
        </CardTitle>
        <CardDescription>{t('detail.accessDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form id="staff-access" noValidate onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Field data-invalid={Boolean(errors.fullName)}>
              <FieldLabel htmlFor="staff-name">{t('form.fullName')}</FieldLabel>
              <Input id="staff-name" autoComplete="off" {...form.register('fullName')} />
              {errors.fullName && <FieldError>{t('form.errors.fullName')}</FieldError>}
            </Field>
            <Field data-invalid={Boolean(errors.phone)}>
              <FieldLabel htmlFor="staff-phone">{t('form.phone')}</FieldLabel>
              <Input
                id="staff-phone"
                type="tel"
                dir="ltr"
                inputMode="tel"
                autoComplete="off"
                {...form.register('phone')}
              />
              {errors.phone && <FieldError>{t('form.errors.phone')}</FieldError>}
            </Field>
            {roles.isPending || branches.isPending ? (
              <Skeleton className="h-40 rounded-2xl" />
            ) : (
              <>
                <Controller
                  control={form.control}
                  name="roleId"
                  render={({ field }) => (
                    <RolePicker
                      roles={roles.data ?? []}
                      value={field.value}
                      onChange={field.onChange}
                      error={errors.roleId && t('form.errors.role')}
                    />
                  )}
                />
                <BranchPicker
                  branches={branches.data ?? []}
                  allBranches={allBranches}
                  branchIds={branchIds}
                  canGiveAll={account?.allBranches === true}
                  hiddenCount={member.hiddenBranchCount}
                  onChange={({ allBranches, branchIds }) => {
                    form.setValue('allBranches', allBranches, { shouldDirty: true });
                    form.setValue('branchIds', branchIds, {
                      shouldDirty: true,
                      shouldValidate: form.formState.isSubmitted,
                    });
                  }}
                  error={errors.branchIds && t('form.errors.branches')}
                />
              </>
            )}
            <AdminError error={error} />
          </FieldGroup>
        </form>
        <StickyActionBar>
          <Button
            type="submit"
            form="staff-access"
            size="lg"
            disabled={!online || readOnly || !isDirty || save.isPending}
          >
            {save.isPending && <Spinner />}
            {t('detail.save')}
          </Button>
        </StickyActionBar>
      </CardContent>
    </Card>
  );
}

const ACTION_TEXTS = {
  reset_password: {
    title: 'actions.resetPasswordTitle',
    description: 'actions.resetPasswordDescription',
    confirm: 'actions.resetPassword',
    done: 'actions.resetPasswordDone',
  },
  reset_pin: {
    title: 'actions.resetPinTitle',
    description: 'actions.resetPinDescription',
    confirm: 'actions.resetPin',
    done: 'actions.resetPinDone',
  },
  deactivate: {
    title: 'actions.deactivateTitle',
    description: 'actions.deactivateDescription',
    confirm: 'actions.deactivate',
    done: 'actions.deactivateDone',
  },
  reactivate: {
    title: 'actions.reactivateTitle',
    description: 'actions.reactivateDescription',
    confirm: 'actions.reactivate',
    done: 'actions.reactivateDone',
  },
} as const;

/**
 * The login: a new username, a new temporary password, removing the PIN, deactivating or
 * reactivating. A read-only gym can still take access away (password, PIN, deactivate).
 */
function AccountActions({ member }: { readonly member: StaffMember }) {
  const { t } = useTranslation('staff');
  const { online, readOnly } = useAdminWriteState();
  const run = useStaffAction();
  const [confirming, setConfirming] = useState<StaffAction | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [error, setError] = useState<AdminErrorKey | null>(null);
  const texts = confirming ? ACTION_TEXTS[confirming] : null;

  const confirm = () => {
    if (!confirming) return;
    const action = confirming;
    setError(null);
    run.mutate(
      { staffId: member.id, action },
      {
        onSuccess: (temporaryPassword) => {
          setConfirming(null);
          if (temporaryPassword !== null) setPassword(temporaryPassword);
          else toast.success(t(ACTION_TEXTS[action].done, { name: member.fullName }));
        },
        onError: (thrown) => {
          setError(adminErrorKey(thrown, action));
        },
      },
    );
  };

  const open = (action: StaffAction) => {
    setError(null);
    setConfirming(action);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3>{t('actions.title')}</h3>
        </CardTitle>
        <CardDescription>{t('actions.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {member.isActive ? (
          <>
            <Button
              variant="outline"
              disabled={!online || readOnly}
              onClick={() => {
                setRenaming(true);
              }}
            >
              {t('actions.rename')}
            </Button>
            <Button
              variant="outline"
              disabled={!online}
              onClick={() => {
                open('reset_password');
              }}
            >
              {t('actions.resetPassword')}
            </Button>
            {member.hasPin && (
              <Button
                variant="outline"
                disabled={!online}
                onClick={() => {
                  open('reset_pin');
                }}
              >
                {t('actions.resetPin')}
              </Button>
            )}
            <Button
              variant="destructive"
              disabled={!online}
              onClick={() => {
                open('deactivate');
              }}
            >
              {t('actions.deactivate')}
            </Button>
          </>
        ) : (
          <Button
            disabled={!online || readOnly}
            onClick={() => {
              open('reactivate');
            }}
          >
            {t('actions.reactivate')}
          </Button>
        )}
      </CardContent>

      <ResponsiveDialog
        open={texts !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setConfirming(null);
        }}
        title={texts ? t(texts.title, { name: member.fullName }) : ''}
        description={texts ? t(texts.description, { name: member.fullName }) : undefined}
        footer={
          <>
            <Button
              variant={
                confirming === 'deactivate' || confirming === 'reset_pin'
                  ? 'destructive'
                  : 'default'
              }
              disabled={!online || run.isPending}
              onClick={confirm}
            >
              {run.isPending && <Spinner />}
              {texts ? t(texts.confirm) : ''}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setConfirming(null);
              }}
            >
              {t('actions.cancel')}
            </Button>
          </>
        }
      >
        <AdminError error={error} />
      </ResponsiveDialog>

      <RenameDialog member={member} open={renaming} onOpenChange={setRenaming} />
      <TemporaryPasswordDialog
        password={password}
        staffName={member.fullName}
        onClose={() => {
          setPassword(null);
        }}
      />
    </Card>
  );
}

const renameSchema = z.object({ username: usernameSchema });

/** A new username. The password, PIN and sessions stay; the staff member logs in with the new one. */
function RenameDialog({
  member,
  open,
  onOpenChange,
}: {
  readonly member: StaffMember;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('staff');
  const { online } = useAdminWriteState();
  const rename = useRenameStaff();
  const [error, setError] = useState<AdminErrorKey | null>(null);
  const form = useForm<z.input<typeof renameSchema>, unknown, z.output<typeof renameSchema>>({
    resolver: zodResolver(renameSchema),
    defaultValues: { username: member.username },
  });
  const { errors } = form.formState;

  const close = (next: boolean) => {
    if (!next) {
      form.reset({ username: member.username });
      setError(null);
    }
    onOpenChange(next);
  };

  const submit = form.handleSubmit(({ username }) => {
    setError(null);
    if (username === member.username) {
      close(false);
      return;
    }
    rename.mutate(
      { staffId: member.id, username },
      {
        onSuccess: () => {
          toast.success(t('actions.renameDone', { username }));
          onOpenChange(false);
        },
        onError: (thrown) => {
          setError(adminErrorKey(thrown, 'rename'));
        },
      },
    );
  });

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={close}
      title={t('actions.renameTitle', { name: member.fullName })}
      description={t('actions.renameDescription')}
      footer={
        <>
          <Button type="submit" form="rename-staff" disabled={!online || rename.isPending}>
            {rename.isPending && <Spinner />}
            {t('actions.renameSubmit')}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              close(false);
            }}
          >
            {t('actions.cancel')}
          </Button>
        </>
      }
    >
      <form id="rename-staff" noValidate onSubmit={(event) => void submit(event)}>
        <FieldGroup>
          <Field data-invalid={Boolean(errors.username)}>
            <FieldLabel htmlFor="rename-username">{t('form.username')}</FieldLabel>
            <Input
              id="rename-username"
              dir="ltr"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              {...form.register('username')}
            />
            <FieldDescription>{t('form.usernameHint')}</FieldDescription>
            {errors.username && <FieldError>{t('form.errors.username')}</FieldError>}
          </Field>
          <AdminError error={error} />
        </FieldGroup>
      </form>
    </ResponsiveDialog>
  );
}
