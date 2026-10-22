import { localizedName } from '@gym/i18n';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { StickyActionBar } from '@gym/ui/blocks/sticky-action-bar';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Badge } from '@gym/ui/components/badge';
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
import { CircleOffIcon, LockIcon, SearchXIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useActiveAccount } from '@/features/auth/auth-context';
import { adminErrorKey, type AdminErrorKey } from '@/features/staff/admin-errors';
import { AdminError, BackToList } from '@/features/staff/admin-error';
import { useAdminWriteState } from '@/features/staff/write-state';
import { WriteStateNotice } from '@/features/staff/write-state-notice';
import { usePreferences } from '@/lib/preferences';
import { useUnsavedChanges } from '@/lib/unsaved-changes';
import {
  branchSchema,
  useBranchDetails,
  useSaveBranch,
  useSetBranchActive,
  type BranchDetails,
  type BranchInput,
  type BranchValues,
} from './branch-data';

/** /branches/$branchId: one branch. */
export function BranchPage() {
  const { t } = useTranslation('branches');
  const { branchId } = useParams({ from: '/branches/$branchId' });
  const branches = useBranchDetails();
  const branch = branches.data?.find((each) => each.id === branchId);

  if (branches.isPending) return <Skeleton className="h-96 rounded-3xl" />;
  if (branches.isError) return <AdminError error={adminErrorKey(branches.error, 'branches')} />;
  if (!branch) {
    return (
      <div className="flex flex-col gap-4">
        <BackToList to="/branches" label={t('list.back')} />
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
  return <BranchEditor key={branch.id} branch={branch} />;
}

/** /branches/new: a new branch; the server gives it the next code. */
export function NewBranchPage() {
  return <BranchEditor branch={null} />;
}

function BranchEditor({ branch }: { readonly branch: BranchDetails | null }) {
  const { t } = useTranslation('branches');
  const { language } = usePreferences();
  const navigate = useNavigate();
  const account = useActiveAccount();
  const sideBySide = useSideBySide();
  const save = useSaveBranch();
  const { online, readOnly } = useAdminWriteState();
  const [error, setError] = useState<AdminErrorKey | null>(null);
  const [changingState, setChangingState] = useState(false);
  // Branches belong to the whole gym: adding and changing them needs access to all branches.
  const canChange = account?.allBranches === true;
  const Heading = sideBySide ? 'h2' : 'h1';

  const form = useForm<BranchInput, unknown, BranchValues>({
    resolver: zodResolver(branchSchema),
    defaultValues: {
      nameCkb: branch?.nameCkb ?? '',
      nameEn: branch?.nameEn ?? '',
      nameAr: branch?.nameAr ?? '',
      phone: branch?.phone ?? '',
      address: branch?.address ?? '',
    },
  });
  const { errors, isDirty } = form.formState;
  useUnsavedChanges(isDirty);

  const submit = form.handleSubmit((values) => {
    setError(null);
    save.mutate(
      { branchId: branch?.id ?? null, values },
      {
        onSuccess: (branchId) => {
          toast.success(t(branch ? 'detail.saved' : 'detail.created'));
          form.reset(values);
          if (!branch) void navigate({ to: '/branches/$branchId', params: { branchId } });
        },
        onError: (thrown) => {
          setError(adminErrorKey(thrown, 'save_branch'));
        },
      },
    );
  });

  const disabled = !canChange || !online || readOnly;

  return (
    <div className="flex flex-col gap-4" data-branch-editor={branch?.code ?? 'new'}>
      <BackToList to="/branches" label={t('list.back')} />
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Heading className="text-2xl">
            {branch ? localizedName(branch, language) : t('detail.newTitle')}
          </Heading>
          {branch && !branch.isActive && (
            <Badge variant="destructive">
              <CircleOffIcon aria-hidden="true" />
              {t('status.inactive')}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {branch ? (
            <span dir="ltr" className="font-mono">
              {branch.code}
            </span>
          ) : (
            t('detail.newDescription')
          )}
        </p>
      </div>
      {canChange ? (
        <WriteStateNotice area="roles" />
      ) : (
        <Alert>
          <LockIcon />
          <AlertDescription>{t('detail.allBranchesOnly')}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          <form id="branch-form" noValidate onSubmit={(event) => void submit(event)}>
            <FieldGroup>
              <Field data-invalid={Boolean(errors.nameCkb)}>
                <FieldLabel htmlFor="branch-name-ckb">{t('form.nameCkb')}</FieldLabel>
                <Input id="branch-name-ckb" disabled={disabled} {...form.register('nameCkb')} />
                {errors.nameCkb && <FieldError>{t('form.errors.nameRequired')}</FieldError>}
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={Boolean(errors.nameEn)}>
                  <FieldLabel htmlFor="branch-name-en">{t('form.nameEn')}</FieldLabel>
                  <Input
                    id="branch-name-en"
                    dir="ltr"
                    lang="en"
                    disabled={disabled}
                    {...form.register('nameEn')}
                  />
                  {errors.nameEn && <FieldError>{t('form.errors.name')}</FieldError>}
                </Field>
                <Field data-invalid={Boolean(errors.nameAr)}>
                  <FieldLabel htmlFor="branch-name-ar">{t('form.nameAr')}</FieldLabel>
                  <Input
                    id="branch-name-ar"
                    dir="rtl"
                    lang="ar"
                    disabled={disabled}
                    {...form.register('nameAr')}
                  />
                  {errors.nameAr && <FieldError>{t('form.errors.name')}</FieldError>}
                </Field>
              </div>
              <Field data-invalid={Boolean(errors.phone)}>
                <FieldLabel htmlFor="branch-phone">{t('form.phone')}</FieldLabel>
                <Input
                  id="branch-phone"
                  type="tel"
                  dir="ltr"
                  inputMode="tel"
                  disabled={disabled}
                  {...form.register('phone')}
                />
                {errors.phone && <FieldError>{t('form.errors.phone')}</FieldError>}
              </Field>
              <Field data-invalid={Boolean(errors.address)}>
                <FieldLabel htmlFor="branch-address">{t('form.address')}</FieldLabel>
                <Input id="branch-address" disabled={disabled} {...form.register('address')} />
                {errors.address && <FieldError>{t('form.errors.address')}</FieldError>}
              </Field>
              <AdminError error={error} />
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      {canChange && (
        <StickyActionBar>
          {branch && (
            <Button
              variant={branch.isActive ? 'outline' : 'secondary'}
              size="lg"
              disabled={!online || readOnly}
              onClick={() => {
                setChangingState(true);
              }}
            >
              {branch.isActive ? t('detail.deactivate') : t('detail.reactivate')}
            </Button>
          )}
          <Button
            type="submit"
            form="branch-form"
            size="lg"
            disabled={!online || readOnly || (branch !== null && !isDirty) || save.isPending}
          >
            {save.isPending && <Spinner />}
            {branch ? t('detail.save') : t('detail.create')}
          </Button>
        </StickyActionBar>
      )}

      {branch && (
        <BranchStateDialog branch={branch} open={changingState} onOpenChange={setChangingState} />
      )}
    </div>
  );
}

/** Deactivating (devices there stop working; the data stays) or reactivating a branch. */
function BranchStateDialog({
  branch,
  open,
  onOpenChange,
}: {
  readonly branch: BranchDetails;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('branches');
  const { language } = usePreferences();
  const change = useSetBranchActive();
  const { online } = useAdminWriteState();
  const [error, setError] = useState<AdminErrorKey | null>(null);
  const name = localizedName(branch, language);
  const deactivating = branch.isActive;

  const confirm = () => {
    setError(null);
    change.mutate(
      { branchId: branch.id, active: !deactivating },
      {
        onSuccess: () => {
          toast.success(t(deactivating ? 'detail.deactivated' : 'detail.reactivated', { name }));
          onOpenChange(false);
        },
        onError: (thrown) => {
          setError(adminErrorKey(thrown, deactivating ? 'deactivate_branch' : 'reactivate_branch'));
        },
      },
    );
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      title={t(deactivating ? 'detail.deactivateTitle' : 'detail.reactivateTitle', { name })}
      description={t(
        deactivating ? 'detail.deactivateDescription' : 'detail.reactivateDescription',
      )}
      footer={
        <>
          <Button
            variant={deactivating ? 'destructive' : 'default'}
            disabled={!online || change.isPending}
            onClick={confirm}
          >
            {change.isPending && <Spinner />}
            {t(deactivating ? 'detail.deactivate' : 'detail.reactivate')}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {t('detail.cancel')}
          </Button>
        </>
      }
    >
      <AdminError error={error} />
    </ResponsiveDialog>
  );
}
