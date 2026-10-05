import type { CapacitorConfig } from '@capacitor/cli';
import ckb from '../../packages/i18n/src/locales/ckb/common.json' with { type: 'json' };

const config: CapacitorConfig = {
  // Becomes the Play Store identity once published (Phase 11); it can't change after that.
  appId: 'site.clickgroup.gymspa',
  appName: ckb.app.name,
  webDir: 'dist',
  // The app is served from https://localhost inside the APK. The local database belongs to that
  // origin, so never change the scheme or hostname: devices would lose their unsynced data.
  plugins: {
    SystemBars: {
      // The app draws edge-to-edge and keeps content out of the system bars with
      // env(safe-area-inset-*) (see styles.css). On WebViews older than v140, Capacitor pads the
      // WebView itself instead. This is Capacitor's recommended mode and its default from v9.
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
