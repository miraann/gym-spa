import { StickyActionBar } from '@gym/ui/blocks/sticky-action-bar';
import { Button } from '@gym/ui/components/button';
import { Card, CardContent } from '@gym/ui/components/card';
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
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { RequirePermission } from '@/components/no-access';
import { useActiveAccount, useAuthState } from '@/features/auth/auth-context';
import { useAdminBranches, useCreateStaff, useRoleOverview } from './admin-data';
import { adminErrorKey, type AdminErrorKey } from './admin-errors';
import { AdminError, BackToList } from './admin-error';
import { BranchPicker, RolePicker } from './staff-fields';
import { newStaffSchema, type NewStaffInput } from './staff-form';
import { TemporaryPasswordDialog } from './temporary-password';
import { useAdminWriteState } from './write-state';
import { WriteStateNotice } from './write-state-notice';

/** A new account just made: its temporary password is shown once, then its page opens. */
interface Created {
  readonly staffId: string;
  readonly fullName: string;
  readonly password: string;
}

/** Adding a staff member (staff.manage): login, name, role and branches. */
export function NewStaffPage() {
  return (
    <RequirePermission permission="staff.manage">
      <NewStaffForm />
    </RequirePermission>
  );
}

function NewStaffForm() {
  const { t } = useTranslation('staff');
  const navigate = useNavigate();
  const account = useActiveAccount();
  const { branchId: deviceBranchId } = useAuthState();
  const roles = useRoleOverview();
  const branches = useAdminBranches();
  const create = useCreateStaff();
  const { online, readOnly } = useAdminWriteState();
  const [error, setError] = useState<AdminErrorKey | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  const form = useForm<NewStaffInput, unknown, z.output<typeof newStaffSchema>>({
    resolver: zodResolver(newStaffSchema),
    defaultValues: {
      username: '',
      fullName: '',
      phone: '',
      roleId: '',
      allBranches: false,
      // The branch this device works in is the usual answer.
      branchIds: deviceBranchId ? [deviceBranchId] : [],
    },
  });
  const { errors } = form.formState;
  const [allBranches, branchIds] = useWatch({
    control: form.control,
    name: ['allBranches', 'branchIds'],
  });

  const submit = form.handleSubmit((values) => {
    setError(null);
    create.mutate(values, {
      onSuccess: (result) => {
        setCreated({
          staffId: result.staffId,
          fullName: values.fullName,
          password: result.temporaryPassword,
        });
      },
      onError: (thrown) => {
        setError(adminErrorKey(thrown, 'create'));
      },
    });
  });

  const done = () => {
    const staffId = created?.staffId;
    setCreated(null);
    if (staffId) void navigate({ to: '/staff/$staffId', params: { staffId } });
  };

  return (
    <div className="flex flex-col gap-4">
      <BackToList to="/staff" label={t('list.back')} />
      <div className="space-y-1">
        <h2 className="text-xl">{t('create.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('create.description')}</p>
      </div>
      <WriteStateNotice area="staff" />
      <Card>
        <CardContent>
          <form id="new-staff" noValidate onSubmit={(event) => void submit(event)}>
            <FieldGroup>
              <Field data-invalid={Boolean(errors.fullName)}>
                <FieldLabel htmlFor="staff-name">{t('form.fullName')}</FieldLabel>
                <Input id="staff-name" autoComplete="off" {...form.register('fullName')} />
                {errors.fullName && <FieldError>{t('form.errors.fullName')}</FieldError>}
              </Field>
              <Field data-invalid={Boolean(errors.username)}>
                <FieldLabel htmlFor="staff-username">{t('form.username')}</FieldLabel>
                <Input
                  id="staff-username"
                  dir="ltr"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  {...form.register('username')}
                />
                <FieldDescription>{t('form.usernameHint')}</FieldDescription>
                {errors.username && <FieldError>{t('form.errors.username')}</FieldError>}
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
                    onChange={({ allBranches, branchIds }) => {
                      form.setValue('allBranches', allBranches);
                      form.setValue('branchIds', branchIds, {
                        shouldValidate: form.formState.isSubmitted,
                      });
                    }}
                    error={errors.branchIds && t('form.errors.branches')}
                  />
                </>
              )}
              <AdminError
                error={
                  roles.isError
                    ? adminErrorKey(roles.error, 'roles')
                    : branches.isError
                      ? adminErrorKey(branches.error, 'branches')
                      : error
                }
              />
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <StickyActionBar>
        <Button
          type="submit"
          form="new-staff"
          size="lg"
          disabled={!online || readOnly || create.isPending}
        >
          {create.isPending && <Spinner />}
          {t('create.submit')}
        </Button>
      </StickyActionBar>
      <TemporaryPasswordDialog
        password={created?.password ?? null}
        staffName={created?.fullName ?? ''}
        onClose={done}
      />
    </div>
  );
}
