import { rolePermissionsToSave, type PermissionKey } from '@gym/core';
import { localizedName } from '@gym/i18n';
import { Chip, ChipRow } from '@gym/ui/blocks/chip-row';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { StickyActionBar } from '@gym/ui/blocks/sticky-action-bar';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { Card, CardContent } from '@gym/ui/components/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@gym/ui/components/empty';
import { Field, FieldError, FieldGroup, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Spinner } from '@gym/ui/components/spinner';
import { useSideBySide } from '@gym/ui/hooks/use-side-by-side';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from '@tanstack/react-router';
import { LockIcon, SearchXIcon, Trash2Icon, UsersIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';
import { usePermissions } from '@/features/auth/use-permissions';
import {
  useDeleteRole,
  useRoleOverview,
  useSaveRole,
  type RoleInfo,
} from '@/features/staff/admin-data';
import { adminErrorKey, type AdminErrorKey } from '@/features/staff/admin-errors';
import { AdminError, BackToList } from '@/features/staff/admin-error';
import { roleNamesSchema, type RoleNamesInput } from '@/features/staff/staff-form';
import { useAdminWriteState } from '@/features/staff/write-state';
import { WriteStateNotice } from '@/features/staff/write-state-notice';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { useUnsavedChanges } from '@/lib/unsaved-changes';
import { PermissionTable } from './permission-table';

/** /roles/$roleId: one role. */
export function RolePage() {
  const { t } = useTranslation('staff');
  const { roleId } = useParams({ from: '/roles/$roleId' });
  const roles = useRoleOverview();
  const role = roles.data?.find((each) => each.id === roleId);

  if (roles.isPending) return <Skeleton className="h-96 rounded-3xl" />;
  if (roles.isError) return <AdminError error={adminErrorKey(roles.error, 'roles')} />;
  if (!role) {
    return (
      <div className="flex flex-col gap-4">
        <BackToList to="/roles" label={t('roles.back')} />
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyDescription>{t('roles.notFound')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }
  return <RoleEditor key={role.id} role={role} roles={roles.data} />;
}

/** /roles/new: a custom role, maybe starting from another role's permissions. */
export function NewRolePage() {
  const roles = useRoleOverview();
  if (roles.isPending) return <Skeleton className="h-96 rounded-3xl" />;
  if (roles.isError) return <AdminError error={adminErrorKey(roles.error, 'roles')} />;
  return <RoleEditor role={null} roles={roles.data} />;
}

/** Why a role's permissions can't change here; null when they can. */
function lockedReason(
  role: RoleInfo | null,
): 'owner' | 'ownRole' | 'builtIn' | 'notCovered' | null {
  if (role === null || role.canEditPermissions) return null;
  if (role.key === 'owner') return 'owner';
  if (role.isOwnRole) return 'ownRole';
  if (role.isSystem && !role.canEdit) return 'builtIn';
  return 'notCovered';
}

function RoleEditor({
  role,
  roles,
}: {
  readonly role: RoleInfo | null;
  readonly roles: readonly RoleInfo[];
}) {
  const { t } = useTranslation('staff');
  const { language } = usePreferences();
  const format = useFormat();
  const navigate = useNavigate();
  const myPermissions = usePermissions();
  const sideBySide = useSideBySide();
  const save = useSaveRole();
  const { online, readOnly } = useAdminWriteState();
  const [newId] = useState(() => crypto.randomUUID());
  const [selected, setSelected] = useState<Set<string>>(() => new Set(role?.permissionKeys ?? []));
  const [startFrom, setStartFrom] = useState<string | null>(null);
  const [permissionsChanged, setPermissionsChanged] = useState(false);
  const [error, setError] = useState<AdminErrorKey | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canEditNames = role === null || role.canEdit;
  const canEditPermissions = role === null || role.canEditPermissions;
  const reason = lockedReason(role);
  const Heading = sideBySide ? 'h2' : 'h1';

  const form = useForm<RoleNamesInput, unknown, z.output<typeof roleNamesSchema>>({
    resolver: zodResolver(roleNamesSchema),
    defaultValues: {
      nameCkb: role?.nameCkb ?? '',
      nameEn: role?.nameEn ?? '',
      nameAr: role?.nameAr ?? '',
    },
  });
  const { errors, isDirty } = form.formState;
  const dirty = role === null || isDirty || permissionsChanged;
  useUnsavedChanges(isDirty || permissionsChanged);
  const canSave = online && !readOnly && canEditNames && dirty && !save.isPending;

  const submit = form.handleSubmit((names) => {
    setError(null);
    const roleId = role?.id ?? newId;
    save.mutate(
      {
        roleId,
        draft: {
          ...names,
          nameEn: names.nameEn === '' ? null : names.nameEn,
          nameAr: names.nameAr === '' ? null : names.nameAr,
          permissionKeys: canEditPermissions
            ? rolePermissionsToSave(selected, role?.permissionKeys ?? [])
            : null,
        },
      },
      {
        onSuccess: () => {
          toast.success(t('roles.saved'));
          form.reset(names);
          setPermissionsChanged(false);
          if (role === null) void navigate({ to: '/roles/$roleId', params: { roleId } });
        },
        onError: (thrown) => {
          setError(adminErrorKey(thrown, 'save_role'));
        },
      },
    );
  });

  const chooseStart = (source: RoleInfo | null) => {
    setStartFrom(source?.id ?? null);
    // Only permissions the acting staff member has can be given; the rest are left out.
    setSelected(new Set((source?.permissionKeys ?? []).filter((key) => myPermissions.has(key))));
  };

  return (
    <div className="flex flex-col gap-4" data-role-editor={role?.key ?? role?.nameCkb ?? 'new'}>
      <BackToList to="/roles" label={t('roles.back')} />
      <div className="space-y-1">
        <Heading className="text-2xl">
          {role ? localizedName(role, language) : t('roles.newTitle')}
        </Heading>
        {role ? (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <UsersIcon className="size-4" aria-hidden="true" />
            {t('roles.staffCount', { number: format.number(role.staffCount) })}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{t('roles.newDescription')}</p>
        )}
      </div>
      <WriteStateNotice area="roles" />
      {reason && (
        <Alert>
          <LockIcon />
          <AlertDescription>{t(`roles.locked.${reason}`)}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="flex flex-col gap-6">
          <form id="role-form" noValidate onSubmit={(event) => void submit(event)}>
            <FieldGroup className="sm:grid sm:grid-cols-3">
              <Field data-invalid={Boolean(errors.nameCkb)}>
                <FieldLabel htmlFor="role-name-ckb">{t('roles.nameCkb')}</FieldLabel>
                <Input id="role-name-ckb" disabled={!canEditNames} {...form.register('nameCkb')} />
                {errors.nameCkb && <FieldError>{t('form.errors.roleNameRequired')}</FieldError>}
              </Field>
              <Field data-invalid={Boolean(errors.nameEn)}>
                <FieldLabel htmlFor="role-name-en">{t('roles.nameEn')}</FieldLabel>
                <Input
                  id="role-name-en"
                  dir="ltr"
                  lang="en"
                  disabled={!canEditNames}
                  {...form.register('nameEn')}
                />
                {errors.nameEn && <FieldError>{t('form.errors.roleName')}</FieldError>}
              </Field>
              <Field data-invalid={Boolean(errors.nameAr)}>
                <FieldLabel htmlFor="role-name-ar">{t('roles.nameAr')}</FieldLabel>
                <Input
                  id="role-name-ar"
                  dir="rtl"
                  lang="ar"
                  disabled={!canEditNames}
                  {...form.register('nameAr')}
                />
                {errors.nameAr && <FieldError>{t('form.errors.roleName')}</FieldError>}
              </Field>
            </FieldGroup>
          </form>

          {role === null && (
            <ChipRow label={t('roles.startFrom')}>
              <Chip
                selected={startFrom === null}
                aria-pressed={startFrom === null}
                onClick={() => {
                  chooseStart(null);
                }}
              >
                {t('roles.startEmpty')}
              </Chip>
              {roles
                .filter((each) => each.key !== 'owner')
                .map((each) => (
                  <Chip
                    key={each.id}
                    selected={startFrom === each.id}
                    aria-pressed={startFrom === each.id}
                    onClick={() => {
                      chooseStart(each);
                    }}
                  >
                    {localizedName(each, language)}
                  </Chip>
                ))}
            </ChipRow>
          )}

          <PermissionTable
            selected={selected}
            editable={canEditPermissions && online && !readOnly}
            canGive={(key: PermissionKey) => myPermissions.has(key)}
            onChange={(next) => {
              setSelected(next);
              setPermissionsChanged(true);
            }}
          />
          <AdminError error={error} />
        </CardContent>
      </Card>

      <StickyActionBar>
        {role && !role.isSystem && role.canEdit && (
          <Button
            variant="outline"
            size="lg"
            disabled={!online || readOnly}
            onClick={() => {
              setDeleting(true);
            }}
          >
            <Trash2Icon data-icon="inline-start" />
            {t('roles.delete')}
          </Button>
        )}
        {canEditNames && (
          <Button type="submit" form="role-form" size="lg" disabled={!canSave}>
            {save.isPending && <Spinner />}
            {role === null ? t('roles.create') : t('roles.save')}
          </Button>
        )}
      </StickyActionBar>

      {role && <DeleteRoleDialog role={role} open={deleting} onOpenChange={setDeleting} />}
    </div>
  );
}

function DeleteRoleDialog({
  role,
  open,
  onOpenChange,
}: {
  readonly role: RoleInfo;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('staff');
  const { language } = usePreferences();
  const navigate = useNavigate();
  const remove = useDeleteRole();
  const { online } = useAdminWriteState();
  const [error, setError] = useState<AdminErrorKey | null>(null);
  const name = localizedName(role, language);
  // The server refuses too (role_in_use); this says so before anyone tries.
  const inUse = role.staffCount > 0;

  const confirm = () => {
    setError(null);
    remove.mutate(role.id, {
      onSuccess: () => {
        toast.success(t('roles.deleted', { name }));
        onOpenChange(false);
        void navigate({ to: '/roles' });
      },
      onError: (thrown) => {
        setError(adminErrorKey(thrown, 'delete_role'));
      },
    });
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      title={t('roles.deleteTitle', { name })}
      description={inUse ? t('errors.role_in_use') : t('roles.deleteDescription')}
      footer={
        <>
          <Button
            variant="destructive"
            disabled={inUse || !online || remove.isPending}
            onClick={confirm}
          >
            {remove.isPending && <Spinner />}
            {t('roles.delete')}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {t('actions.cancel')}
          </Button>
        </>
      }
    >
      <AdminError error={error} />
    </ResponsiveDialog>
  );
}
