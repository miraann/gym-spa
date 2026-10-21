import { localizedName } from '@gym/i18n';
import {
  CircleOffIcon,
  EyeIcon,
  KeyRoundIcon,
  LockIcon,
  MonitorSmartphoneIcon,
  UserPlusIcon,
} from 'lucide-react';
import { haptic } from '@gym/platform';
import { ListGroup, ListRow, ListRowIcon } from '@gym/ui/blocks/list-group';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { initials } from '@/lib/initials';
import { logError } from '@/lib/logger';
import { canUseBranch, pinBlocker, type DeviceAccount, type PasswordReason } from '../accounts';
import { useAuthController, useAuthState, useDeviceGym } from '../auth-context';
import { AuthLayout } from './auth-layout';
import { FormError } from './form-error';
import { PinPad } from './pin-pad';

/**
 * The gym's state, when it isn't the usual one: locked (nobody can use it) or read-only (look, but
 * add or change nothing). From the last check with the server.
 */
function GymStateNotice() {
  const { t } = useTranslation('auth');
  const gym = useDeviceGym();
  if (gym?.access === 'locked') {
    return (
      <Alert variant="destructive">
        <LockIcon />
        <AlertDescription>{t('errors.gym_locked')}</AlertDescription>
      </Alert>
    );
  }
  if (gym?.access === 'read_only') {
    return (
      <Alert>
        <EyeIcon />
        <AlertDescription>{t('errors.gym_read_only')}</AlertDescription>
      </Alert>
    );
  }
  return null;
}

/**
 * This device: its name and branch, or why nobody can work on it (not registered, deactivated, its
 * branch deactivated). From the last check with the server; the PIN asks the server again.
 */
function DeviceNotice() {
  const { t } = useTranslation('auth');
  const { language } = usePreferences();
  const { device } = useAuthState();
  if (!device) {
    return (
      <Alert>
        <MonitorSmartphoneIcon />
        <AlertDescription>{t('errors.device_not_registered')}</AlertDescription>
      </Alert>
    );
  }
  if (!device.isActive || !device.branch.isActive) {
    return (
      <Alert variant="destructive">
        <CircleOffIcon />
        <AlertDescription>
          {t(device.isActive ? 'errors.branch_inactive' : 'errors.device_inactive')}
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground" data-device={device.code}>
      <MonitorSmartphoneIcon className="size-4" aria-hidden="true" />
      {t('lock.device', { device: device.name, branch: localizedName(device.branch, language) })}
    </p>
  );
}

/** "Who's working?": the staff members who have logged in on this device. */
export function LockScreen({
  onPick,
  onOtherStaff,
}: {
  readonly onPick: (staffId: string) => void;
  readonly onOtherStaff: () => void;
}) {
  const { t } = useTranslation('auth');
  const { accounts, branchId } = useAuthState();

  return (
    <AuthLayout title={t('lock.title')} description={t('lock.description')}>
      <GymStateNotice />
      <DeviceNotice />
      <ListGroup>
        {accounts.map((account) => (
          <ListRow
            key={account.staffId}
            asChild
            className="min-h-16"
            title={account.fullName}
            description={<span dir="ltr">{account.username}</span>}
            leading={
              <span
                aria-hidden
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/12 font-bold text-primary"
              >
                {initials(account.fullName)}
              </span>
            }
            trailing={
              !canUseBranch(account, branchId) ? (
                <span className="text-xs">{t('lock.noBranchAccess')}</span>
              ) : (
                pinBlocker(account) && (
                  <span className="flex items-center gap-1 text-xs">
                    <KeyRoundIcon className="size-3.5" />
                    {t('lock.needsPassword')}
                  </span>
                )
              )
            }
          >
            <button
              type="button"
              onClick={() => {
                onPick(account.staffId);
              }}
            />
          </ListRow>
        ))}
      </ListGroup>
      <ListGroup footer={t('lock.otherStaffHint')}>
        <ListRow
          asChild
          title={t('lock.otherStaff')}
          leading={
            <ListRowIcon>
              <UserPlusIcon aria-hidden />
            </ListRowIcon>
          }
        >
          <button type="button" onClick={onOtherStaff} />
        </ListRow>
      </ListGroup>
    </AuthLayout>
  );
}

/** PIN unlock for one staff member; the server checks the PIN. */
export function PinScreen({
  account,
  onBack,
  onUsePassword,
}: {
  readonly account: DeviceAccount;
  readonly onBack: () => void;
  readonly onUsePassword: (username: string) => void;
}) {
  const { t } = useTranslation('auth');
  const controller = useAuthController();
  const { branchId } = useAuthState();
  const format = useFormat();
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState<number | null>(null);
  const [failure, setFailure] = useState<
    | 'network'
    | 'gym_locked'
    | 'device_not_registered'
    | 'device_inactive'
    | 'branch_inactive'
    | 'unexpected'
    | null
  >(null);
  const blocker: PasswordReason | null = pinBlocker(account);

  const submit = (pin: string) => {
    setBusy(true);
    setFailure(null);
    controller
      .unlock(account.staffId, pin)
      .then((result) => {
        setWrong(result.kind === 'wrong_pin' ? result.triesLeft : null);
        if (result.kind !== 'unlocked') haptic('error');
        if (
          result.kind === 'network' ||
          result.kind === 'gym_locked' ||
          result.kind === 'device_not_registered' ||
          result.kind === 'device_inactive' ||
          result.kind === 'branch_inactive'
        ) {
          setFailure(result.kind);
        }
      })
      .catch((error: unknown) => {
        logError(error, { area: 'auth', action: 'unlock' });
        setFailure('unexpected');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <AuthLayout
      title={account.fullName}
      description={blocker || !canUseBranch(account, branchId) ? undefined : t('pin.title')}
    >
      {!canUseBranch(account, branchId) ? (
        // A password login wouldn't help: only a manager can give them this branch.
        <FormError message={t('errors.no_branch_access')} />
      ) : blocker ? (
        <>
          <FormError message={t(`passwordRequired.${blocker}`)} />
          <Button
            onClick={() => {
              onUsePassword(account.username);
            }}
          >
            {t('passwordRequired.usePassword')}
          </Button>
        </>
      ) : (
        <>
          <PinPad label={t('pin.label')} busy={busy} onComplete={submit} />
          <FormError
            message={wrong === null ? null : t('pin.wrong', { count: format.number(wrong) })}
          />
          <FormError message={failure ? t(`errors.${failure}`) : null} />
        </>
      )}
      <Button variant="ghost" onClick={onBack}>
        {t('pin.back')}
      </Button>
    </AuthLayout>
  );
}
