import { describe, expect, it } from 'vitest';
import { preparePhotoFile } from './member-photo-image';

describe('preparePhotoFile', () => {
  it('says the picture is unreadable when the file cannot be read', async () => {
    const unreadable = new Blob(['x']);
    Object.defineProperty(unreadable, 'arrayBuffer', {
      value: () => Promise.reject(new DOMException('could not be read', 'NotReadableError')),
    });
    await expect(preparePhotoFile(unreadable)).resolves.toEqual({
      ok: false,
      problem: 'photo_unreadable',
    });
  });

  it('refuses files that are not PNG, JPEG or WebP, whatever their name or type', async () => {
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: 'image/jpeg' });
    await expect(preparePhotoFile(svg)).resolves.toEqual({ ok: false, problem: 'photo_type' });
    await expect(preparePhotoFile(new Blob([]))).resolves.toEqual({
      ok: false,
      problem: 'photo_type',
    });
  });
});
