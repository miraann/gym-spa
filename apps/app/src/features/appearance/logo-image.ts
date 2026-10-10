import {
  LOGO_MAX_BYTES,
  LOGO_MAX_SIDE,
  sniffImageType,
  type LogoType,
  type StoredLogo,
} from '@gym/core';

/** Why a picture can't be the logo; the Appearance page translates it. */
export type LogoProblem = 'logo_type' | 'logo_unreadable' | 'logo_too_large';

export type PreparedLogo =
  | { readonly ok: true; readonly logo: StoredLogo }
  | { readonly ok: false; readonly problem: LogoProblem };

/** Quality steps for WebP/JPEG, then smaller sizes, until the file fits LOGO_MAX_BYTES. */
const QUALITIES = [0.92, 0.85, 0.75, 0.6] as const;
const SHRINK = 0.8;
const MIN_SIDE = 96;

function toBlob(canvas: HTMLCanvasElement, type: LogoType, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  // In chunks: String.fromCharCode with too many arguments overflows the stack.
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

/**
 * Turns a picked file into the stored logo (spec §6.1): PNG, JPEG or WebP only (checked by the
 * file's own bytes, so an SVG or a renamed file is refused), resized to fit LOGO_MAX_SIDE, and
 * saved as WebP (PNG where the browser can't write WebP) of at most LOGO_MAX_BYTES. The database
 * checks the type and size again.
 */
export async function prepareLogo(file: Blob): Promise<PreparedLogo> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!sniffImageType(head)) return { ok: false, problem: 'logo_type' };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, problem: 'logo_unreadable' };
  }

  try {
    let side = Math.min(LOGO_MAX_SIDE, Math.max(bitmap.width, bitmap.height));
    while (side >= MIN_SIDE) {
      const scale = side / Math.max(bitmap.width, bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) return { ok: false, problem: 'logo_unreadable' };
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of QUALITIES) {
        const blob = await toBlob(canvas, 'image/webp', quality);
        if (!blob) return { ok: false, problem: 'logo_unreadable' };
        const bytes = new Uint8Array(await blob.arrayBuffer());
        // A browser that can't write WebP writes PNG instead; the bytes say which.
        const type = sniffImageType(bytes);
        if (type && bytes.length <= LOGO_MAX_BYTES) {
          return { ok: true, logo: { type, data: toBase64(bytes) } };
        }
        if (type === 'image/png') break; // PNG ignores quality: only a smaller size helps.
      }
      side = Math.floor(side * SHRINK);
    }
    return { ok: false, problem: 'logo_too_large' };
  } finally {
    bitmap.close();
  }
}
