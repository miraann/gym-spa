import { describe, expect, it } from 'vitest';
import {
  MEMBER_PHOTO_MAX_BYTES,
  MEMBER_PHOTO_TYPES,
  MEMBER_THUMBNAIL_MAX_BYTES,
  imageDataUrl,
  parseStoredImage,
} from './member-photos.ts';
import { latestFunctionBody, migrationsSql } from './sql-functions.test-helper.ts';

describe('parseStoredImage', () => {
  it('accepts WebP and JPEG within the size', () => {
    expect(parseStoredImage('image/webp', 'UklGRgAAAABXRUJQ', 100)).toEqual({
      type: 'image/webp',
      data: 'UklGRgAAAABXRUJQ',
    });
    expect(parseStoredImage('image/jpeg', '/9j/4AAQSkZJRg==', 100)?.type).toBe('image/jpeg');
  });

  it('refuses other types, bad base64 and pictures that are too large', () => {
    expect(parseStoredImage('image/png', 'iVBORw0KGgo=', 100)).toBeNull();
    expect(parseStoredImage('image/jpeg', '', 100)).toBeNull();
    expect(parseStoredImage('image/jpeg', 'not base64!', 100)).toBeNull();
    // 12 bytes of picture.
    expect(parseStoredImage('image/webp', 'UklGRgAAAABXRUJQ', 11)).toBeNull();
    expect(parseStoredImage('image/webp', 'UklGRgAAAABXRUJQ', 12)).not.toBeNull();
  });

  it('makes a data URL', () => {
    expect(imageDataUrl({ type: 'image/jpeg', data: '/9j/' })).toBe('data:image/jpeg;base64,/9j/');
  });
});

describe('the database', () => {
  it('limits photos and thumbnails to the same sizes and types', () => {
    const sql = migrationsSql().join('\n');
    expect(sql).toContain(
      `app.is_valid_image(photo, photo_type, ${String(MEMBER_PHOTO_MAX_BYTES)})`,
    );
    expect(sql).toContain(
      `app.is_valid_image(thumbnail, thumbnail_type, ${String(MEMBER_THUMBNAIL_MAX_BYTES)})`,
    );
    const setPhoto = latestFunctionBody('public.set_member_photo');
    expect(setPhoto).toContain(`p_photo_type, ${String(MEMBER_PHOTO_MAX_BYTES)})`);
    expect(setPhoto).toContain(`p_thumbnail_type, ${String(MEMBER_THUMBNAIL_MAX_BYTES)})`);
    const types = latestFunctionBody('app.is_valid_image');
    for (const type of MEMBER_PHOTO_TYPES) expect(types).toContain(`'${type}'`);
    expect(types).not.toContain('image/png');
  });
});
