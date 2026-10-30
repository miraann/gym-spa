import { createSocket } from 'node:dgram';
import http from 'node:http';
import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';
import tls, { type TLSSocket } from 'node:tls';
import { isFingerprint, normalizePairingCode, pairingProof, serverIdentity } from '@gym/core';
import type { FoundServer, PairError, ProbedServer, ServerGym } from '@gym/platform/desktop-bridge';

// Finding and pairing with the offline edition's server, in the Windows app's main process (spec
// §2.5, step OF-d). The certificate is checked before anything is sent: a TLS connection is made
// first, its certificate's fingerprint read (when checking a server) or compared with the one the
// person saw (when pairing), and only then does HTTP go over that same connection.

export const LAN_PORT = 47200;
export const DISCOVERY_PORT = 47201;
const DISCOVERY_QUESTION = 'gym-spa:discover:v1';
const TIMEOUT_MS = 5000;

/** host[:port] as typed; the server's HTTPS port when none is given. */
export function parseServerAddress(text: string): { host: string; port: number } | null {
  const match = /^([^:\s]+)(?::(\d{1,5}))?$/.exec(text.trim());
  if (!match?.[1]) return null;
  const port = match[2] === undefined ? LAN_PORT : Number(match[2]);
  if (port < 1 || port > 65_535) return null;
  return { host: match[1].toLowerCase(), port };
}

function connect(host: string, port: number): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host,
      port,
      // The server's own certificate: no authority signed it. Its fingerprint is what counts.
      rejectUnauthorized: false,
      ...(isIP(host) === 0 ? { servername: host } : {}),
    });
    socket.setTimeout(TIMEOUT_MS, () => {
      socket.destroy(new Error('timeout'));
    });
    socket.once('secureConnect', () => {
      resolve(socket);
    });
    socket.once('error', reject);
  });
}

function fingerprintOf(socket: TLSSocket): string | null {
  return socket.getPeerX509Certificate()?.fingerprint256 ?? null;
}

/** One HTTP request over a connection already made (and checked). */
function requestOver(
  socket: TLSSocket,
  host: string,
  port: number,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        createConnection: () => socket,
        method,
        path,
        headers: { host: `${host}:${String(port)}`, 'content-type': 'application/json' },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed: unknown;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch {
            parsed = null;
          }
          resolve({ status: response.statusCode ?? 0, body: parsed });
        });
      },
    );
    request.on('error', reject);
    request.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

function readGym(value: unknown): ServerGym | null {
  if (typeof value !== 'object' || value === null) return null;
  const { code, name } = value as Record<string, unknown>;
  return typeof code === 'string' && typeof name === 'string' ? { code, name } : null;
}

/** Connects to a server by address and reads which it is; null when nothing answers like one. */
export async function probeServer(address: string): Promise<ProbedServer | null> {
  const parsed = parseServerAddress(address);
  if (parsed === null) return null;
  let socket: TLSSocket;
  try {
    socket = await connect(parsed.host, parsed.port);
  } catch {
    return null;
  }
  try {
    const fingerprint = fingerprintOf(socket);
    if (fingerprint === null || !isFingerprint(fingerprint)) return null;
    const info = await requestOver(socket, parsed.host, parsed.port, 'GET', '/server/v1/info');
    const body = info.body as Record<string, unknown> | null;
    if (info.status !== 200 || body?.edition !== 'offline' || typeof body.version !== 'string') {
      return null;
    }
    return {
      address: parsed.host,
      port: parsed.port,
      fingerprint,
      // From the certificate this PC sees, never from what the server says about itself.
      identity: serverIdentity(fingerprint),
      gym: readGym(body.gym),
      version: body.version,
    };
  } catch {
    return null;
  } finally {
    socket.destroy();
  }
}

const PAIR_ERRORS: readonly PairError[] = [
  'code_wrong',
  'code_expired',
  'no_code',
  'too_many_tries',
  'invalid_name',
];

/**
 * Pairs with a server whose certificate the person checked: refused if it shows another one now.
 * The token is returned to the main process only, which keeps it.
 */
export async function pairWithServer(
  server: { address: string; port: number; fingerprint: string },
  code: string,
  name: string,
): Promise<{ ok: true; token: string } | { ok: false; error: PairError }> {
  const typed = normalizePairingCode(code);
  if (typed === null) return { ok: false, error: 'code_wrong' };
  let socket: TLSSocket;
  try {
    socket = await connect(server.address, server.port);
  } catch {
    return { ok: false, error: 'unreachable' };
  }
  try {
    if (fingerprintOf(socket) !== server.fingerprint) {
      return { ok: false, error: 'certificate_changed' };
    }
    const answer = await requestOver(
      socket,
      server.address,
      server.port,
      'POST',
      '/server/v1/pair',
      {
        code: typed,
        proof: await pairingProof(typed, server.fingerprint),
        name,
      },
    );
    const body = answer.body as Record<string, unknown> | null;
    if (answer.status === 201 && typeof body?.token === 'string') {
      return { ok: true, token: body.token };
    }
    const error = PAIR_ERRORS.find((key) => key === body?.error);
    return { ok: false, error: error ?? 'unreachable' };
  } catch {
    return { ok: false, error: 'unreachable' };
  } finally {
    socket.destroy();
  }
}

/** The broadcast address of each IPv4 network this PC is on, and the general one. */
export function broadcastAddresses(): string[] {
  const addresses = new Set(['255.255.255.255']);
  for (const entry of Object.values(networkInterfaces()).flat()) {
    if (entry?.family !== 'IPv4' || entry.internal) continue;
    const ip = entry.address.split('.').map(Number);
    const mask = entry.netmask.split('.').map(Number);
    addresses.add(ip.map((part, index) => (part | (~(mask[index] ?? 0) & 255)) & 255).join('.'));
  }
  return [...addresses];
}

/** Asks the network which offline servers there are, for about 1.5 s. */
export function findServers(port: number = DISCOVERY_PORT, waitMs = 1500): Promise<FoundServer[]> {
  return new Promise((resolve) => {
    const found = new Map<string, FoundServer>();
    const socket = createSocket('udp4');
    socket.on('message', (message, from) => {
      try {
        const answer = JSON.parse(message.toString('utf8')) as Record<string, unknown>;
        if (
          answer.v !== 1 ||
          typeof answer.port !== 'number' ||
          typeof answer.identity !== 'string' ||
          typeof answer.version !== 'string'
        ) {
          return;
        }
        found.set(from.address, {
          address: from.address,
          port: answer.port,
          identity: answer.identity,
          gym: readGym(answer.gym),
          version: answer.version,
        });
      } catch {
        // Not an answer.
      }
    });
    socket.on('error', () => {
      socket.close();
      resolve([...found.values()]);
    });
    socket.bind(0, () => {
      socket.setBroadcast(true);
      for (const address of broadcastAddresses()) {
        socket.send(DISCOVERY_QUESTION, port, address);
      }
      setTimeout(() => {
        socket.close();
        resolve([...found.values()]);
      }, waitMs);
    });
  });
}

/** Whether an offline server answers at this address on this PC (the server PC itself). */
export async function localServerAnswers(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/server/v1/info`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await response.json()) as { edition?: unknown };
    return response.ok && body.edition === 'offline';
  } catch {
    return false;
  }
}
