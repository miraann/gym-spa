import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { fetchMe, newRecoveryCodes, type MeRow } from '@/lib/api';
import type { SellerClient } from '@/lib/backend';
import { useSellerClient } from '@/lib/client';
import { PanelError, panelErrorKey, type PanelErrorKey } from '@/lib/errors';

/**
 * Where a platform admin is in signing in (spec §2.6), decided from seller_me() after every step:
 *   signed_out      → the login form;
 *   two_step_check  → they have a device but this session is aal1: the 6-digit code (or a
 *                     recovery code);
 *   new_password    → someone else chose their password;
 *   two_step_setup  → no device yet: enroll one (QR code), then the session is aal2;
 *   recovery_codes  → right after setting up a device: the new codes, shown once;
 *   ready           → the panel.
 */
export type Phase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'signed_out'; readonly notice: SignedOutNotice | null }
  | { readonly kind: 'two_step_check'; readonly me: MeRow }
  | { readonly kind: 'new_password'; readonly me: MeRow }
  | { readonly kind: 'two_step_setup'; readonly me: MeRow }
  | { readonly kind: 'recovery_codes'; readonly me: MeRow; readonly codes: readonly string[] }
  | { readonly kind: 'ready'; readonly me: MeRow };

/** Why the login form shows: nothing, or a reason to tell. */
export type SignedOutNotice = 'idle' | 'no_access' | 'session_ended';

interface Session {
  readonly phase: Phase;
  /** Reads seller_me() again and moves to the right step. */
  readonly refresh: () => Promise<void>;
  /** After a device was set up: makes the recovery codes and shows them once. */
  readonly afterTwoStepSetup: () => Promise<void>;
  /** The codes were saved: on to the panel. */
  readonly codesSaved: () => void;
  readonly signOut: (notice?: SignedOutNotice) => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession needs a SessionProvider');
  return session;
}

/** The signed-in admin, once the panel is open. */
export function useMe(): MeRow {
  const { phase } = useSession();
  if (phase.kind !== 'ready') throw new Error('useMe outside the panel');
  return phase.me;
}

async function decide(client: SellerClient): Promise<Phase> {
  const { data } = await client.auth.getSession();
  if (!data.session) return { kind: 'signed_out', notice: null };
  let me: MeRow | null;
  try {
    me = await fetchMe(client);
  } catch (error) {
    // Not a platform admin (gym staff, anyone else): they never get further than this.
    if (error instanceof PanelError && error.key === 'not_platform_admin') {
      await client.auth.signOut({ scope: 'local' });
      return { kind: 'signed_out', notice: 'no_access' };
    }
    if (error instanceof PanelError && error.key === 'unauthorized') {
      await client.auth.signOut({ scope: 'local' });
      return { kind: 'signed_out', notice: 'session_ended' };
    }
    throw error;
  }
  if (me === null) {
    await client.auth.signOut({ scope: 'local' });
    return { kind: 'signed_out', notice: 'no_access' };
  }
  if (me.has_two_step && !me.aal2) return { kind: 'two_step_check', me };
  if (me.must_change_password) return { kind: 'new_password', me };
  if (!me.has_two_step) return { kind: 'two_step_setup', me };
  return { kind: 'ready', me };
}

export function SessionProvider({
  children,
  onError,
}: {
  readonly children: ReactNode;
  /** A step failed for a reason other than the ones handled here (e.g. no network). */
  readonly onError: (key: PanelErrorKey) => void;
}) {
  const client = useSellerClient();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const deciding = useRef(0);

  const refresh = useCallback(async () => {
    const run = ++deciding.current;
    try {
      const next = await decide(client);
      if (run === deciding.current) setPhase(next);
    } catch (error) {
      onError(panelErrorKey(error));
      if (run === deciding.current)
        setPhase((current) =>
          current.kind === 'loading' ? { kind: 'signed_out', notice: null } : current,
        );
    }
  }, [client, onError]);

  const signOut = useCallback(
    async (notice: SignedOutNotice | null = null) => {
      deciding.current += 1;
      await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
      setPhase({ kind: 'signed_out', notice });
    },
    [client],
  );

  const afterTwoStepSetup = useCallback(async () => {
    const me = await fetchMe(client);
    if (me === null) throw new PanelError('not_platform_admin');
    const codes = await newRecoveryCodes(client);
    setPhase({ kind: 'recovery_codes', me, codes });
  }, [client]);

  const codesSaved = useCallback(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void refresh();
    // A session that ends elsewhere (refresh refused, the admin was deactivated) shows the login.
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setPhase((current) =>
          current.kind === 'signed_out' ? current : { kind: 'signed_out', notice: 'session_ended' },
        );
      }
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, [client, refresh]);

  const value = useMemo<Session>(
    () => ({
      phase,
      refresh,
      afterTwoStepSetup,
      codesSaved,
      signOut: (notice) => signOut(notice ?? null),
    }),
    [phase, refresh, afterTwoStepSetup, codesSaved, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
