/**
 * Single place for technical error details. Users only ever see translated messages;
 * later phases can also forward these logs to the server.
 */
export function logError(error: unknown, context: Record<string, unknown> = {}): void {
  console.error('[gym]', error, context);
}
