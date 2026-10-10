import { logError } from './logger';

/** Why saving failed, as a key the screens translate (common:saveErrors). */
export type SaveErrorKey = 'network' | 'gym_read_only' | 'forbidden' | 'invalid' | 'unexpected';

function field(error: unknown, name: 'code' | 'message'): unknown {
  return typeof error === 'object' && error !== null && name in error
    ? (error as Record<string, unknown>)[name]
    : undefined;
}

/**
 * Sorts a failed write (PostgREST error, or fetch failing) into a key. Guards reject with a stable
 * key as the message; RLS and permission errors are 42501, broken check constraints 23514.
 * Unexpected errors are logged with their details.
 */
export function saveErrorKey(error: unknown, area: string): SaveErrorKey {
  const message = field(error, 'message');
  const code = field(error, 'code');
  if (error instanceof TypeError || message === 'Failed to fetch') return 'network';
  if (message === 'gym_read_only') return 'gym_read_only';
  if (code === '42501') return 'forbidden';
  if (code === '23514' || code === '22023') return 'invalid';
  logError(error, { area, action: 'save' });
  return 'unexpected';
}
