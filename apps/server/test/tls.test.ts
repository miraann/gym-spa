import { X509Certificate, createPrivateKey } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { afterAll, describe, expect, it } from 'vitest';
import { CERTIFICATE_NAME, makeCertificate, serverCertificate } from '../src/tls.ts';

describe('the server certificate', () => {
  const now = new Date('2026-10-30T10:00:00Z');
  const made = makeCertificate(now);
  const certificate = new X509Certificate(made.cert);

  it('is a valid self-signed certificate that Node reads', () => {
    expect(certificate.subject).toBe(`CN=${CERTIFICATE_NAME}`);
    expect(certificate.issuer).toBe(`CN=${CERTIFICATE_NAME}`);
    expect(certificate.verify(certificate.publicKey)).toBe(true);
    expect(certificate.checkPrivateKey(createPrivateKey(made.key))).toBe(true);
    expect(certificate.ca).toBe(false);
    expect(certificate.subjectAltName).toBe('DNS:gym-spa-server');
    expect(certificate.keyUsage).toEqual(['1.3.6.1.5.5.7.3.1']);
    expect(certificate.publicKey.asymmetricKeyDetails?.namedCurve).toBe('prime256v1');
  });

  it('is valid for 20 years from now', () => {
    expect(new Date(certificate.validFrom).toISOString()).toBe('2026-10-30T10:00:00.000Z');
    expect(new Date(certificate.validTo).toISOString()).toBe('2046-10-30T10:00:00.000Z');
  });

  it('writes dates from 2050 on as GeneralizedTime', () => {
    const late = new X509Certificate(makeCertificate(new Date('2049-06-01T00:00:00Z')).cert);
    expect(new Date(late.validTo).toISOString()).toBe('2069-06-01T00:00:00.000Z');
  });

  it('has a different key and fingerprint every time', () => {
    const other = makeCertificate(now);
    expect(other.fingerprint).not.toBe(made.fingerprint);
    expect(made.fingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });

  it('serves HTTPS, and a client sees the same fingerprint', async () => {
    const server = https.createServer({ key: made.key, cert: made.cert }, (_request, response) => {
      response.end('ok');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const seen = await new Promise<string>((resolve, reject) => {
        const socket = tls.connect({ host: '127.0.0.1', port, rejectUnauthorized: false }, () => {
          const fingerprint = socket.getPeerX509Certificate()?.fingerprint256 ?? '';
          socket.end();
          resolve(fingerprint);
        });
        socket.on('error', reject);
      });
      expect(seen).toBe(made.fingerprint);
    } finally {
      server.close();
    }
  });

  describe('in a data folder', () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'gym-server-tls-'));
    afterAll(() => {
      rmSync(folder, { recursive: true, force: true });
    });

    it('is made once and then kept, so paired PCs stay paired', () => {
      const first = serverCertificate(folder, now);
      expect(serverCertificate(folder, now).fingerprint).toBe(first.fingerprint);
    });

    it('is made again when the files are broken', () => {
      const first = serverCertificate(folder, now);
      writeFileSync(path.join(folder, 'tls-cert.pem'), 'broken');
      expect(serverCertificate(folder, now).fingerprint).not.toBe(first.fingerprint);
    });
  });
});
