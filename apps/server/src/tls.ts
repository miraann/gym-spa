import {
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  X509Certificate,
  type KeyObject,
} from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// The server's own certificate for HTTPS on the LAN (spec §2.5: encrypted LAN traffic with a
// certificate the server makes for itself). Nobody signs it: each PC pins its fingerprint when it
// pairs (OF-d), which is stronger than a name check on a LAN without DNS. Node can read
// certificates but not make them, so this builds the few DER structures of one (RFC 5280) by hand;
// the tests check the result with Node's own X509Certificate and a real TLS handshake.

function length(size: number): Buffer {
  if (size < 0x80) return Buffer.from([size]);
  const bytes: number[] = [];
  for (let rest = size; rest > 0; rest >>= 8) bytes.unshift(rest & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function der(tag: number, ...parts: readonly Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag]), length(body.length), body]);
}

const sequence = (...parts: readonly Buffer[]) => der(0x30, ...parts);
const set = (...parts: readonly Buffer[]) => der(0x31, ...parts);
const explicit = (tag: number, inner: Buffer) => der(0xa0 + tag, inner);
const octets = (value: Buffer) => der(0x04, value);
const utf8 = (text: string) => der(0x0c, Buffer.from(text, 'utf8'));
const critical = der(0x01, Buffer.from([0xff]));

/** A positive INTEGER from big-endian bytes. */
function integer(bytes: Buffer): Buffer {
  const first = bytes[0] ?? 0;
  return der(0x02, first & 0x80 ? Buffer.concat([Buffer.from([0]), bytes]) : bytes);
}

function oid(dotted: string): Buffer {
  const [a = 0, b = 0, ...rest] = dotted.split('.').map(Number);
  const bytes = [40 * a + b];
  for (const arc of rest) {
    const groups = [arc & 0x7f];
    for (let value = Math.floor(arc / 128); value > 0; value = Math.floor(value / 128)) {
      groups.unshift((value & 0x7f) | 0x80);
    }
    bytes.push(...groups);
  }
  return der(0x06, Buffer.from(bytes));
}

/** UTCTime until 2049, GeneralizedTime from 2050 (RFC 5280 §4.1.2.5). */
function time(moment: Date): Buffer {
  const iso = moment.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return moment.getUTCFullYear() < 2050
    ? der(0x17, Buffer.from(`${iso.slice(2)}Z`))
    : der(0x18, Buffer.from(`${iso}Z`));
}

const ECDSA_WITH_SHA256 = '1.2.840.10045.4.3.2';
const COMMON_NAME = '2.5.4.3';

function extension(id: string, value: Buffer, isCritical = false): Buffer {
  return sequence(oid(id), ...(isCritical ? [critical] : []), octets(value));
}

export const CERTIFICATE_NAME = 'gym-spa server';
const VALID_YEARS = 20;

export interface ServerCertificate {
  readonly key: string;
  readonly cert: string;
  /** SHA-256 of the certificate, as Node shows it (AB:CD:…): what a paired PC pins. */
  readonly fingerprint: string;
}

/** A new self-signed ECDSA P-256 certificate for TLS servers, valid for 20 years. */
export function makeCertificate(now: Date = new Date()): ServerCertificate {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const name = sequence(set(sequence(oid(COMMON_NAME), utf8(CERTIFICATE_NAME))));
  const serial = randomBytes(16);
  serial[0] = (serial[0] ?? 0) & 0x7f;
  const notAfter = new Date(now);
  notAfter.setUTCFullYear(now.getUTCFullYear() + VALID_YEARS);
  const extensions = sequence(
    // Not a certificate authority.
    extension('2.5.29.19', sequence(), true),
    // Key usage: digital signature only (a BIT STRING with 7 unused bits).
    extension('2.5.29.15', der(0x03, Buffer.from([0x07, 0x80])), true),
    // Extended key usage: TLS server.
    extension('2.5.29.37', sequence(oid('1.3.6.1.5.5.7.3.1'))),
    // Subject alternative name, a dNSName: browsers ignore the common name.
    extension('2.5.29.17', sequence(der(0x82, Buffer.from('gym-spa-server')))),
  );
  const tbs = sequence(
    explicit(0, integer(Buffer.from([2]))),
    integer(serial),
    sequence(oid(ECDSA_WITH_SHA256)),
    name,
    sequence(time(now), time(notAfter)),
    name,
    publicKey.export({ type: 'spki', format: 'der' }),
    explicit(3, extensions),
  );
  const signature = sign('sha256', tbs, privateKey);
  const certificate = sequence(
    tbs,
    sequence(oid(ECDSA_WITH_SHA256)),
    der(0x03, Buffer.concat([Buffer.from([0]), signature])),
  );
  const body = certificate.toString('base64').replace(/(.{64})/g, '$1\n');
  const cert = `-----BEGIN CERTIFICATE-----\n${body.trimEnd()}\n-----END CERTIFICATE-----\n`;
  const key = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return { key, cert, fingerprint: new X509Certificate(cert).fingerprint256 };
}

/** The certificate's key matches it and it is still valid. */
function usable(cert: string, key: string, now: Date): boolean {
  try {
    const certificate = new X509Certificate(cert);
    const privateKey: KeyObject = createPrivateKey(key);
    return certificate.checkPrivateKey(privateKey) && new Date(certificate.validTo) > now;
  } catch {
    return false;
  }
}

/**
 * The server's certificate from its data folder, made the first time. A changed certificate means
 * every PC must pair again, so an existing usable one is always kept.
 */
export function serverCertificate(dataRoot: string, now: Date = new Date()): ServerCertificate {
  const keyFile = path.join(dataRoot, 'tls-key.pem');
  const certFile = path.join(dataRoot, 'tls-cert.pem');
  if (existsSync(keyFile) && existsSync(certFile)) {
    const key = readFileSync(keyFile, 'utf8');
    const cert = readFileSync(certFile, 'utf8');
    if (usable(cert, key, now)) {
      return { key, cert, fingerprint: new X509Certificate(cert).fingerprint256 };
    }
  }
  const made = makeCertificate(now);
  writeFileSync(keyFile, made.key, { mode: 0o600 });
  writeFileSync(certFile, made.cert);
  return made;
}
