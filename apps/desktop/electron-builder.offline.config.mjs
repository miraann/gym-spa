// Packages the offline edition's Windows installer: `pnpm desktop:exe:offline` from the repo root
// (it runs `pnpm server:bundle` and the offline web build first). The same shell as the online
// edition with the offline web build (apps/app/dist-offline, made with apps/app/.env.offline),
// which talks to the gym's server PC through app://gym-spa/server/, plus the server folder
// (apps/server/dist/server → resources\server). One installer with two modes (spec §8, OF-f):
// the page "This PC is the server" / "Connect to the server" comes from the NSIS include. It
// installs for all users, so it asks for an administrator: the server is a Windows service.
import base from './electron-builder.config.mjs';

/** @type {import('electron-builder').Configuration} */
export default {
  ...base,
  // Never updates itself, whatever GYM_UPDATE_URL says: updates come by USB, server first (OF-f).
  publish: null,
  extraResources: [
    { from: '../app/dist-offline', to: 'web' },
    { from: '../server/dist/server', to: 'server' },
  ],
  nsis: {
    ...base.nsis,
    artifactName: 'gym-spa-offline-setup-${version}.${ext}',
    oneClick: false,
    perMachine: true,
    allowElevation: true,
    allowToChangeInstallationDirectory: false,
    include: '../server/dist/offline-installer.nsh',
  },
};
