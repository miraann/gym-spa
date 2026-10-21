import type { CardByteOrder } from '@gym/core';
import { useSyncExternalStore } from 'react';

// This device's card reader settings (Settings → card reader). They belong to the reader plugged
// into the device, so they stay on the device and never sync. Only staff with devices.manage
// change them: a wrong byte order would give members cards under the wrong UID.

export interface CardReaderSettings {
  /** The order a keyboard-type reader types a UID's bytes in. Other readers always give normal. */
  readonly keyboardByteOrder: CardByteOrder;
}

export const CARD_READER_STORAGE_KEY = 'gym.card-reader';

export const DEFAULT_CARD_READER_SETTINGS: CardReaderSettings = { keyboardByteOrder: 'normal' };

/** Reads saved settings, falling back to the defaults for anything missing or invalid. */
export function parseCardReaderSettings(raw: string | null): CardReaderSettings {
  if (!raw) return DEFAULT_CARD_READER_SETTINGS;
  try {
    const saved: unknown = JSON.parse(raw);
    if (typeof saved === 'object' && saved !== null && 'keyboardByteOrder' in saved) {
      return { keyboardByteOrder: saved.keyboardByteOrder === 'reversed' ? 'reversed' : 'normal' };
    }
  } catch {
    // Not JSON: the defaults.
  }
  return DEFAULT_CARD_READER_SETTINGS;
}

function readStored(): CardReaderSettings {
  try {
    return parseCardReaderSettings(localStorage.getItem(CARD_READER_STORAGE_KEY));
  } catch {
    return DEFAULT_CARD_READER_SETTINGS;
  }
}

let current = readStored();
const listeners = new Set<() => void>();

export function getCardReaderSettings(): CardReaderSettings {
  return current;
}

export function setKeyboardByteOrder(order: CardByteOrder): void {
  if (current.keyboardByteOrder === order) return;
  current = { ...current, keyboardByteOrder: order };
  try {
    localStorage.setItem(CARD_READER_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage is blocked: the choice still applies until the app is closed.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCardReaderSettings(): CardReaderSettings {
  return useSyncExternalStore(subscribe, getCardReaderSettings);
}
