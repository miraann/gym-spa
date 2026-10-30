import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { pairingProof, serverIdentity } from '@gym/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// The real server's certificate maker, so the test talks TLS the way a gym's server does.
import { makeCertificate } from '../../server/src/tls.ts';
import {
  broadcastAddresses,
  pairWithServer,
  parseServerAddress,
  probeServer,
} from './server-pairing';

const certificate = makeCertificate();
const CODE = '482193';
let port: number;
let server: https.Server;

beforeAll(async () => {
  server = https.createServer(
    { key: certificate.key, cert: certificate.cert },
    (request, response) => {
      if (request.url === '/server/v1/info') {
        response.end(
          JSON.stringify({
            edition: 'offline',
            version: '0.1.0',
            gym: { code: 'hawler-fit', name: 'جیمی هەولێر' },
            // What a server says about itself is never used: the PC computes the identity.
            identity: 'XXXX-XXXX',
          }),
        );
        return;
      }
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        void (async () => {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, string>;
          const right = body.proof === (await pairingProof(CODE, certificate.fingerprint));
          response.statusCode = right ? 201 : 400;
          response.end(
            JSON.stringify(right ? { token: 'pc-token', pcId: 'x' } : { error: 'code_wrong' }),
          );
        })();
      });
    },
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server.close();
});

describe('parseServerAddress', () => {
  it("takes a host with or without a port (the server's HTTPS port by default)", () => {
    expect(parseServerAddress('192.168.1.20')).toEqual({ host: '192.168.1.20', port: 47200 });
    expect(parseServerAddress(' Server-PC:48200 ')).toEqual({ host: 'server-pc', port: 48200 });
    expect(parseServerAddress('a b')).toBeNull();
    expect(parseServerAddress('host:99999')).toBeNull();
  });
});

describe('probeServer', () => {
  it('says which server it is, with the identity of the certificate it showed', async () => {
    expect(await probeServer(`127.0.0.1:${String(port)}`)).toEqual({
      address: '127.0.0.1',
      port,
      fingerprint: certificate.fingerprint,
      identity: serverIdentity(certificate.fingerprint),
      gym: { code: 'hawler-fit', name: 'جیمی هەولێر' },
      version: '0.1.0',
    });
  });

  it('is null where no server answers', async () => {
    expect(await probeServer('127.0.0.1:1')).toBeNull();
  });
});

describe('pairWithServer', () => {
  it('pairs with the code, for the certificate the person checked', async () => {
    expect(
      await pairWithServer(
        { address: '127.0.0.1', port, fingerprint: certificate.fingerprint },
        ' 482 193 ',
        'کاشێر',
      ),
    ).toEqual({ ok: true, token: 'pc-token' });
  });

  it('sends nothing to a server that shows another certificate now', async () => {
    const other = makeCertificate().fingerprint;
    expect(
      await pairWithServer({ address: '127.0.0.1', port, fingerprint: other }, CODE, 'کاشێر'),
    ).toEqual({ ok: false, error: 'certificate_changed' });
  });

  it("passes on the server's refusal, and refuses a code that isn't six digits", async () => {
    const at = { address: '127.0.0.1', port, fingerprint: certificate.fingerprint };
    expect(await pairWithServer(at, '111111', 'کاشێر')).toEqual({ ok: false, error: 'code_wrong' });
    expect(await pairWithServer(at, '12', 'کاشێر')).toEqual({ ok: false, error: 'code_wrong' });
    expect(await pairWithServer({ ...at, port: 1 }, CODE, 'کاشێر')).toEqual({
      ok: false,
      error: 'unreachable',
    });
  });
});

describe('broadcastAddresses', () => {
  it('always asks the whole network, plus each network of this PC', () => {
    const addresses = broadcastAddresses();
    expect(addresses[0]).toBe('255.255.255.255');
    for (const address of addresses) expect(address).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });
});
