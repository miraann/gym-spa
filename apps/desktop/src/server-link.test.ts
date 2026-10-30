import { describe, expect, it } from 'vitest';
import {
  checkServerLink,
  forwardedHeaders,
  isPairedCertificate,
  isServerRequest,
  parseServerLink,
  serverTarget,
} from './server-link';

const FINGERPRINT = Array.from({ length: 32 }, (_, index) =>
  index.toString(16).padStart(2, '0').toUpperCase(),
).join(':');

describe('checkServerLink', () => {
  it('takes https with a fingerprint, or http to this PC only', () => {
    expect(
      checkServerLink({ url: 'https://192.168.1.20:47200', fingerprint: FINGERPRINT, token: 't' }),
    ).toEqual({ url: 'https://192.168.1.20:47200', fingerprint: FINGERPRINT, token: 't' });
    expect(checkServerLink({ url: 'http://127.0.0.1:47213/' })).toEqual({
      url: 'http://127.0.0.1:47213',
      fingerprint: null,
      token: null,
    });
  });

  it('refuses plain http over the LAN, https without a fingerprint, and anything odd', () => {
    expect(checkServerLink({ url: 'http://192.168.1.20:47200' })).toBeNull();
    expect(checkServerLink({ url: 'https://192.168.1.20:47200' })).toBeNull();
    expect(checkServerLink({ url: 'https://192.168.1.20:47200', fingerprint: 'ab:cd' })).toBeNull();
    expect(checkServerLink({ url: 'https://x:1/path', fingerprint: FINGERPRINT })).toBeNull();
    expect(checkServerLink({ url: 'file:///C:/x' })).toBeNull();
    expect(checkServerLink({ url: 'not a url' })).toBeNull();
    expect(checkServerLink(null)).toBeNull();
    expect(parseServerLink('{')).toBeNull();
    expect(parseServerLink(null)).toBeNull();
  });
});

describe('forwarding', () => {
  const link = { url: 'https://192.168.1.20:47200', fingerprint: FINGERPRINT, token: 'pc-token' };

  it('knows the requests for the server', () => {
    expect(isServerRequest('app://gym-spa/server/rest/v1/members')).toBe(true);
    expect(isServerRequest('app://gym-spa/server')).toBe(true);
    expect(isServerRequest('app://gym-spa/serverless')).toBe(false);
    expect(isServerRequest('app://gym-spa/members')).toBe(false);
    expect(isServerRequest('app://other/server/x')).toBe(false);
  });

  it('keeps the path and query', () => {
    expect(serverTarget('app://gym-spa/server/rest/v1/members?select=id', link)).toBe(
      'https://192.168.1.20:47200/rest/v1/members?select=id',
    );
    expect(serverTarget('app://gym-spa/server', link)).toBe('https://192.168.1.20:47200/');
  });

  it("adds the PC's token and never passes on one from the page", () => {
    const headers = forwardedHeaders(
      new Headers({
        apikey: 'k',
        authorization: 'Bearer s',
        host: 'gym-spa',
        origin: 'app://gym-spa',
        'x-gym-device-token': 'from-the-page',
      }),
      link,
    );
    expect(Object.fromEntries(headers)).toEqual({
      apikey: 'k',
      authorization: 'Bearer s',
      'x-gym-device-token': 'pc-token',
    });
    expect(
      forwardedHeaders(new Headers(), { ...link, token: null }).has('x-gym-device-token'),
    ).toBe(false);
  });

  it('refuses a certificate that is not a certificate', () => {
    expect(isPairedCertificate('nonsense', FINGERPRINT)).toBe(false);
  });
});
