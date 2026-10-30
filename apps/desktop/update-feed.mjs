// Where the online edition's Windows app looks for new versions (spec §8, step 11c): the latest
// release of the public repository miraann/gym-spa-releases (binaries only; decided by the user on
// 2026-10-30), or the folder named by GYM_UPDATE_URL when the installer is built (`off`: none, a
// build that never looks). electron-builder writes resources\app-update.yml into the app and
// latest.yml next to the installer in release/; `pnpm desktop:publish` uploads them
// (scripts/publish-update.mjs). The offline edition never has one: it is updated by USB (OF-f).

/** The repository whose releases hold the installers. */
export const RELEASES_REPO = 'miraann/gym-spa-releases';
/** GitHub sends this to the newest (non-draft, non-prerelease) release's file of the same name. */
export const OFFICIAL_UPDATE_URL = `https://github.com/${RELEASES_REPO}/releases/latest/download/`;

/**
 * The update address for this build: GYM_UPDATE_URL, `off` for none, or the official one.
 * @param {string | undefined} variable
 * @returns {string | undefined}
 */
export function updateAddress(variable) {
  if (variable === undefined || variable.trim() === '') return OFFICIAL_UPDATE_URL;
  return variable.trim() === 'off' ? undefined : variable;
}

/**
 * electron-builder's `publish` setting for this address, or null without one. Only HTTPS, except
 * plain HTTP to this PC for trying an update locally.
 * @param {string | undefined} address
 * @returns {import('electron-builder').PublishConfiguration[] | null}
 */
export function updatePublish(address) {
  if (address === undefined || address.trim() === '') return null;
  let url;
  try {
    url = new URL(address.trim());
  } catch {
    throw new Error(`GYM_UPDATE_URL is not an address: ${address}`);
  }
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('GYM_UPDATE_URL must be https:// (http:// only to 127.0.0.1 for a test).');
  }
  if (url.search !== '' || url.hash !== '' || url.username !== '' || url.password !== '') {
    throw new Error('GYM_UPDATE_URL is a folder address, without ?, # or a login.');
  }
  // A folder: latest.yml and the installer are found next to each other in it.
  const folder = url.href.endsWith('/') ? url.href : `${url.href}/`;
  return [{ provider: 'generic', url: folder }];
}
