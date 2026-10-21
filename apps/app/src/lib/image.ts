import { sniffImageType, type LogoType } from '@gym/core';

// Pictures kept in Postgres (the logo, member photos): read a picked file safely, then resize and
// encode it until it fits its size limit. The callers check the result's type and size against
// their own rules; the database checks them again.

export type ImageProblem = 'type' | 'unreadable' | 'too_large';

export interface EncodedImage {
  readonly type: LogoType;
  /** base64, without a data: prefix */
  readonly data: string;
}

/**
 * A picked file as a bitmap: PNG, JPEG or WebP only, by the file's own bytes (an SVG or a renamed
 * file is refused). The caller closes the bitmap.
 */
export async function readImageFile(
  file: Blob,
): Promise<
  | { readonly ok: true; readonly bitmap: ImageBitmap }
  | { readonly ok: false; readonly problem: ImageProblem }
> {
  // Read the whole file into memory at once. On Android the file comes from the photo picker
  // through a temporary grant, and a read can fail (NotReadableError, seen on the first pick after
  // a device starts): that is a picture we can't read, not a crash.
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return { ok: false, problem: 'unreadable' };
  }
  if (!sniffImageType(new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength)))) {
    return { ok: false, problem: 'type' };
  }
  try {
    return { ok: true, bitmap: await createImageBitmap(new Blob([bytes])) };
  } catch {
    return { ok: false, problem: 'unreadable' };
  }
}

/** Quality steps for WebP/JPEG, then smaller sizes, until the file fits. */
const QUALITIES = [0.92, 0.85, 0.75, 0.6] as const;
const SHRINK = 0.8;

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

export interface EncodeOptions {
  /** Longest side to start from (never larger than the picture). */
  readonly maxSide: number;
  /** Below this the picture is "too large" rather than shrunk further. */
  readonly minSide: number;
  readonly maxBytes: number;
  /** Tried in order; a browser that can't write one (WebP) writes PNG instead, and the next is tried. */
  readonly types: readonly LogoType[];
  /** square: cut the middle square of the picture (thumbnails). */
  readonly crop?: 'square';
}

/** Resizes and encodes the picture until it fits maxBytes. */
export async function encodeImage(
  source: ImageBitmap,
  options: EncodeOptions,
): Promise<
  | { readonly ok: true; readonly image: EncodedImage }
  | { readonly ok: false; readonly problem: ImageProblem }
> {
  const cropSide = Math.min(source.width, source.height);
  const sourceWidth = options.crop === 'square' ? cropSide : source.width;
  const sourceHeight = options.crop === 'square' ? cropSide : source.height;
  const sourceX = (source.width - sourceWidth) / 2;
  const sourceY = (source.height - sourceHeight) / 2;

  let side = Math.min(options.maxSide, Math.max(sourceWidth, sourceHeight));
  while (side >= options.minSide) {
    const scale = side / Math.max(sourceWidth, sourceHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return { ok: false, problem: 'unreadable' };
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      source,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    for (const type of options.types) {
      for (const quality of QUALITIES) {
        const blob = await toBlob(canvas, type, quality);
        if (!blob) return { ok: false, problem: 'unreadable' };
        const bytes = new Uint8Array(await blob.arrayBuffer());
        // The bytes say what the browser really wrote.
        const written = sniffImageType(bytes);
        if (written !== type) break;
        if (bytes.length <= options.maxBytes) {
          return { ok: true, image: { type, data: toBase64(bytes) } };
        }
        if (type === 'image/png') break; // PNG ignores quality: only a smaller size helps.
      }
    }
    side = Math.floor(side * SHRINK);
  }
  return { ok: false, problem: 'too_large' };
}
