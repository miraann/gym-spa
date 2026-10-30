import { createSocket } from 'node:dgram';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import https from 'node:https';
import { networkInterfaces, tmpdir } from 'node:os';
import path from 'node:path';
import type { TLSSocket } from 'node:tls';
import {
  generateLicenseKey,
  importLicenseSigningKey,
  keyRingOf,
  pairingProof,
  serverIdentity,
  signLicense,
  staffEmail,
  type License,
} from '@gym/core';
import type { Database as Schema } from '@gym/db';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DISCOVERY_QUESTION, readDiscoveryAnswer } from '../src/discovery.ts';
import { OFFLINE_PUBLISHABLE_KEY } from '../src/keys.ts';
import { toolPaths } from '../src/paths.ts';
import type { StackPorts } from '../src/ports.ts';
import { createServer, startServer, type RunningServer } from '../src/stack.ts';

// Pairing a PC with a real offline server (spec §8, step OF-d): over the server's HTTPS port, from
// this PC's own LAN address so the server sees "another PC"; the server's settings are only for its
// secret key, the first setup, or staff with server.manage; discovery answers over UDP.

const PORTS: StackPorts = { postgres: 43432, auth: 43499, rest: 43430, gateway: 43421 };
const LAN_PORT = 43200;
const DISCOVERY_PORT = 43201;
const MACHINE = '0V5Q-1BD4-TS11-N9TC-9402';
const tools = toolPaths();
const ready = existsSync(tools.authExe) && existsSync(tools.postgrestExe);
/** This PC's LAN address: requests to it don't come from the loopback address. */
const lanAddress = Object.values(networkInterfaces())
  .flat()
  .find((entry) => entry?.family === 'IPv4' && !entry.internal)?.address;

const LICENSE: License = {
  licenseId: '7c2d1f7e-4c3e-4d9f-8a21-3b4c5d6e7f81',
  kid: 'test-pair',
  gymId: '2b7d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e30',
  gymCode: 'duhok-fit',
  gymName: 'جیمی دهۆک',
  type: 'perpetual',
  maxBranches: null,
  maxDevices: null,
  features: [],
  issuedOn: '2026-10-29',
  expiresOn: null,
  updatesUntil: '2027-10-29',
};

interface Answer {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly fingerprint: string | null;
}

/** An HTTPS request that accepts any certificate and says which one it saw (as a new PC does). */
function lanRequest(
  method: string,
  route: string,
  headers: Record<string, string> = {},
  body?: unknown,
): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        host: lanAddress,
        port: LAN_PORT,
        method,
        path: route,
        rejectUnauthorized: false,
        agent: false,
        headers: { 'content-type': 'application/json', ...headers },
      },
      (response) => {
        // Read now: once the body has arrived the socket goes back to the agent.
        const socket = response.socket as TLSSocket;
        const fingerprint = socket.getPeerX509Certificate()?.fingerprint256 ?? null;
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: response.statusCode ?? 0,
            body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
            fingerprint,
          });
        });
      },
    );
    request.on('error', reject);
    request.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

describe.skipIf(!ready || lanAddress === undefined)('pairing with an offline server', () => {
  const dataRoot = mkdtempSync(path.join(tmpdir(), 'gym-server-pairing-'));
  let server: RunningServer;
  let ownerPassword: string;

  async function admin(
    method: 'GET' | 'POST',
    name: string,
    headers: Record<string, string>,
    body?: unknown,
  ) {
    const response = await fetch(`${server.url}/server/v1/admin/${name}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }
  const withKey = () => ({ apikey: server.backend.SECRET_KEY });

  beforeAll(async () => {
    const key = await importLicenseSigningKey((await generateLicenseKey('test-pair')).privateJwk);
    createServer({ dataRoot, ports: PORTS, tools, seed: false });
    server = await startServer({
      dataRoot,
      ports: PORTS,
      tools,
      lanPort: LAN_PORT,
      discoveryPort: DISCOVERY_PORT,
      license: { keys: keyRingOf(key), machineCode: MACHINE },
    });
    // The first setup needs no key: the gym has no staff yet.
    expect(
      (await admin('POST', 'license', {}, { license: await signLicense(LICENSE, key) })).status,
    ).toBe(200);
    const owner = await admin('POST', 'owner', {}, { username: 'owner', fullName: 'خاوەن' });
    expect(owner.status).toBe(201);
    ownerPassword = String(owner.body.temporaryPassword);
  });

  afterAll(async () => {
    await server.stop();
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it('tells a new PC which server it is, with the identity of its certificate', async () => {
    const info = await lanRequest('GET', '/server/v1/info');
    expect(info.status).toBe(200);
    expect(info.fingerprint).toBe(server.fingerprint);
    expect(info.body).toMatchObject({
      gym: { code: 'duhok-fit', name: 'جیمی دهۆک' },
      identity: serverIdentity(server.fingerprint ?? ''),
      setup: null,
    });
  });

  it('answers discovery over UDP', async () => {
    const client = createSocket('udp4');
    try {
      const reply = await new Promise<Buffer>((resolve, reject) => {
        client.once('message', resolve);
        client.send(DISCOVERY_QUESTION, DISCOVERY_PORT, '127.0.0.1');
        setTimeout(() => {
          reject(new Error('no answer'));
        }, 3000);
      });
      expect(readDiscoveryAnswer(reply)).toMatchObject({
        port: LAN_PORT,
        identity: serverIdentity(server.fingerprint ?? ''),
        gym: { code: 'duhok-fit' },
      });
    } finally {
      client.close();
    }
  });

  it("keeps the server's settings for its key, or staff with server.manage, once there is staff", async () => {
    expect((await admin('GET', 'pcs', {})).status).toBe(403);
    expect((await admin('GET', 'pcs', withKey())).status).toBe(200);
    const client = createClient<Schema>(server.url, OFFLINE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const login = await client.auth.signInWithPassword({
      email: staffEmail('owner', 'duhok-fit'),
      password: ownerPassword,
    });
    expect(login.error).toBeNull();
    const token = login.data.session?.access_token ?? '';
    expect((await admin('GET', 'pcs', { authorization: `Bearer ${token}` })).status).toBe(200);
    expect((await admin('GET', 'pcs', { authorization: 'Bearer not.a.token' })).status).toBe(403);
    // Never from another PC, whatever it sends: refused before it gets that far.
    const fromLan = await lanRequest('GET', '/server/v1/admin/pcs', withKey());
    expect(fromLan).toMatchObject({ status: 401, body: { message: 'pc_not_paired' } });
  });

  it('refuses another PC until it is paired, pairs it with the code, and refuses it once removed', async () => {
    const api = { apikey: OFFLINE_PUBLISHABLE_KEY };
    // Auth's settings answer anyone with the key: here only the pairing can refuse.
    expect((await lanRequest('GET', '/auth/v1/settings', api)).body).toEqual({
      message: 'pc_not_paired',
    });
    const { code, identity } = (await admin('POST', 'pairing-code', withKey())).body as {
      code: string;
      identity: string;
    };
    expect(identity).toBe(serverIdentity(server.fingerprint ?? ''));
    const seen = (await lanRequest('GET', '/server/v1/info')).fingerprint ?? '';

    const wrong = await lanRequest(
      'POST',
      '/server/v1/pair',
      {},
      {
        code,
        proof: await pairingProof(code, seen.replace(/^../, 'FF')),
        name: 'کاشێر',
      },
    );
    expect(wrong).toMatchObject({ status: 400, body: { error: 'code_wrong' } });

    const paired = await lanRequest(
      'POST',
      '/server/v1/pair',
      {},
      {
        code,
        proof: await pairingProof(code, seen),
        name: 'کاشێر',
      },
    );
    expect(paired.status).toBe(201);
    const token = String(paired.body.token);
    const withToken = { ...api, 'x-gym-device-token': token };
    expect((await lanRequest('GET', '/auth/v1/settings', withToken)).status).toBe(200);

    const pcs = (await admin('GET', 'pcs', withKey())).body.pcs as { id: string; name: string }[];
    expect(pcs.map((pc) => pc.name)).toEqual(['کاشێر']);
    expect((await admin('POST', 'pcs-remove', withKey(), { id: pcs[0]?.id })).status).toBe(200);
    expect((await lanRequest('GET', '/auth/v1/settings', withToken)).body).toEqual({
      message: 'pc_not_paired',
    });
  });
});
