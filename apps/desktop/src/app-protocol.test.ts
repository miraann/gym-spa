import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  APP_ORIGIN,
  contentType,
  isAppUrl,
  isExternalWebLink,
  resolveAppFile,
} from './app-protocol';

let base: string;
let webRoot: string;

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'gym-protocol-'));
  webRoot = path.join(base, 'web');
  await mkdir(path.join(webRoot, 'assets'), { recursive: true });
  await writeFile(path.join(webRoot, 'index.html'), '<!doctype html>');
  await writeFile(path.join(webRoot, 'assets', 'app.js'), '');
  await writeFile(path.join(webRoot, 'assets', 'font name.woff2'), '');
  // Next to the web root, so escaping it would reach this file.
  await writeFile(path.join(base, 'secret.txt'), 'secret');
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('resolveAppFile', () => {
  const resolve = (pathname: string) => resolveAppFile(webRoot, `${APP_ORIGIN}${pathname}`);

  it('serves files from the web root', async () => {
    expect(await resolve('/assets/app.js')).toBe(path.join(webRoot, 'assets', 'app.js'));
  });

  it('decodes escaped characters', async () => {
    expect(await resolve('/assets/font%20name.woff2')).toBe(
      path.join(webRoot, 'assets', 'font name.woff2'),
    );
  });

  it('serves index.html for the start page and for app routes', async () => {
    const index = path.join(webRoot, 'index.html');
    expect(await resolve('/')).toBe(index);
    expect(await resolve('/settings/display')).toBe(index);
    expect(await resolve('/settings/display?tab=1')).toBe(index);
  });

  it('does not turn missing files into index.html', async () => {
    expect(await resolve('/assets/missing.js')).toBeUndefined();
  });

  it('never leaves the web root', async () => {
    expect(await resolve('/../secret.txt')).toBeUndefined();
    expect(await resolve('/%2e%2e/secret.txt')).toBeUndefined();
    expect(await resolve('/..%2fsecret.txt')).toBeUndefined();
    expect(await resolve('/..%5csecret.txt')).toBeUndefined();
    expect(await resolve('/assets/..%2f..%2fsecret.txt')).toBeUndefined();
  });

  it('rejects broken escapes and other hosts', async () => {
    expect(await resolve('/%E0%A4%A')).toBeUndefined();
    expect(await resolveAppFile(webRoot, 'app://other-host/index.html')).toBeUndefined();
    expect(await resolveAppFile(webRoot, 'https://gym-spa/index.html')).toBeUndefined();
  });
});

describe('contentType', () => {
  it('gives module scripts and WebAssembly the types browsers require', () => {
    expect(contentType('/web/assets/index-abc.js')).toBe('text/javascript; charset=utf-8');
    expect(contentType('/web/assets/sqlite.wasm')).toBe('application/wasm');
    expect(contentType('/web/INDEX.HTML')).toBe('text/html; charset=utf-8');
  });

  it('falls back to a download type for unknown files', () => {
    expect(contentType('/web/data.bin')).toBe('application/octet-stream');
  });
});

describe('isAppUrl', () => {
  it('accepts only the app origin', () => {
    expect(isAppUrl(`${APP_ORIGIN}/settings/display`)).toBe(true);
    expect(isAppUrl('app://other-host/')).toBe(false);
    expect(isAppUrl('https://example.com/')).toBe(false);
    expect(isAppUrl('file:///C:/Windows/win.ini')).toBe(false);
    expect(isAppUrl('not a url')).toBe(false);
  });

  it('accepts the dev server only in development', () => {
    expect(isAppUrl('http://localhost:5173/members', 'http://localhost:5173')).toBe(true);
    expect(isAppUrl('http://localhost:5173/members')).toBe(false);
    expect(isAppUrl('http://localhost:9999/', 'http://localhost:5173')).toBe(false);
  });
});

describe('isExternalWebLink', () => {
  it('opens only https links in the browser', () => {
    expect(isExternalWebLink('https://wa.me/9647500000000')).toBe(true);
    expect(isExternalWebLink('http://example.com/')).toBe(false);
    expect(isExternalWebLink('file:///C:/Windows/System32/calc.exe')).toBe(false);
    expect(isExternalWebLink('javascript:alert(1)')).toBe(false);
  });
});
