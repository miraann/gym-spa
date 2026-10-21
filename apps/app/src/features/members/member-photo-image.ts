import {
  MEMBER_PHOTO_MAX_BYTES,
  MEMBER_PHOTO_MAX_SIDE,
  MEMBER_THUMBNAIL_MAX_BYTES,
  MEMBER_THUMBNAIL_SIDE,
  type MemberPhotoType,
  type StoredImage,
} from '@gym/core';
import { encodeImage, readImageFile, type EncodedImage } from '@/lib/image';

/** Why a picture can't be the member's photo; the photo card translates it. */
export type PhotoProblem = 'photo_type' | 'photo_unreadable' | 'photo_too_large';

export interface PreparedPhoto {
  readonly photo: StoredImage;
  readonly thumbnail: StoredImage;
}

export type PhotoResult =
  | { readonly ok: true; readonly prepared: PreparedPhoto }
  | { readonly ok: false; readonly problem: PhotoProblem };

const TYPES: readonly MemberPhotoType[] = ['image/webp', 'image/jpeg'];

function asPhotoImage(image: EncodedImage): StoredImage | null {
  return image.type === 'image/png' ? null : { type: image.type, data: image.data };
}

/**
 * The stored photo and thumbnail from a picture (spec §4.1): the photo fits MEMBER_PHOTO_MAX_SIDE,
 * the thumbnail is the middle square at MEMBER_THUMBNAIL_SIDE; both WebP (JPEG where the device
 * can't write WebP) within their sizes. The database checks the type and sizes again.
 */
export async function preparePhoto(source: ImageBitmap): Promise<PhotoResult> {
  const photo = await encodeImage(source, {
    maxSide: MEMBER_PHOTO_MAX_SIDE,
    minSide: 160,
    maxBytes: MEMBER_PHOTO_MAX_BYTES,
    types: TYPES,
  });
  if (!photo.ok) return { ok: false, problem: `photo_${photo.problem}` };
  const thumbnail = await encodeImage(source, {
    maxSide: MEMBER_THUMBNAIL_SIDE,
    minSide: 48,
    maxBytes: MEMBER_THUMBNAIL_MAX_BYTES,
    types: TYPES,
    crop: 'square',
  });
  if (!thumbnail.ok) return { ok: false, problem: `photo_${thumbnail.problem}` };
  const storedPhoto = asPhotoImage(photo.image);
  const storedThumbnail = asPhotoImage(thumbnail.image);
  if (!storedPhoto || !storedThumbnail) return { ok: false, problem: 'photo_unreadable' };
  return { ok: true, prepared: { photo: storedPhoto, thumbnail: storedThumbnail } };
}

/** The photo from a picked file: PNG, JPEG or WebP only, by the file's own bytes. */
export async function preparePhotoFile(file: Blob): Promise<PhotoResult> {
  const read = await readImageFile(file);
  if (!read.ok) return { ok: false, problem: `photo_${read.problem}` };
  try {
    return await preparePhoto(read.bitmap);
  } finally {
    read.bitmap.close();
  }
}
