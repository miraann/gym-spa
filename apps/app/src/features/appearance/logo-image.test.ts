import { describe, expect, it } from 'vitest';
import { prepareLogo } from './logo-image';

describe('prepareLogo', () => {
  it('says the picture is unreadable when the file cannot be read', async () => {
    // What Android's WebView did once with a file from the photo picker.
    const unreadable = new Blob(['x']);
    Object.defineProperty(unreadable, 'arrayBuffer', {
      value: () => Promise.reject(new DOMException('could not be read', 'NotReadableError')),
    });
    await expect(prepareLogo(unreadable)).resolves.toEqual({
      ok: false,
      problem: 'logo_unreadable',
    });
  });

  it('refuses files that are not PNG, JPEG or WebP, whatever their name or type', async () => {
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: 'image/png' });
    await expect(prepareLogo(svg)).resolves.toEqual({ ok: false, problem: 'logo_type' });
    await expect(prepareLogo(new Blob([]))).resolves.toEqual({ ok: false, problem: 'logo_type' });
  });
});
