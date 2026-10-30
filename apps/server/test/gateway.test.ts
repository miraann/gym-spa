import { describe, expect, it } from 'vitest';
import {
  authPathIsAdmin,
  authPathIsPublic,
  credentials,
  isLoopback,
  route,
  type GatewayKeys,
} from '../src/gateway.ts';

const keys: GatewayKeys = {
  publishableKey: 'sb_publishable_test',
  secretKey: 'sb_secret_test',
  anonToken: 'anon.jwt',
  serviceToken: 'service.jwt',
};

describe('route', () => {
  it('sends /auth/v1 and /rest/v1 on without their prefix, query included', () => {
    expect(route('/auth/v1/token?grant_type=password')).toEqual({
      kind: 'auth',
      path: '/token?grant_type=password',
    });
    expect(route('/rest/v1/members?select=id')).toEqual({
      kind: 'rest',
      path: '/members?select=id',
    });
    expect(route('/rest/v1')).toEqual({ kind: 'rest', path: '/' });
    expect(route('/rest/v1?select=x')).toEqual({ kind: 'rest', path: '/?select=x' });
  });

  it('knows the staff module and its health, and nothing else', () => {
    expect(route('/functions/v1/staff-admin')).toEqual({ kind: 'staff-admin' });
    expect(route('/server/v1/health')).toEqual({ kind: 'health' });
    expect(route('/server/v1/info')).toEqual({ kind: 'info' });
    expect(route('/server/v1/info?x=1')).toEqual({ kind: 'info' });
    expect(route('/functions/v1/seller-admin')).toEqual({ kind: 'not_found' });
    expect(route('/auth/v10/token')).toEqual({ kind: 'not_found' });
    expect(route('/rest/v1x')).toEqual({ kind: 'not_found' });
    expect(route('/')).toEqual({ kind: 'not_found' });
  });
});

describe('credentials', () => {
  it('swaps the publishable key for the anon token', () => {
    expect(credentials({ apikey: keys.publishableKey }, keys, false)).toEqual({
      ok: true,
      authorization: 'Bearer anon.jwt',
      service: false,
    });
    expect(
      credentials(
        { apikey: keys.publishableKey, authorization: `Bearer ${keys.publishableKey}` },
        keys,
        false,
      ),
    ).toMatchObject({ ok: true, authorization: 'Bearer anon.jwt' });
  });

  it('passes a session token on as it is', () => {
    expect(
      credentials(
        { apikey: keys.publishableKey, authorization: 'Bearer user.session.jwt' },
        keys,
        false,
      ),
    ).toEqual({ ok: true, authorization: 'Bearer user.session.jwt', service: false });
  });

  it('gives the service token for the secret key only on the server PC itself', () => {
    expect(credentials({ apikey: keys.secretKey }, keys, true)).toEqual({
      ok: true,
      authorization: 'Bearer service.jwt',
      service: true,
    });
    expect(
      credentials(
        { apikey: keys.publishableKey, authorization: `Bearer ${keys.secretKey}` },
        keys,
        true,
      ),
    ).toMatchObject({ service: true });
    expect(credentials({ apikey: keys.secretKey }, keys, false)).toEqual({
      ok: false,
      status: 403,
      message: 'secret_key_not_allowed',
    });
    expect(
      credentials(
        { apikey: keys.publishableKey, authorization: `Bearer ${keys.secretKey}` },
        keys,
        false,
      ),
    ).toMatchObject({ ok: false, status: 403 });
  });

  it('refuses a request without a known key', () => {
    expect(credentials({}, keys, true)).toMatchObject({ ok: false, status: 401 });
    expect(credentials({ apikey: 'sb_publishable_other' }, keys, false)).toMatchObject({
      ok: false,
      status: 401,
    });
    expect(credentials({ authorization: 'Bearer user.session.jwt' }, keys, false)).toMatchObject({
      ok: false,
      status: 401,
    });
  });
});

describe('auth paths', () => {
  it('lets the health check and the public key set through without a key', () => {
    expect(authPathIsPublic('/health')).toBe(true);
    expect(authPathIsPublic('/.well-known/jwks.json')).toBe(true);
    expect(authPathIsPublic('/token?grant_type=password')).toBe(false);
    expect(authPathIsPublic('/admin/users')).toBe(false);
  });

  it('recognises the admin API', () => {
    expect(authPathIsAdmin('/admin/users')).toBe(true);
    expect(authPathIsAdmin('/admin/users/abc?x=1')).toBe(true);
    expect(authPathIsAdmin('/admin')).toBe(true);
    expect(authPathIsAdmin('/administrator')).toBe(false);
    expect(authPathIsAdmin('/user')).toBe(false);
  });
});

describe('isLoopback', () => {
  it('accepts only the server PC itself', () => {
    expect(isLoopback('127.0.0.1')).toBe(true);
    expect(isLoopback('127.8.9.10')).toBe(true);
    expect(isLoopback('::1')).toBe(true);
    expect(isLoopback('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopback('192.168.1.20')).toBe(false);
    expect(isLoopback('::ffff:192.168.1.20')).toBe(false);
    expect(isLoopback('fe80::1')).toBe(false);
    expect(isLoopback(undefined)).toBe(false);
  });
});
