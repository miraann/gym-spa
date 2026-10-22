import {
  BLOOD_TYPES,
  GENDERS,
  REFERRAL_SOURCES,
  formatMemberNumber,
  normalizeMemberPhone,
} from '@gym/core';
import { LANGUAGES, LANGUAGE_CODES, localizedName } from '@gym/i18n';
import { ChoiceGroup } from '@gym/ui/blocks/choice-group';
import { StickyActionBar } from '@gym/ui/blocks/sticky-action-bar';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Checkbox } from '@gym/ui/components/checkbox';
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
import { Textarea } from '@gym/ui/components/textarea';
import { useSideBySide } from '@gym/ui/hooks/use-side-by-side';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArchiveIcon, LockIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { RequirePermission } from '@/components/no-access';
import { useAuthState } from '@/features/auth/auth-context';
import { usePermission } from '@/features/auth/use-permissions';
import { useAdminBranches } from '@/features/staff/admin-data';
import { BackToList } from '@/features/staff/admin-error';
import { useAdminWriteState } from '@/features/staff/write-state';
import { WriteStateNotice } from '@/features/staff/write-state-notice';
import { usePreferences } from '@/lib/preferences';
import { useBaghdadToday } from '@/lib/use-today';
import { useUnsavedChanges } from '@/lib/unsaved-changes';
import {
  useCreateMember,
  useMember,
  useMemberHealth,
  useUpdateMember,
  type Member,
  type MemberHealth,
} from './member-data';
import { memberErrorKey, type MemberErrorKey } from './member-errors';
import { MemberError } from './member-error';
import { BirthDateField, DuplicateWarning, TagInput } from './member-fields';
import { PHOTO_HASH } from './member-photo';
import {
  emptyMemberForm,
  memberFormSchema,
  memberFormValues,
  type MemberFormValues,
  type MemberInput,
} from './member-form';
import { MemberNotFound } from './member-page';

/**
 * Health info in the form: written and read back (members.medical.view and members.edit), written
 * only (a receptionist adding a member: members.create), or not shown.
 */
type HealthMode = 'read_write' | 'write_only' | 'hidden';

/** Adding a member (members.create). The server gives the member number. */
export function NewMemberPage() {
  return (
    <RequirePermission permission="members.create">
      <NewMember />
    </RequirePermission>
  );
}

function NewMember() {
  const { t } = useTranslation('members');
  const navigate = useNavigate();
  const create = useCreateMember();
  const branches = useAdminBranches();
  const { branchId: deviceBranchId } = useAuthState();
  const canReadHealth = usePermission('members.medical.view');
  const canEdit = usePermission('members.edit');
  // Made once, so saving again after a lost answer saves the same member (member_exists).
  const [memberId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<MemberErrorKey | null>(null);

  if (branches.isPending) return <Skeleton className="h-96 rounded-3xl" />;
  const active = (branches.data ?? []).filter((branch) => branch.isActive);
  const branchId = active.some((branch) => branch.id === deviceBranchId)
    ? (deviceBranchId ?? '')
    : (active[0]?.id ?? '');

  const submit = (input: MemberInput) => {
    setError(null);
    create.mutate(
      { id: memberId, input },
      {
        onSuccess: (member) => {
          toast.success(
            t('create.done', {
              name: member.fullName,
              number: formatMemberNumber(member.memberNumber),
            }),
          );
          // #photo: the new member's page points staff to the photo first (member-photo.tsx).
          void navigate({
            to: '/members/$memberId',
            params: { memberId: member.id },
            search: (previous) => previous,
            hash: PHOTO_HASH,
          });
        },
        onError: (thrown) => {
          setError(memberErrorKey(thrown, 'create'));
        },
      },
    );
  };

  return (
    <MemberFormLayout title={t('create.title')} description={t('create.description')}>
      <MemberForm
        formId="new-member"
        defaultValues={emptyMemberForm(branchId)}
        healthMode={canReadHealth && canEdit ? 'read_write' : 'write_only'}
        submitLabel={t('create.submit')}
        pending={create.isPending}
        error={error}
        onSubmit={submit}
      />
    </MemberFormLayout>
  );
}

/** Changing a member's profile (members.edit); health info too with members.medical.view. */
export function EditMemberPage() {
  return (
    <RequirePermission permission="members.edit">
      <EditMember />
    </RequirePermission>
  );
}

function EditMember() {
  const { memberId } = useParams({ from: '/members/$memberId/edit' });
  const member = useMember(memberId);
  const canReadHealth = usePermission('members.medical.view');
  const health = useMemberHealth(memberId, canReadHealth);

  if (member.isPending || (canReadHealth && health.isPending)) {
    return <Skeleton className="h-96 rounded-3xl" />;
  }
  if (member.isError) return <MemberError error={memberErrorKey(member.error, 'load')} />;
  if (member.data === null) return <MemberNotFound />;
  if (canReadHealth && health.isError) {
    return <MemberError error={memberErrorKey(health.error, 'health')} />;
  }
  return (
    <EditMemberForm
      key={member.data.id}
      member={member.data}
      health={canReadHealth ? (health.data ?? null) : null}
      canEditHealth={canReadHealth}
    />
  );
}

function EditMemberForm({
  member,
  health,
  canEditHealth,
}: {
  readonly member: Member;
  readonly health: MemberHealth | null;
  readonly canEditHealth: boolean;
}) {
  const { t } = useTranslation('members');
  const navigate = useNavigate();
  const update = useUpdateMember();
  const [error, setError] = useState<MemberErrorKey | null>(null);
  const toProfile = () =>
    navigate({
      to: '/members/$memberId',
      params: { memberId: member.id },
      search: (previous) => previous,
    });

  if (member.status === 'archived') {
    return (
      <MemberFormLayout title={t('edit.title', { name: member.fullName })}>
        <Alert>
          <ArchiveIcon />
          <AlertDescription>{t('detail.archivedNotice')}</AlertDescription>
        </Alert>
      </MemberFormLayout>
    );
  }

  const submit = (input: MemberInput) => {
    setError(null);
    update.mutate(
      { id: member.id, input, saveHealth: canEditHealth },
      {
        onSuccess: () => {
          toast.success(t('edit.done'));
          void toProfile();
        },
        onError: (thrown) => {
          setError(memberErrorKey(thrown, 'update'));
        },
      },
    );
  };

  return (
    <MemberFormLayout title={t('edit.title', { name: member.fullName })}>
      <MemberForm
        formId="edit-member"
        memberId={member.id}
        defaultValues={memberFormValues(member, health)}
        currentBranchId={member.branchId}
        healthMode={canEditHealth ? 'read_write' : 'hidden'}
        hasHiddenHealth={!canEditHealth && member.hasHealthNotes}
        submitLabel={t('edit.submit')}
        pending={update.isPending}
        error={error}
        onSubmit={submit}
        cancel={
          <Button asChild variant="outline" size="lg">
            <Link
              to="/members/$memberId"
              params={{ memberId: member.id }}
              search={(previous) => previous}
            >
              {t('edit.cancel')}
            </Link>
          </Button>
        }
      />
    </MemberFormLayout>
  );
}

function MemberFormLayout({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: React.ReactNode;
}) {
  const { t } = useTranslation('members');
  const Heading = useSideBySide() ? 'h2' : 'h1';
  return (
    <div className="flex flex-col gap-4">
      <BackToList to="/members" label={t('list.back')} />
      <div className="space-y-1">
        <Heading className="text-xl">{title}</Heading>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <WriteStateNotice area="members" />
      {children}
    </div>
  );
}

/** The member form, for adding and for changing a member. */
function MemberForm({
  formId,
  memberId,
  defaultValues,
  currentBranchId,
  healthMode,
  hasHiddenHealth = false,
  submitLabel,
  pending,
  error,
  onSubmit,
  cancel,
}: {
  readonly formId: string;
  /** The member being changed (left out of the duplicates). */
  readonly memberId?: string;
  readonly defaultValues: MemberFormValues;
  /** The member's home branch, kept as a choice even if the staff member can't access it. */
  readonly currentBranchId?: string;
  readonly healthMode: HealthMode;
  readonly hasHiddenHealth?: boolean;
  readonly submitLabel: string;
  readonly pending: boolean;
  readonly error: MemberErrorKey | null;
  readonly onSubmit: (input: MemberInput) => void;
  readonly cancel?: React.ReactNode;
}) {
  const { t } = useTranslation('members');
  const { language } = usePreferences();
  const { online, readOnly } = useAdminWriteState();
  const branches = useAdminBranches();
  const today = useBaghdadToday();
  const schema = useMemo(() => memberFormSchema(today), [today]);
  const form = useForm<MemberFormValues, unknown, MemberInput>({
    resolver: zodResolver<MemberFormValues, unknown, MemberInput>(schema),
    defaultValues,
  });
  const { errors, isDirty } = form.formState;
  useUnsavedChanges(isDirty);
  const [fullName, phone, noOwnPhone] = useWatch({
    control: form.control,
    name: ['fullName', 'phone', 'noOwnPhone'],
  });
  const fieldError = (message: string | undefined) =>
    message === undefined ? undefined : t(`form.errors.${errorMessageKey(message)}`);

  const branchChoices = (branches.data ?? []).filter(
    (branch) => branch.isActive || branch.id === currentBranchId,
  );
  const currentBranchHidden =
    currentBranchId !== undefined && !branchChoices.some((branch) => branch.id === currentBranchId);

  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
    >
      <Card>
        <CardHeader>
          <CardTitle>
            <h3>{t('form.main')}</h3>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={Boolean(errors.fullName)}>
              <FieldLabel htmlFor={`${formId}-name`}>{t('form.fullName')}</FieldLabel>
              <Input id={`${formId}-name`} autoComplete="off" {...form.register('fullName')} />
              <FieldDescription>{t('form.fullNameHint')}</FieldDescription>
              {errors.fullName && <FieldError>{fieldError(errors.fullName.message)}</FieldError>}
            </Field>
            <Field>
              <FieldLabel id={`${formId}-gender`}>{t('form.gender')}</FieldLabel>
              <Controller
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <ChoiceGroup
                    label={t('form.gender')}
                    value={field.value}
                    choices={GENDERS.map((gender) => ({
                      value: gender,
                      label: t(`gender.${gender}`),
                    }))}
                    onChange={field.onChange}
                  />
                )}
              />
            </Field>
            <Field data-invalid={Boolean(errors.phone)}>
              <FieldLabel htmlFor={`${formId}-phone`}>{t('form.phone')}</FieldLabel>
              <Input
                id={`${formId}-phone`}
                type="tel"
                dir="ltr"
                inputMode="tel"
                autoComplete="off"
                placeholder="0750 123 4567"
                disabled={noOwnPhone}
                aria-invalid={Boolean(errors.phone)}
                {...form.register('phone')}
              />
              <FieldDescription>{t('form.phoneHint')}</FieldDescription>
              {errors.phone && <FieldError>{fieldError(errors.phone.message)}</FieldError>}
            </Field>
            <Controller
              control={form.control}
              name="noOwnPhone"
              render={({ field }) => (
                <div className="flex items-center gap-3">
                  <Checkbox
                    id={`${formId}-no-phone`}
                    checked={field.value}
                    onCheckedChange={(checked) => {
                      field.onChange(checked === true);
                      if (checked === true) form.setValue('phone', '');
                    }}
                  />
                  <Label htmlFor={`${formId}-no-phone`} className="font-normal">
                    {t('form.noOwnPhone')}
                  </Label>
                </div>
              )}
            />
            <DuplicateWarning
              fullName={fullName}
              phone={noOwnPhone ? null : normalizeMemberPhone(phone)}
              excludeId={memberId}
            />
            <Field data-invalid={Boolean(errors.branchId)}>
              <FieldLabel htmlFor={`${formId}-branch`}>{t('form.branch')}</FieldLabel>
              {branches.isPending ? (
                <Skeleton className="h-11 rounded-xl" />
              ) : (
                <NativeSelect id={`${formId}-branch`} {...form.register('branchId')}>
                  {currentBranchHidden && (
                    <NativeSelectOption value={currentBranchId}>
                      {t('list.otherBranch')}
                    </NativeSelectOption>
                  )}
                  {branchChoices.map((branch) => (
                    <NativeSelectOption key={branch.id} value={branch.id}>
                      {localizedName(branch, language)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
              {errors.branchId && <FieldError>{fieldError(errors.branchId.message)}</FieldError>}
            </Field>
            <Controller
              control={form.control}
              name="birthDate"
              render={({ field }) => (
                <BirthDateField
                  value={field.value}
                  onChange={field.onChange}
                  error={fieldError(errors.birthDate?.message)}
                />
              )}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h3>{t('form.emergency')}</h3>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {noOwnPhone && (
              <p className="text-sm text-muted-foreground" data-testid="emergency-required">
                {t('form.emergencyHint')}
              </p>
            )}
            <Field data-invalid={Boolean(errors.emergencyContactName)}>
              <FieldLabel htmlFor={`${formId}-emergency-name`}>
                {t('form.emergencyName')}
              </FieldLabel>
              <Input
                id={`${formId}-emergency-name`}
                autoComplete="off"
                {...form.register('emergencyContactName')}
              />
              {errors.emergencyContactName && (
                <FieldError>{fieldError(errors.emergencyContactName.message)}</FieldError>
              )}
            </Field>
            <Field data-invalid={Boolean(errors.emergencyPhone)}>
              <FieldLabel htmlFor={`${formId}-emergency-phone`}>
                {t('form.emergencyPhone')}
              </FieldLabel>
              <Input
                id={`${formId}-emergency-phone`}
                type="tel"
                dir="ltr"
                inputMode="tel"
                autoComplete="off"
                placeholder="0770 123 4567"
                aria-invalid={Boolean(errors.emergencyPhone)}
                {...form.register('emergencyPhone')}
              />
              {errors.emergencyPhone && (
                <FieldError>{fieldError(errors.emergencyPhone.message)}</FieldError>
              )}
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h3>{t('form.more')}</h3>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel>{t('form.language')}</FieldLabel>
              <Controller
                control={form.control}
                name="preferredLanguage"
                render={({ field }) => (
                  <ChoiceGroup
                    label={t('form.language')}
                    value={field.value}
                    choices={LANGUAGE_CODES.map((code) => ({
                      value: code,
                      label: LANGUAGES[code].nativeName,
                      lang: code,
                    }))}
                    onChange={field.onChange}
                  />
                )}
              />
            </Field>
            <Field data-invalid={Boolean(errors.address)}>
              <FieldLabel htmlFor={`${formId}-address`}>{t('form.address')}</FieldLabel>
              <Input id={`${formId}-address`} autoComplete="off" {...form.register('address')} />
              {errors.address && <FieldError>{fieldError(errors.address.message)}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor={`${formId}-referral`}>{t('form.referral')}</FieldLabel>
              <NativeSelect id={`${formId}-referral`} {...form.register('referralSource')}>
                <NativeSelectOption value="">{t('form.referralNone')}</NativeSelectOption>
                {REFERRAL_SOURCES.map((source) => (
                  <NativeSelectOption key={source} value={source}>
                    {t(`referral.${source}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field data-invalid={Boolean(errors.goals)}>
              <FieldLabel htmlFor={`${formId}-goals`}>{t('form.goals')}</FieldLabel>
              <Textarea id={`${formId}-goals`} {...form.register('goals')} />
              {errors.goals && <FieldError>{fieldError(errors.goals.message)}</FieldError>}
            </Field>
            <Field data-invalid={Boolean(errors.notes)}>
              <FieldLabel htmlFor={`${formId}-notes`}>{t('form.notes')}</FieldLabel>
              <Textarea id={`${formId}-notes`} {...form.register('notes')} />
              <FieldDescription>{t('form.notesHint')}</FieldDescription>
              {errors.notes && <FieldError>{fieldError(errors.notes.message)}</FieldError>}
            </Field>
            <Controller
              control={form.control}
              name="tags"
              render={({ field }) => (
                <TagInput
                  value={field.value}
                  onChange={field.onChange}
                  error={fieldError(errors.tags?.message)}
                />
              )}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      {healthMode !== 'hidden' ? (
        <Card data-testid="member-health-form">
          <CardHeader>
            <CardTitle>
              <h3>{t('form.health')}</h3>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Alert>
                <LockIcon />
                <AlertDescription>
                  {healthMode === 'write_only' ? t('form.healthPrivate') : t('form.healthShared')}
                </AlertDescription>
              </Alert>
              <Field>
                <FieldLabel htmlFor={`${formId}-blood`}>{t('form.bloodType')}</FieldLabel>
                <NativeSelect id={`${formId}-blood`} {...form.register('bloodType')}>
                  <NativeSelectOption value="">{t('form.bloodTypeUnknown')}</NativeSelectOption>
                  {BLOOD_TYPES.map((type) => (
                    <NativeSelectOption key={type} value={type}>
                      {type}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field data-invalid={Boolean(errors.medicalNotes)}>
                <FieldLabel htmlFor={`${formId}-medical`}>{t('form.medicalNotes')}</FieldLabel>
                <Textarea id={`${formId}-medical`} {...form.register('medicalNotes')} />
                <FieldDescription>{t('form.medicalNotesHint')}</FieldDescription>
                {errors.medicalNotes && (
                  <FieldError>{fieldError(errors.medicalNotes.message)}</FieldError>
                )}
              </Field>
              <Field data-invalid={Boolean(errors.injuries)}>
                <FieldLabel htmlFor={`${formId}-injuries`}>{t('form.injuries')}</FieldLabel>
                <Textarea id={`${formId}-injuries`} {...form.register('injuries')} />
                {errors.injuries && <FieldError>{fieldError(errors.injuries.message)}</FieldError>}
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      ) : (
        hasHiddenHealth && (
          <Alert>
            <LockIcon />
            <AlertDescription>{t('detail.healthHidden')}</AlertDescription>
          </Alert>
        )
      )}

      <MemberError error={error} />
      <StickyActionBar>
        <Button type="submit" form={formId} size="lg" disabled={!online || readOnly || pending}>
          {pending && <Spinner />}
          {submitLabel}
        </Button>
        {cancel}
      </StickyActionBar>
    </form>
  );
}

const FORM_ERROR_KEYS = [
  'fullName',
  'phone',
  'phoneRequired',
  'emergencyPhone',
  'birthDate',
  'branch',
  'text',
  'tag',
  'tags',
] as const;

/** A schema message as a key of members:form.errors (zod's own messages fall back to text). */
function errorMessageKey(message: string): (typeof FORM_ERROR_KEYS)[number] {
  return FORM_ERROR_KEYS.find((key) => key === message) ?? 'text';
}
