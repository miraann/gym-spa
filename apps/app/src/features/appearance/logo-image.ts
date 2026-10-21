import { LOGO_MAX_BYTES, LOGO_MAX_SIDE, type StoredLogo } from '@gym/core';
import { encodeImage, readImageFile } from '@/lib/image';

/** Why a picture can't be the logo; the Appearance page translates it. */
export type LogoProblem = 'logo_type' | 'logo_unreadable' | 'logo_too_large';

export type PreparedLogo =
  | { readonly ok: true; readonly logo: StoredLogo }
  | { readonly ok: false; readonly problem: LogoProblem };

const MIN_SIDE = 96;

/**
 * Turns a picked file into the stored logo (spec §6.1): PNG, JPEG or WebP only (checked by the
 * file's own bytes, so an SVG or a renamed file is refused), resized to fit LOGO_MAX_SIDE, and
 * saved as WebP (PNG where the browser can't write WebP, which also keeps transparency) of at most
 * LOGO_MAX_BYTES. The database checks the type and size again.
 */
export async function prepareLogo(file: Blob): Promise<PreparedLogo> {
  const read = await readImageFile(file);
  if (!read.ok) return { ok: false, problem: `logo_${read.problem}` };
  try {
    const encoded = await encodeImage(read.bitmap, {
      maxSide: LOGO_MAX_SIDE,
      minSide: MIN_SIDE,
      maxBytes: LOGO_MAX_BYTES,
      types: ['image/webp', 'image/png'],
    });
    return encoded.ok
      ? { ok: true, logo: encoded.image }
      : { ok: false, problem: `logo_${encoded.problem}` };
  } finally {
    read.bitmap.close();
  }
}
