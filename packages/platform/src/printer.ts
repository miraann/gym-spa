import { platform } from './runtime';

// Printing receipts (step 3g): the system's print dialog, where a PDF can be saved too, in the
// browser and the Windows app. Android's WebView has no print dialog, so the screens offer none
// there. Silent printing to an 80mm printer in the Windows app comes with the cash register.

/** Whether this device can print from the app. */
export function canPrint(): boolean {
  return platform === 'web' || platform === 'electron';
}

/** Opens the print dialog for the page; the print styles show only what is to be printed. */
export function printPage(): void {
  window.print();
}
