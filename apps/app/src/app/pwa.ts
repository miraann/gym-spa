import { toast } from 'sonner';
import { registerSW } from 'virtual:pwa-register';
import { i18n } from '@/lib/i18n';
import { logError } from '@/lib/logger';
import { setUpdateReady } from './app-update';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
/** Coming back to the app looks for a new version too, at most this often. */
const RECHECK_AFTER_MS = 10 * 60 * 1000;

/** If the new version hasn't taken over by then, reload anyway (it is still waiting: asked again). */
const RELOAD_FALLBACK_MS = 10 * 1000;

/** Registers the service worker that caches the whole app so it opens without internet. */
export function registerPwa(): void {
  // The waiting version takes over (a message to it), then the page reloads into it.
  const applyUpdate = async () => {
    let reloading = false;
    const reload = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', reload);
    setTimeout(reload, RELOAD_FALLBACK_MS);
    await updateServiceWorker(true);
  };
  const updateServiceWorker = registerSW({
    onNeedRefresh() {
      // Never reloads on its own: that could throw away a half-filled form. UpdateNotice asks.
      setUpdateReady(applyUpdate);
    },
    // The reload is applyUpdate's. The plugin's own one comes only for a page that an older
    // version already controlled when it opened, so a page opened before the first version was
    // cached (a new device) would never reload.
    onNeedReload: () => undefined,
    onOfflineReady() {
      toast.success(i18n.t('pwa.offlineReady'));
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      let lastCheck = Date.now();
      const check = () => {
        lastCheck = Date.now();
        registration.update().catch(() => {
          // Offline right now; the next check will try again.
        });
      };
      // Reception and kiosk screens stay open for days: look every hour, and when the app comes
      // back to the front or back online.
      setInterval(check, UPDATE_CHECK_INTERVAL_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && Date.now() - lastCheck > RECHECK_AFTER_MS) {
          check();
        }
      });
      window.addEventListener('online', check);
    },
    onRegisterError(error: unknown) {
      logError(error, { area: 'service-worker' });
    },
  });
}
