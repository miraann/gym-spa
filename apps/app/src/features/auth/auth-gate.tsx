import { useState, type ReactNode } from 'react';
import { useAuthController, useAuthState } from './auth-context';
import type { AuthStep } from './auth-controller';
import { ChangePasswordScreen } from './screens/change-password-screen';
import { ChooseBranchScreen } from './screens/choose-branch-screen';
import { LockScreen, PinScreen } from './screens/lock-screen';
import { LoginScreen } from './screens/login-screen';
import { SetPinScreen } from './screens/set-pin-screen';
import { StartupError } from './screens/startup-error';
import { useIdleLock } from './use-idle-lock';

type Screen =
  | { readonly kind: 'staff' }
  | { readonly kind: 'pin'; readonly staffId: string }
  | { readonly kind: 'login'; readonly username?: string }
  | Exclude<AuthStep, { kind: 'done' }>;

/**
 * Shows the app only to a staff member who unlocked it. Locking (idle, or "Lock" in the menu)
 * covers the app instead of closing it, so a half-filled form is still there after the PIN.
 * Logging out closes it.
 */
export function AuthGate({ children }: { readonly children: ReactNode }) {
  const controller = useAuthController();
  const { ready, failed, accounts, activeId } = useAuthState();
  const [screen, setScreen] = useState<Screen>({ kind: 'staff' });
  // Who last used the app. It stays mounted behind the lock screen until they log out.
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  useIdleLock();

  const locked = activeId === null;
  if (activeId !== null && openedFor !== activeId) setOpenedFor(activeId);
  if (locked && openedFor !== null && !accounts.some((each) => each.staffId === openedFor)) {
    setOpenedFor(null);
  }
  const opened = openedFor !== null;

  // Every lock starts at the staff list.
  const [wasLocked, setWasLocked] = useState(locked);
  if (locked !== wasLocked) {
    setWasLocked(locked);
    if (locked) setScreen({ kind: 'staff' });
  }

  if (failed) return <StartupError />;
  if (!ready) return null;

  const onStep = (step: AuthStep) => {
    // A step that finishes after someone already unlocked (a slow request) changes nothing.
    if (controller.getState().activeId !== null) return;
    setScreen(step.kind === 'done' ? { kind: 'staff' } : step);
  };
  const toStaffList =
    accounts.length > 0
      ? () => {
          setScreen({ kind: 'staff' });
        }
      : undefined;

  let lockScreen: ReactNode;
  switch (screen.kind) {
    case 'staff': {
      lockScreen =
        accounts.length > 0 ? (
          <LockScreen
            onPick={(staffId) => {
              setScreen({ kind: 'pin', staffId });
            }}
            onOtherStaff={() => {
              setScreen({ kind: 'login' });
            }}
          />
        ) : (
          <LoginScreen onStep={onStep} />
        );
      break;
    }
    case 'pin': {
      const account = accounts.find((each) => each.staffId === screen.staffId);
      lockScreen = account ? (
        <PinScreen
          account={account}
          onBack={() => {
            setScreen({ kind: 'staff' });
          }}
          onUsePassword={(username) => {
            setScreen({ kind: 'login', username });
          }}
        />
      ) : (
        <LoginScreen onStep={onStep} onBack={toStaffList} />
      );
      break;
    }
    case 'login':
      lockScreen = <LoginScreen username={screen.username} onBack={toStaffList} onStep={onStep} />;
      break;
    case 'change_password':
      lockScreen = <ChangePasswordScreen staffId={screen.staffId} onStep={onStep} />;
      break;
    case 'set_pin':
      lockScreen = <SetPinScreen staffId={screen.staffId} onStep={onStep} />;
      break;
    case 'choose_branch':
      lockScreen = (
        <ChooseBranchScreen staffId={screen.staffId} branches={screen.branches} onStep={onStep} />
      );
      break;
  }

  return (
    <>
      {opened && (
        // inert: while locked, nothing behind the lock screen can be reached or read out.
        <div inert={locked} aria-hidden={locked} className={locked ? 'hidden' : 'contents'}>
          {children}
        </div>
      )}
      {locked && lockScreen}
    </>
  );
}
