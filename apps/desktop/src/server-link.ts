import { X509Certificate } from 'node:crypto';
import { APP_ORIGIN } from './app-protocol';

// The offline edition's link to the gym's server PC (spec §2.5, steps OF-c and OF-d). The page
// talks to app://gym-spa/server/… on its own origin, and the main process forwards that to the
// server: over HTTPS with the one certificate it paired with, adding this PC's pairing token. The
// page never sees the address, the certificate or the token. The online edition never asks for
// /server/, so it is unaffected.

/** Where the page reaches the server, inside the app's own origin. */
export const SERVER_PREFIX = '/server';

export interface ServerLink {
  /** https://<server>:47200 on the LAN, or http://127.0.0.1:47213 on the server PC itself. */
  readonly url: string;
  /** The certificate's SHA-256 as Node shows it (AB:CD:…); required for https. */
  readonly fingerprint: string | null;
  /** This PC's pairing token (OF-d); sent with every request. */
  readonly token: string | null;
}

const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

function isLoopbackHost(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
}

/** A link that can be used: https with a fingerprint, or plain http to this PC only. */
export function checkServerLink(value: unknown): ServerLink | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Partial<Record<keyof ServerLink, unknown>>;
  if (typeof record.url !== 'string') return null;
  let url: URL;
  try {
    url = new URL(record.url);
  } catch {
    return null;
  }
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '' || url.username !== '') {
    return null;
  }
  const fingerprint =
    typeof record.fingerprint === 'string' && FINGERPRINT.test(record.fingerprint)
      ? record.fingerprint
      : null;
  const token = typeof record.token === 'string' && record.token !== '' ? record.token : null;
  if (url.protocol === 'https:' && fingerprint === null) return null;
  if (url.protocol === 'http:' && !isLoopbackHost(url.hostname)) return null;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return { url: url.origin, fingerprint, token };
}

export function parseServerLink(json: string | null): ServerLink | null {
  if (json === null) return null;
  try {
    return checkServerLink(JSON.parse(json));
  } catch {
    return null;
  }
}

/** Whether an app:// request is for the server. */
export function isServerRequest(requestUrl: string): boolean {
  const prefix = `${APP_ORIGIN}${SERVER_PREFIX}`;
  return (
    requestUrl === prefix ||
    requestUrl.startsWith(`${prefix}/`) ||
    requestUrl.startsWith(`${prefix}?`)
  );
}

/** The server's address for an app://gym-spa/server/… request (path and query kept). */
export function serverTarget(requestUrl: string, link: ServerLink): string {
  const url = new URL(requestUrl);
  const rest = url.pathname.slice(SERVER_PREFIX.length) || '/';
  return `${link.url}${rest}${url.search}`;
}

/** Whether a certificate (PEM, as Electron gives it) is the one this PC paired with. */
export function isPairedCertificate(pem: string, fingerprint: string): boolean {
  try {
    return new X509Certificate(pem).fingerprint256 === fingerprint;
  } catch {
    return false;
  }
}

/** The request headers that go on to the server: the page's, without hop-by-hop ones, plus the token. */
export function forwardedHeaders(headers: Headers, link: ServerLink): Headers {
  const out = new Headers();
  headers.forEach((value, name) => {
    if (!['host', 'origin', 'referer', 'connection', 'x-gym-device-token'].includes(name)) {
      out.set(name, value);
    }
  });
  if (link.token !== null) out.set('x-gym-device-token', link.token);
  return out;
}
