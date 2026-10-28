import { useSyncExternalStore } from 'react';

// This device's receipt printer (Settings → printer, step 8f): in the Windows app a printer can be
// chosen, and receipts and cash register reports then print to it without the print dialog. It
// belongs to the printer plugged into the device, so it stays on the device and never syncs.

export interface ReceiptPrinter {
  /** The printer's name as Windows gives it; none: the print dialog decides. */
  readonly name: string | null;
  /** Print to it without asking. */
  readonly silent: boolean;
}

export const RECEIPT_PRINTER_STORAGE_KEY = 'gym.receipt-printer';

export const DEFAULT_RECEIPT_PRINTER: ReceiptPrinter = { name: null, silent: false };

/** Reads the saved choice, falling back to the default for anything missing or invalid. */
export function parseReceiptPrinter(raw: string | null): ReceiptPrinter {
  if (!raw) return DEFAULT_RECEIPT_PRINTER;
  try {
    const saved: unknown = JSON.parse(raw);
    if (typeof saved === 'object' && saved !== null) {
      const name =
        'name' in saved && typeof saved.name === 'string' && saved.name !== '' ? saved.name : null;
      const silent = 'silent' in saved && saved.silent === true;
      return { name, silent: name !== null && silent };
    }
  } catch {
    // Not JSON: the default.
  }
  return DEFAULT_RECEIPT_PRINTER;
}

function readStored(): ReceiptPrinter {
  try {
    return parseReceiptPrinter(localStorage.getItem(RECEIPT_PRINTER_STORAGE_KEY));
  } catch {
    return DEFAULT_RECEIPT_PRINTER;
  }
}

let current = readStored();
const listeners = new Set<() => void>();

export function getReceiptPrinter(): ReceiptPrinter {
  return current;
}

export function setReceiptPrinter(next: ReceiptPrinter): void {
  current = { name: next.name, silent: next.name !== null && next.silent };
  try {
    localStorage.setItem(RECEIPT_PRINTER_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage is blocked: the choice still applies until the app is closed.
  }
  for (const listener of listeners) listener();
}

/** The printer to print to without the dialog, if one is chosen for that. */
export function silentPrinter(): string | null {
  return current.silent ? current.name : null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useReceiptPrinter(): ReceiptPrinter {
  return useSyncExternalStore(subscribe, getReceiptPrinter);
}
