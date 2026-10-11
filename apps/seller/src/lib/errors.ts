import type { SellerTexts } from '@gym/i18n';
import { SellerAdminError, isSellerAdminErrorKey } from '@gym/seller-admin';
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';

/** A reason the panel can explain: a key of seller:errors. */
export type PanelErrorKey = keyof SellerTexts['errors'];

/** Keys the seller_* database functions raise that the Edge Function's list doesn't have. */
const DATABASE_ONLY_KEYS = [
  'reason_required',
  'invalid_limit',
  'offline_gym',
  'gym_not_found',
] as const;

function isPanelKey(value: string): value is PanelErrorKey {
  // method_not_allowed: the panel only ever POSTs, so it has no text of its own.
  if (value === 'method_not_allowed') return false;
  return isSellerAdminErrorKey(value) || DATABASE_ONLY_KEYS.some((key) => key === value);
}

/** A failed call, with the key to show. The cause keeps the details for the console. */
export class PanelError extends Error {
  override readonly name = 'PanelError';
  constructor(
    readonly key: PanelErrorKey,
    options?: ErrorOptions,
  ) {
    super(key, options);
  }
}

interface PostgrestLikeError {
  readonly message: string;
  readonly code?: string;
}

/** A PostgREST error (an RPC): its message is the database's stable key when it has one. */
export function fromDatabase(error: PostgrestLikeError): PanelError {
  if (isPanelKey(error.message)) return new PanelError(error.message, { cause: error });
  if (error.code?.startsWith('PGRST30')) return new PanelError('unauthorized', { cause: error });
  if (error.message.includes('fetch')) return new PanelError('network', { cause: error });
  return new PanelError('unexpected', { cause: error });
}

/** An error from functions.invoke('seller-admin'): the body says { error: <key> }. */
export async function fromFunction(error: unknown): Promise<PanelError> {
  if (error instanceof FunctionsHttpError) {
    const response: unknown = error.context;
    if (response instanceof Response) {
      const body: unknown = await response.json().catch(() => null);
      const key =
        typeof body === 'object' && body !== null && 'error' in body ? body.error : undefined;
      if (typeof key === 'string' && isPanelKey(key)) return new PanelError(key, { cause: error });
    }
    return new PanelError('unexpected', { cause: error });
  }
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    return new PanelError('network', { cause: error });
  }
  return new PanelError('unexpected', { cause: error });
}

/** The key to show for anything a call threw. */
export function panelErrorKey(error: unknown): PanelErrorKey {
  if (error instanceof PanelError) return error.key;
  if (error instanceof SellerAdminError) return isPanelKey(error.key) ? error.key : 'unexpected';
  if (error instanceof TypeError) return 'network';
  return 'unexpected';
}
