import { useDeviceGym } from '@/features/auth/auth-context';
import { useConnection } from '@/lib/connection';

/**
 * Whether the admin screens can change anything right now: only while connected, and a read-only
 * gym can still take access away (deactivate, reset a password or PIN) but add or change nothing.
 */
export function useAdminWriteState(): { readonly online: boolean; readonly readOnly: boolean } {
  const online = useConnection().state === 'connected';
  const readOnly = useDeviceGym()?.access === 'read_only';
  return { online, readOnly };
}
