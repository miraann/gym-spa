import { watchDesktopUpdate } from '@gym/platform';
import { setUpdateReady } from './app-update';

/**
 * The Windows app's own updates (step 11c): a downloaded version shows the same notice as the web
 * app's (UpdateNotice); pressing it closes the app, installs it and starts it again.
 */
export function registerDesktopUpdates(): void {
  watchDesktopUpdate((install) => {
    setUpdateReady(() => {
      install();
      return Promise.resolve();
    }, true);
  });
}
