import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CopyIcon, FileUpIcon } from 'lucide-react';
import { useRef, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@gym/ui/components/button';
import { Field, FieldGroup, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Spinner } from '@gym/ui/components/spinner';
import { Textarea } from '@gym/ui/components/textarea';
import { CopyableSecret } from '@gym/ui/blocks/copyable-secret';
import { AuthLayout } from '@/features/auth/screens/auth-layout';
import { FormError } from '@/features/auth/screens/form-error';
import { createOwner, fetchMachineCode, installLicense, ServerAdminError } from './server-admin';
import { SERVER_INFO_KEY } from './server-info';

// The server PC's first setup (step OF-d), in its own app: the license and activation from Click
// Group, then the gym's first Owner, whose temporary password is shown once. gym-server allows these
// without a login only while the gym has no staff (apps/server/src/access.ts).

type SetupErrorKey =
  | 'license_invalid'
  | 'license_other_gym'
  | 'license_older'
  | 'license_needed'
  | 'activation_invalid'
  | 'activation_other_gym'
  | 'activation_other_machine'
  | 'nothing_to_install'
  | 'owner_exists'
  | 'no_gym'
  | 'invalid_username'
  | 'invalid_name'
  | 'unexpected';

const SETUP_ERRORS: readonly SetupErrorKey[] = [
  'license_invalid',
  'license_other_gym',
  'license_older',
  'license_needed',
  'activation_invalid',
  'activation_other_gym',
  'activation_other_machine',
  'nothing_to_install',
  'owner_exists',
  'no_gym',
  'invalid_username',
  'invalid_name',
];

function setupError(error: unknown): SetupErrorKey {
  const key = error instanceof ServerAdminError ? error.key : 'unexpected';
  return SETUP_ERRORS.find((known) => known === key) ?? 'unexpected';
}

export function SetupScreen({ setup }: { readonly setup: 'license' | 'owner' }) {
  return setup === 'license' ? <LicenseSetup /> : <OwnerSetup />;
}

/** A code typed or pasted, or read from the .txt file the seller panel downloads. */
function CodeField({
  id,
  label,
  value,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const { t } = useTranslation('server');
  const file = useRef<HTMLInputElement>(null);
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        id={id}
        dir="ltr"
        rows={3}
        spellCheck={false}
        className="font-mono text-xs break-all"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <input
        ref={file}
        type="file"
        accept=".txt,text/plain"
        hidden
        onChange={(event) => {
          void event.target.files?.[0]?.text().then((text) => {
            onChange(text.trim());
          });
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => file.current?.click()}
      >
        <FileUpIcon data-icon="inline-start" />
        {t('setup.loadFile')}
      </Button>
    </Field>
  );
}

function LicenseSetup() {
  const { t } = useTranslation('server');
  const queryClient = useQueryClient();
  const machine = useQuery({ queryKey: ['server-machine-code'], queryFn: fetchMachineCode });
  const [license, setLicense] = useState('');
  const [activation, setActivation] = useState('');
  const [copied, setCopied] = useState(false);
  const install = useMutation({
    mutationFn: () =>
      installLicense({
        ...(license.trim() ? { license: license.trim() } : {}),
        ...(activation.trim() ? { activation: activation.trim() } : {}),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SERVER_INFO_KEY }),
  });
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    install.mutate();
  };

  return (
    <AuthLayout title={t('setup.licenseTitle')} description={t('setup.licenseDescription')}>
      <form noValidate onSubmit={submit}>
        <FieldGroup>
          <Field>
            <FieldLabel>{t('setup.machineCode')}</FieldLabel>
            <div className="flex items-center gap-2">
              <code
                dir="ltr"
                data-machine-code
                className="flex-1 rounded-xl bg-muted px-3 py-2 text-lg tracking-wider tabular-nums"
              >
                {machine.data ?? '…'}
              </code>
              <Button
                type="button"
                variant="outline"
                disabled={!machine.data}
                onClick={() => {
                  void navigator.clipboard.writeText(machine.data ?? '').then(() => {
                    setCopied(true);
                  });
                }}
              >
                <CopyIcon data-icon="inline-start" />
                {copied ? t('setup.copied') : t('setup.copy')}
              </Button>
            </div>
          </Field>
          <CodeField
            id="license-code"
            label={t('setup.licenseCode')}
            value={license}
            onChange={setLicense}
          />
          <CodeField
            id="activation-code"
            label={t('setup.activationCode')}
            value={activation}
            onChange={setActivation}
          />
          <FormError
            message={install.isError ? t(`setup.errors.${setupError(install.error)}`) : null}
          />
          <Button type="submit" disabled={install.isPending}>
            {install.isPending && <Spinner data-icon="inline-start" />}
            {t('setup.install')}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}

function OwnerSetup() {
  const { t } = useTranslation('server');
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const create = useMutation({ mutationFn: () => createOwner({ username, fullName }) });

  if (create.data) {
    const owner = create.data;
    return (
      <AuthLayout title={t('setup.passwordTitle')} description={t('setup.passwordHint')}>
        <FieldGroup>
          <CopyableSecret
            value={owner.temporaryPassword}
            texts={{
              label: t('setup.passwordLabel', { username: owner.username }),
              copy: t('setup.copy'),
              copied: t('setup.copied'),
              copyFailed: t('setup.copyFailed'),
              shownOnce: t('setup.passwordHint'),
            }}
          />
          <Button onClick={() => void queryClient.invalidateQueries({ queryKey: SERVER_INFO_KEY })}>
            {t('setup.toLogin')}
          </Button>
        </FieldGroup>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('setup.ownerTitle')} description={t('setup.ownerDescription')}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="owner-username">{t('setup.username')}</FieldLabel>
            <Input
              id="owner-username"
              dir="ltr"
              autoComplete="off"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="owner-full-name">{t('setup.fullName')}</FieldLabel>
            <Input
              id="owner-full-name"
              value={fullName}
              onChange={(event) => {
                setFullName(event.target.value);
              }}
            />
          </Field>
          <FormError
            message={create.isError ? t(`setup.errors.${setupError(create.error)}`) : null}
          />
          <Button type="submit" disabled={create.isPending || !username.trim() || !fullName.trim()}>
            {create.isPending && <Spinner data-icon="inline-start" />}
            {t('setup.create')}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}
