import { Button } from '@gym/ui/components/button';
import { Spinner } from '@gym/ui/components/spinner';
import { useNavigate } from '@tanstack/react-router';
import { LogOutIcon, NfcIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RequirePermission } from '@/components/no-access';
import { useGymName } from '@/components/layout/use-gym-name';
import { useAuthController } from '@/features/auth/auth-context';
import { usePauseIdleLock } from '@/features/auth/use-idle-lock';
import { useFormat } from '@/lib/format';
import { useCheckinBranch } from './checkin-branch';
import { CheckinError } from './checkin-error';
import { CheckinResultView } from './checkin-result';
import { ScreenOverlay } from './screen-overlay';
import { useCheckinFlow } from './use-checkin-flow';

/** /checkin/door (checkin.perform): the door screen, where members hold their own card. */
export function DoorScreenPage() {
  return (
    <RequirePermission permission="checkin.perform">
      <DoorScreen />
    </RequirePermission>
  );
}

/**
 * The door screen (spec §6): dark while it waits, over the whole app, readable from two meters.
 * It stands unattended, so the idle lock waits while it is open, and leaving it locks the app:
 * nobody walks from the door into the app without a PIN. Nothing here is for staff (no overrides,
 * no search).
 */
function DoorScreen() {
  const { t } = useTranslation('checkin');
  const navigate = useNavigate();
  const controller = useAuthController();
  const gymName = useGymName();
  const { branchId } = useCheckinBranch();
  const flow = useCheckinFlow(branchId);
  usePauseIdleLock();

  const exit = () => {
    void navigate({ to: '/checkin' }).then(() => {
      controller.lock();
    });
  };

  return (
    <ScreenOverlay>
      <div
        className="dark fixed inset-0 z-50 flex flex-col bg-background text-foreground"
        data-testid="door-screen"
      >
        <div className="flex items-center justify-between gap-4 p-4">
          <p className="text-xl text-muted-foreground">{gymName}</p>
          <Button
            variant="ghost"
            className="h-12 text-muted-foreground"
            onClick={exit}
            title={t('kiosk.exitHint')}
          >
            <LogOutIcon />
            {t('kiosk.exit')}
          </Button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-8 p-6 text-center">
          {flow.pending ? (
            <Spinner className="size-32 text-primary" />
          ) : (
            <NfcIcon aria-hidden className="size-32 text-primary motion-safe:animate-pulse" />
          )}
          <p className="text-5xl">{t('kiosk.hold')}</p>
          <Clock />
          <div className="w-full max-w-xl">
            <CheckinError error={flow.error} />
          </div>
        </div>
        {flow.answer && <CheckinResultView answer={flow.answer} onClose={flow.close} door />}
      </div>
    </ScreenOverlay>
  );
}

/** The time now, large and calm. */
function Clock() {
  const format = useFormat();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 15_000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return <p className="text-3xl text-muted-foreground tabular-nums">{format.time(now)}</p>;
}
