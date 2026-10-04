import { toast } from 'sonner';
import { registerSW } from 'virtual:pwa-register';
import { i18n } from '@/lib/i18n';
import { logError } from '@/lib/logger';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** Registers the service worker that caches the whole app so it opens without internet. */
export function registerPwa(): void {
  const updateServiceWorker = registerSW({
    onNeedRefresh() {
      // Ask first: reloading on its own could throw away a half-filled form.
      toast(i18n.t('pwa.updateAvailable'), {
        description: i18n.t('pwa.updateHint'),
        duration: Number.POSITIVE_INFINITY,
        action: {
          label: i18n.t('actions.update'),
          onClick: () => {
            void updateServiceWorker(true);
          },
        },
        cancel: { label: i18n.t('actions.later'), onClick: () => undefined },
      });
    },
    onOfflineReady() {
      toast.success(i18n.t('pwa.offlineReady'));
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Reception and kiosk screens stay open for days: look for a new version every hour.
      setInterval(() => {
        registration.update().catch(() => {
          // Offline right now; the next check will try again.
        });
      }, UPDATE_CHECK_INTERVAL_MS);
    },
    onRegisterError(error: unknown) {
      logError(error, { area: 'service-worker' });
    },
  });
}
