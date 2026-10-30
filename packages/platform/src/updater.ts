import { desktopBridge } from './runtime';

/**
 * The Windows app's own updates (step 11c; the web app has its service worker instead, and the
 * Android app is updated by installing a new APK). Calls `onReady` once a new version has been
 * downloaded, with `install`, which closes the app, installs it and starts it again. Returns the
 * function that stops watching.
 */
export function watchDesktopUpdate(onReady: (install: () => void) => void): () => void {
  const bridge = desktopBridge;
  if (!bridge) return () => undefined;
  return bridge.watchUpdate(() => {
    onReady(() => {
      bridge.installUpdate();
    });
  });
}
