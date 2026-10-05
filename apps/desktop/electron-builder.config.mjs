// Packages the Windows installer: `pnpm desktop:exe` from the repo root.
import ckb from '../../packages/i18n/src/locales/ckb/common.json' with { type: 'json' };
import appPackage from '../app/package.json' with { type: 'json' };

/** @type {import('electron-builder').Configuration} */
export default {
  appId: 'io.github.miraann.gymspa',
  productName: ckb.app.name,
  executableName: 'gym-spa',
  extraMetadata: {
    // One version for the web, Android and Windows builds: the one in apps/app/package.json.
    version: appPackage.version,
    // Shown as the publisher in Windows. Replace with the business name before release (Phase 11).
    author: { name: ckb.app.name },
  },
  directories: { output: 'release' },
  // Main and preload are bundled by esbuild, so the app ships without node_modules.
  files: ['dist/**/*', 'package.json'],
  // The same production web build as the PWA, served over app:// (see src/main.ts).
  extraResources: [{ from: '../app/dist', to: 'web' }],
  npmRebuild: false,
  publish: null,
  // Electron's security fuses, burned into the installed exe: it can't be started as plain Node,
  // with Node options or a debugger, and it only runs the app code from its own app.asar, after
  // checking that file's integrity. (The e2e tests run the unpackaged app, which keeps the defaults.)
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    grantFileProtocolExtraPrivileges: false,
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: '../app/public/pwa-512x512.png',
  },
  nsis: {
    artifactName: 'gym-spa-setup-${version}.${ext}',
  },
};
