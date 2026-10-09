import { newPinProblem, PIN_LENGTH, type PinProblem } from '@gym/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useFormat } from '@/lib/format';
import { useAuthController } from '../auth-context';
import type { AuthStep } from '../auth-controller';
import { authErrorKey, type AuthErrorKey } from '../staff-api';
import { AuthLayout } from './auth-layout';
import { AuthErrorMessage, FormError } from './form-error';
import { PinPad } from './pin-pad';

/** Choosing a PIN: once, then again to confirm. Saved on the server for the staff member's devices. */
export function SetPinScreen({
  staffId,
  onStep,
}: {
  readonly staffId: string;
  readonly onStep: (step: AuthStep) => void;
}) {
  const { t } = useTranslation('auth');
  const format = useFormat();
  const controller = useAuthController();
  const [first, setFirst] = useState<string | null>(null);
  const [problem, setProblem] = useState<PinProblem | 'mismatch' | null>(null);
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [busy, setBusy] = useState(false);
  // Changing it gives a fresh, empty PIN pad after a refused PIN.
  const [round, setRound] = useState(0);
  const length = format.number(PIN_LENGTH);

  const choose = (pin: string) => {
    const found = newPinProblem(pin);
    setProblem(found);
    setError(null);
    if (found) setRound(round + 1);
    else setFirst(pin);
  };

  const confirm = (pin: string) => {
    if (pin !== first) {
      setFirst(null);
      setProblem('mismatch');
      setRound(round + 1);
      return;
    }
    setBusy(true);
    controller
      .setPin(staffId, pin)
      .then((step) => {
        toast.success(t('setPin.saved'));
        onStep(step);
      })
      .catch((thrown: unknown) => {
        setFirst(null);
        setRound(round + 1);
        setError(authErrorKey(thrown, 'set-pin'));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const problemMessage =
    problem === 'mismatch'
      ? t('setPin.mismatch')
      : problem
        ? t(`validation.${problem}`, { length })
        : null;

  return first === null ? (
    <AuthLayout title={t('setPin.title')} description={t('setPin.description', { length })}>
      <PinPad key={`choose-${String(round)}`} label={t('setPin.title')} onComplete={choose} />
      <FormError message={problemMessage} />
      <AuthErrorMessage error={error} />
    </AuthLayout>
  ) : (
    <AuthLayout title={t('setPin.confirmTitle')} description={t('setPin.confirmDescription')}>
      <PinPad key="confirm" label={t('setPin.confirmTitle')} busy={busy} onComplete={confirm} />
    </AuthLayout>
  );
}
