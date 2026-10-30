// Packages the offline edition's Windows installer: `pnpm desktop:exe:offline` from the repo root.
// The same shell as the online edition with the offline web build (apps/app/dist-offline, made
// with apps/app/.env.offline), which talks to the gym's server PC through app://gym-spa/server/.
// The installer's two modes and the server parts come with step OF-f.
import base from './electron-builder.config.mjs';

/** @type {import('electron-builder').Configuration} */
export default {
  ...base,
  extraResources: [{ from: '../app/dist-offline', to: 'web' }],
  nsis: {
    ...base.nsis,
    artifactName: 'gym-spa-offline-setup-${version}.${ext}',
  },
};
