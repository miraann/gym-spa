import { minimizeApp, onBackButton } from '@gym/platform';
import { logError } from '@/lib/logger';

export type BackAction = 'close-layer' | 'go-back' | 'minimize';

/** Open dialogs, sheets, menus and select lists (Radix marks them with data-state="open"). */
const OPEN_LAYER =
  ':is([role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"])[data-state="open"]';

/** What Android's Back does: close what's on top first, then go back a page, then leave the app. */
export function resolveBackAction(canGoBack: boolean, root: ParentNode = document): BackAction {
  if (root.querySelector(OPEN_LAYER)) return 'close-layer';
  // The login and lock screens have their own Back buttons; the pages behind them stay put.
  if (root.querySelector('[data-auth-screen]')) return 'minimize';
  return canGoBack ? 'go-back' : 'minimize';
}

/** Handles Android's Back button and back gesture. Other platforms have no Back button. */
export function startBackButtonHandling(): void {
  onBackButton((canGoBack) => {
    switch (resolveBackAction(canGoBack)) {
      case 'close-layer':
        // Radix closes the top dialog or menu on Escape.
        (document.activeElement ?? document.body).dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );
        break;
      case 'go-back':
        history.back();
        break;
      case 'minimize':
        minimizeApp().catch((error: unknown) => {
          logError(error, { area: 'back-button' });
        });
        break;
    }
  });
}
