import { base64Bytes } from './appearance.ts';

// Member photos (spec §4.1, step 2c): kept in Postgres like the logo. The app makes the photo and
// its thumbnail; the database (app.is_valid_image, set_member_photo) checks type and size again.

/** The most a stored photo may weigh; the database checks the same (153600). */
export const MEMBER_PHOTO_MAX_BYTES = 150 * 1024;
/** Photos are resized to fit this square before saving. */
export const MEMBER_PHOTO_MAX_SIDE = 480;
/** The most a thumbnail may weigh; the database checks the same (12288). */
export const MEMBER_THUMBNAIL_MAX_BYTES = 12 * 1024;
/** Thumbnails are this square, cut from the middle of the photo, for lists and avatars. */
export const MEMBER_THUMBNAIL_SIDE = 128;
/** WebP, or JPEG where the device can't write WebP. */
export const MEMBER_PHOTO_TYPES = ['image/webp', 'image/jpeg'] as const;
export type MemberPhotoType = (typeof MEMBER_PHOTO_TYPES)[number];

export interface StoredImage {
  readonly type: MemberPhotoType;
  /** base64, without a data: prefix */
  readonly data: string;
}

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** A stored photo or thumbnail if it is valid: a known type, base64, at most maxBytes. */
export function parseStoredImage(type: string, data: string, maxBytes: number): StoredImage | null {
  const known = MEMBER_PHOTO_TYPES.find((each) => each === type);
  if (!known || data.length === 0 || !BASE64.test(data)) return null;
  return base64Bytes(data) <= maxBytes ? { type: known, data } : null;
}

export function imageDataUrl(image: StoredImage): string {
  return `data:${image.type};base64,${image.data}`;
}
