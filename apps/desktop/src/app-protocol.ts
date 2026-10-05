import { stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * The web app is served from app://gym-spa/. IndexedDB, OPFS and the local database belong to
 * this origin, so never change it: devices would lose their unsynced data.
 */
export const APP_SCHEME = 'app';
export const APP_HOST = 'gym-spa';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
};

/** Explicit types, because module scripts and WebAssembly streaming refuse anything else. */
export function contentType(file: string): string {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

/**
 * Maps an app:// URL to a file inside `webRoot`. Paths without a file extension that match no
 * file are app routes (like /settings/display) and get index.html, so reloading any page works.
 * Returns undefined for other hosts, missing files and anything outside `webRoot`.
 */
export async function resolveAppFile(
  webRoot: string,
  requestUrl: string,
): Promise<string | undefined> {
  const url = new URL(requestUrl);
  if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST) return undefined;

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return undefined;
  }

  const root = path.resolve(webRoot);
  const file = path.resolve(root, `.${pathname}`);
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return undefined;

  if (await isFile(file)) return file;
  if (path.extname(pathname) === '') return path.join(root, 'index.html');
  return undefined;
}

/** Whether a URL belongs to the app itself (or to the Vite dev server during development). */
export function isAppUrl(url: string, devServerUrl?: string): boolean {
  try {
    const { origin, protocol, host } = new URL(url);
    if (protocol === `${APP_SCHEME}:`) return host === APP_HOST;
    return devServerUrl !== undefined && origin === new URL(devServerUrl).origin;
  } catch {
    return false;
  }
}

/** Links that may open in the user's normal browser. */
export function isExternalWebLink(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}
