// The camera, for member photos (step 2c). The web API (getUserMedia) works in all three targets:
// the browser asks the user, the Windows app allows video only (apps/desktop main.ts), and the
// Android app declares the CAMERA permission, which Capacitor's WebView asks for on first use.
// A native camera plugin (iOS later) would go here, behind the same functions.

/** Why the camera didn't open; the app translates it. */
export type CameraProblem = 'unsupported' | 'denied' | 'no_camera' | 'busy' | 'unavailable';

export type CameraResult =
  | { readonly ok: true; readonly stream: MediaStream }
  | { readonly ok: false; readonly problem: CameraProblem };

/** Whether this device can show a live camera at all (no secure origin or no API: no). */
export function cameraSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'mediaDevices' in navigator &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

function problemOf(error: unknown): CameraProblem {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'no_camera';
    case 'NotReadableError':
    case 'AbortError':
      return 'busy';
    default:
      return 'unavailable';
  }
}

/** Opens the front (user-facing) camera, video only. Stop it with stopCamera when done. */
export async function openCamera(): Promise<CameraResult> {
  if (!cameraSupported()) return { ok: false, problem: 'unsupported' };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
    });
    return { ok: true, stream };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

/** Turns the camera off (its light too). */
export function stopCamera(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}
