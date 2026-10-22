import { isCleanText, normalizeName } from '@gym/core';
import { LANGUAGE_CODES, LANGUAGES, localizedName, type Language } from '@gym/i18n';
import { ChoiceGroup } from '@gym/ui/blocks/choice-group';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { StickyActionBar } from '@gym/ui/blocks/sticky-action-bar';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Badge } from '@gym/ui/components/badge';
import { Button } from '@gym/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@gym/ui/components/empty';
import { Field, FieldError, FieldGroup, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Label } from '@gym/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@gym/ui/components/radio-group';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Spinner } from '@gym/ui/components/spinner';
import { useSideBySide } from '@gym/ui/hooks/use-side-by-side';
import { useParams } from '@tanstack/react-router';
import { CircleOffIcon, SearchXIcon, TriangleAlertIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuthState } from '@/features/auth/auth-context';
import { useAdminBranches } from '@/features/staff/admin-data';
import { adminErrorKey, type AdminErrorKey } from '@/features/staff/admin-errors';
import { AdminError, BackToList } from '@/features/staff/admin-error';
import { useAdminWriteState } from '@/features/staff/write-state';
import { WriteStateNotice } from '@/features/staff/write-state-notice';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { useUnsavedChanges } from '@/lib/unsaved-changes';
import {
  useDeviceOverview,
  useMoveDevice,
  useSaveDevice,
  useSetDeviceActive,
  type DeviceInfo,
} from './device-data';
import { PLATFORM_ICONS, useBranchName } from './device-labels';

/** The longest device name (devices.name). */
const DEVICE_NAME_MAX_LENGTH = 60;

/** /devices/$deviceId: one device. */
export function DevicePage() {
  const { t } = useTranslation('devices');
  const { deviceId } = useParams({ from: '/devices/$deviceId' });
  const devices = useDeviceOverview();
  const device = devices.data?.find((each) => each.id === deviceId);

  if (devices.isPending) return <Skeleton className="h-96 rounded-3xl" />;
  if (devices.isError) return <AdminError error={adminErrorKey(devices.error, 'devices')} />;
  if (!device) {
    return (
      <div className="flex flex-col gap-4">
        <BackToList to="/devices" label={t('list.back')} />
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
  return <DeviceDetail key={device.id} device={device} />;
}

function DeviceDetail({ device }: { readonly device: DeviceInfo }) {
  const { t } = useTranslation('devices');
  const format = useFormat();
  const branchName = useBranchName();
  const sideBySide = useSideBySide();
  const thisDevice = useAuthState().device?.id === device.id;
  const Icon = PLATFORM_ICONS[device.platform];
  const Heading = sideBySide ? 'h2' : 'h1';

  return (
    <div className="flex flex-col gap-4" data-device-detail={device.name}>
      <BackToList to="/devices" label={t('list.back')} />
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
        <Heading className="text-2xl">{device.name}</Heading>
        {thisDevice && <Badge variant="secondary">{t('list.thisDevice')}</Badge>}
        {!device.isActive && (
          <Badge variant="destructive">
            <CircleOffIcon aria-hidden="true" />
            {t('status.inactive')}
          </Badge>
        )}
      </div>

      <dl className="grid gap-3 rounded-2xl bg-card p-4 text-sm ring-1 ring-border sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">{t('detail.branch')}</dt>
          <dd>
            {branchName(device.branchId)}{' '}
            <span dir="ltr" className="font-mono text-muted-foreground">
              {device.code}
            </span>
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">{t('detail.platform')}</dt>
          <dd>{t(`platforms.${device.platform}`)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">{t('detail.registered')}</dt>
          <dd>{format.date(device.createdAt)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">{t('detail.lastSeen')}</dt>
          <dd>{device.lastSeenAt ? format.dateTime(device.lastSeenAt) : t('list.neverSeen')}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">{t('detail.lastUser')}</dt>
          <dd>{device.lastSeenByName ?? t('detail.none')}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">{t('detail.version')}</dt>
          <dd dir="ltr" className="text-start font-mono">
            {device.appVersion ?? t('detail.none')}
          </dd>
        </div>
      </dl>

      <WriteStateNotice area="devices" />
      <DeviceForm device={device} />
      {device.isActive && <MoveDevice device={device} thisDevice={thisDevice} />}
      <DeviceState device={device} thisDevice={thisDevice} />
    </div>
  );
}

/** The device's name and its language before anyone logs in. */
function DeviceForm({ device }: { readonly device: DeviceInfo }) {
  const { t } = useTranslation('devices');
  const id = useId();
  const save = useSaveDevice();
  const { online, readOnly } = useAdminWriteState();
  const [name, setName] = useState(device.name);
  const [language, setLanguage] = useState<Language | 'none'>(device.defaultLanguage ?? 'none');
  const [error, setError] = useState<AdminErrorKey | null>(null);
  const cleanName = normalizeName(name);
  const nameValid = isCleanText(cleanName, DEVICE_NAME_MAX_LENGTH);
  const dirty =
    cleanName !== device.name || (language === 'none' ? null : language) !== device.defaultLanguage;
  useUnsavedChanges(dirty);

  const submit = () => {
    if (!nameValid) return;
    setError(null);
    save.mutate(
      {
        deviceId: device.id,
        name: cleanName,
        defaultLanguage: language === 'none' ? null : language,
      },
      {
        onSuccess: () => {
          toast.success(t('detail.saved'));
        },
        onError: (thrown) => {
          setError(adminErrorKey(thrown, 'save_device'));
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3>{t('detail.settingsTitle')}</h3>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          id="device-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <FieldGroup>
            <Field data-invalid={!nameValid}>
              <FieldLabel htmlFor={`${id}-name`}>{t('detail.name')}</FieldLabel>
              <Input
                id={`${id}-name`}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
              {!nameValid && <FieldError>{t('detail.nameError')}</FieldError>}
            </Field>
            <section className="flex flex-col gap-2" aria-labelledby={`${id}-language`}>
              <div>
                <h4 id={`${id}-language`} className="text-sm">
                  {t('detail.language')}
                </h4>
                <p className="text-sm text-muted-foreground">{t('detail.languageHint')}</p>
              </div>
              <ChoiceGroup
                label={t('detail.language')}
                value={language}
                choices={[
                  { value: 'none' as const, label: t('detail.languageNone') },
                  ...LANGUAGE_CODES.map((code) => ({
                    value: code,
                    label: LANGUAGES[code].nativeName,
                    lang: code,
                  })),
                ]}
                onChange={setLanguage}
              />
            </section>
            <AdminError error={error} />
          </FieldGroup>
        </form>
        <StickyActionBar>
          <Button
            type="submit"
            form="device-form"
            size="lg"
            disabled={!online || readOnly || !dirty || !nameValid || save.isPending}
          >
            {save.isPending && <Spinner />}
            {t('detail.save')}
          </Button>
        </StickyActionBar>
      </CardContent>
    </Card>
  );
}

/** Moving the device to another active branch of the acting staff member. */
function MoveDevice({
  device,
  thisDevice,
}: {
  readonly device: DeviceInfo;
  readonly thisDevice: boolean;
}) {
  const { t } = useTranslation('devices');
  const { language } = usePreferences();
  const id = useId();
  const branches = useAdminBranches();
  const move = useMoveDevice();
  const { online, readOnly } = useAdminWriteState();
  const [target, setTarget] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<AdminErrorKey | null>(null);
  const others = (branches.data ?? []).filter(
    (branch) => branch.isActive && branch.id !== device.branchId,
  );
  const targetBranch = others.find((branch) => branch.id === target);

  if (branches.isSuccess && others.length === 0) return null;

  const confirm = () => {
    setError(null);
    move.mutate(
      { deviceId: device.id, branchId: target },
      {
        onSuccess: () => {
          setConfirming(false);
          setTarget('');
          toast.success(t('move.done'));
        },
        onError: (thrown) => {
          setError(adminErrorKey(thrown, 'move_device'));
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3>{t('move.title')}</h3>
        </CardTitle>
        <CardDescription>{t('move.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <RadioGroup
          aria-label={t('move.title')}
          value={target}
          onValueChange={setTarget}
          className="grid gap-2 sm:grid-cols-2"
        >
          {others.map((branch) => (
            <Label
              key={branch.id}
              htmlFor={`${id}-${branch.id}`}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-3 font-normal has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted"
            >
              <RadioGroupItem id={`${id}-${branch.id}`} value={branch.id} />
              <span className="flex-1">{localizedName(branch, language)}</span>
              <span dir="ltr" className="text-xs text-muted-foreground">
                {branch.code}
              </span>
            </Label>
          ))}
        </RadioGroup>
        <Button
          variant="outline"
          className="self-start"
          disabled={!online || readOnly || target === ''}
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
        >
          {t('move.submit')}
        </Button>
      </CardContent>
      <ResponsiveDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('move.confirmTitle', {
          device: device.name,
          branch: targetBranch ? localizedName(targetBranch, language) : '',
        })}
        description={t(thisDevice ? 'move.confirmThisDevice' : 'move.confirmDescription')}
        footer={
          <>
            <Button disabled={!online || move.isPending} onClick={confirm}>
              {move.isPending && <Spinner />}
              {t('move.submit')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setConfirming(false);
              }}
            >
              {t('detail.cancel')}
            </Button>
          </>
        }
      >
        <AdminError error={error} />
      </ResponsiveDialog>
    </Card>
  );
}

/** Deactivating (nobody can unlock on it; it frees its place in the limit) or reactivating. */
function DeviceState({
  device,
  thisDevice,
}: {
  readonly device: DeviceInfo;
  readonly thisDevice: boolean;
}) {
  const { t } = useTranslation('devices');
  const change = useSetDeviceActive();
  const { online, readOnly } = useAdminWriteState();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<AdminErrorKey | null>(null);
  const deactivating = device.isActive;

  const confirm = () => {
    setError(null);
    change.mutate(
      { deviceId: device.id, active: !deactivating },
      {
        onSuccess: () => {
          setConfirming(false);
          toast.success(
            t(deactivating ? 'state.deactivated' : 'state.reactivated', { name: device.name }),
          );
        },
        onError: (thrown) => {
          setError(adminErrorKey(thrown, deactivating ? 'deactivate_device' : 'reactivate_device'));
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3>{t('state.title')}</h3>
        </CardTitle>
        <CardDescription>
          {t(deactivating ? 'state.deactivateHint' : 'state.reactivateHint')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {deactivating && thisDevice && (
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertDescription>{t('state.thisDeviceWarning')}</AlertDescription>
          </Alert>
        )}
        <Button
          variant={deactivating ? 'destructive' : 'default'}
          className="self-start"
          // Deactivating takes access away, so a read-only gym can still do it.
          disabled={!online || (!deactivating && readOnly)}
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
        >
          {t(deactivating ? 'state.deactivate' : 'state.reactivate')}
        </Button>
      </CardContent>
      <ResponsiveDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t(deactivating ? 'state.deactivateTitle' : 'state.reactivateTitle', {
          name: device.name,
        })}
        description={t(
          deactivating ? 'state.deactivateDescription' : 'state.reactivateDescription',
        )}
        footer={
          <>
            <Button
              variant={deactivating ? 'destructive' : 'default'}
              disabled={!online || change.isPending}
              onClick={confirm}
            >
              {change.isPending && <Spinner />}
              {t(deactivating ? 'state.deactivate' : 'state.reactivate')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setConfirming(false);
              }}
            >
              {t('detail.cancel')}
            </Button>
          </>
        }
      >
        <AdminError error={error} />
      </ResponsiveDialog>
    </Card>
  );
}
