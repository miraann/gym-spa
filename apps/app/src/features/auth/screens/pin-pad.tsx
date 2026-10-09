import { normalizePin, PIN_LENGTH } from '@gym/core';
import { localizeDigits } from '@gym/i18n';
import { DeleteIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { usePreferences } from '@/lib/preferences';
import { cn } from '@/lib/utils';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

/**
 * Six-digit PIN entry: a hidden-text field for keyboards (also Kurdish/Arabic digits) and a number
 * pad for touch screens. Calls onComplete once all digits are in.
 */
export function PinPad({
  label,
  busy,
  disabled,
  onComplete,
}: {
  readonly label: string;
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly onComplete: (pin: string) => void;
}) {
  const { t } = useTranslation('auth');
  const { digits } = usePreferences();
  const [pin, setPin] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const locked = Boolean(busy) || Boolean(disabled);

  // Clears the digits after each attempt, when the parent re-enables the pad.
  const [wasLocked, setWasLocked] = useState(locked);
  if (locked !== wasLocked) {
    setWasLocked(locked);
    if (!locked) setPin('');
  }
  useEffect(() => {
    if (!locked) input.current?.focus();
  }, [locked]);

  const update = (next: string) => {
    if (locked) return;
    const value = normalizePin(next).replace(/\D/g, '').slice(0, PIN_LENGTH);
    setPin(value);
    if (value.length === PIN_LENGTH) onComplete(value);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <label className="flex flex-col items-center gap-3">
        <span className="sr-only">{label}</span>
        <input
          ref={input}
          // Not type=number: it drops leading zeros. Masked like a password, Latin digits, LTR.
          type="password"
          inputMode="numeric"
          autoComplete="off"
          dir="ltr"
          maxLength={PIN_LENGTH * 2}
          value={pin}
          disabled={locked}
          aria-label={label}
          onChange={(event) => {
            update(event.target.value);
          }}
          className="sr-only"
          // The PIN is the only thing on this screen.
          autoFocus
        />
        <span aria-hidden dir="ltr" className="flex gap-3" onClick={() => input.current?.focus()}>
          {Array.from({ length: PIN_LENGTH }, (_, index) => (
            <span
              key={index}
              className={cn(
                'size-3.5 rounded-full border-2 border-primary transition-colors',
                index < pin.length && 'bg-primary',
              )}
            />
          ))}
        </span>
      </label>

      <div role="group" aria-label={t('pin.keypad')} dir="ltr" className="grid grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <PadKey
            key={key}
            label={localizeDigits(key, digits)}
            disabled={locked}
            onPress={() => {
              update(pin + key);
            }}
          />
        ))}
        <span aria-hidden />
        <PadKey
          label={localizeDigits('0', digits)}
          disabled={locked}
          onPress={() => {
            update(pin + '0');
          }}
        />
        <Button
          type="button"
          variant="ghost"
          className="size-16 rounded-full"
          disabled={locked || pin.length === 0}
          aria-label={t('pin.delete')}
          onClick={() => {
            setPin(pin.slice(0, -1));
            input.current?.focus();
          }}
        >
          <DeleteIcon className="size-5" />
        </Button>
      </div>
      {busy && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          {t('pin.checking')}
        </p>
      )}
    </div>
  );
}

function PadKey({
  label,
  disabled,
  onPress,
}: {
  readonly label: string;
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="size-16 rounded-full text-xl"
      disabled={disabled}
      onClick={onPress}
    >
      {label}
    </Button>
  );
}
