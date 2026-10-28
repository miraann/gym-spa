import { DESKTOP_CHANNELS, isPrinterName } from '@gym/platform/desktop-bridge';
import { ipcMain } from 'electron';

type IpcEvent = Electron.IpcMainInvokeEvent;

/**
 * Printing for the page (step 8f): the printers Windows knows, and printing the page to one of
 * them without the print dialog, for receipts on an 80mm printer. `fromApp` tells the app's own
 * pages apart.
 */
export function servePrinting(fromApp: (event: IpcEvent) => boolean): void {
  ipcMain.handle(DESKTOP_CHANNELS.printersGet, async (event) => {
    if (!fromApp(event)) throw new Error('Not allowed');
    const printers = await event.sender.getPrintersAsync();
    return printers.map((printer) => printer.name);
  });
  ipcMain.handle(DESKTOP_CHANNELS.printSilent, (event, printer: unknown) => {
    if (!fromApp(event) || !isPrinterName(printer)) throw new Error('Not allowed');
    return new Promise<boolean>((resolve) => {
      event.sender.print(
        { silent: true, deviceName: printer, printBackground: true },
        (success) => {
          resolve(success);
        },
      );
    });
  });
}
