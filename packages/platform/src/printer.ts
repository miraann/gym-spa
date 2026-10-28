import { desktopBridge, platform } from './runtime';

// Printing receipts (step 3g): the system's print dialog, where a PDF can be saved too, in the
// browser and the Windows app. Android's WebView has no print dialog, so the screens offer none
// there. In the Windows app a receipt printer can be chosen, and then pages print to it without the
// dialog (step 8f).

/** Whether this device can print from the app. */
export function canPrint(): boolean {
  return platform === 'web' || platform === 'electron';
}

/** Whether this device can print to a chosen printer without the dialog (the Windows app). */
export function canPrintSilently(): boolean {
  return desktopBridge !== undefined;
}

/** The printers Windows knows, by name; none elsewhere. */
export async function listPrinters(): Promise<readonly string[]> {
  return desktopBridge ? desktopBridge.listPrinters() : [];
}

/**
 * Prints the page: the print styles show only what is to be printed. With a printer named (the
 * Windows app), it prints there without the dialog, and opens the dialog if that fails. Resolves
 * once it is done.
 */
export async function printPage(silentPrinter: string | null = null): Promise<void> {
  if (silentPrinter !== null && desktopBridge) {
    const printed = await desktopBridge.printSilently(silentPrinter).catch(() => false);
    if (printed) return;
  }
  window.print();
}
