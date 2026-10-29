import { RECEIPT_FOOTER_KEYS, resolveSetting, resolveTextSetting } from '@gym/core';
import type { Language } from '@gym/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireClient, useActingClient } from '@/features/staff/admin-data';

// The gym's receipt and payment settings (Phase 10, step 10d), gym-wide rows of settings
// (settings.edit; RLS allows gym-wide rows to staff who reach every branch).

const GYM_SETTINGS_QUERY = 'gym-settings';
const ON_CONFLICT = 'gym_id,branch_id,key';
const KEYS = [...Object.values(RECEIPT_FOOTER_KEYS), 'payments.usd_rate'];

export interface GymSettings {
  /** The receipt's bottom line per language; '' uses the usual thanks. */
  readonly footer: Readonly<Record<Language, string>>;
  /** Dinars a dollar is usually taken at; 0: none. */
  readonly usdRate: number;
}

export function useGymSettings() {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [GYM_SETTINGS_QUERY, actor],
    enabled: client !== undefined,
    queryFn: async (): Promise<GymSettings> => {
      const { data, error } = await requireClient(client)
        .from('settings')
        .select('branch_id, key, value')
        .in('key', KEYS)
        .is('branch_id', null);
      if (error) throw error;
      return {
        footer: {
          ckb: resolveTextSetting(RECEIPT_FOOTER_KEYS.ckb, data, null) ?? '',
          en: resolveTextSetting(RECEIPT_FOOTER_KEYS.en, data, null) ?? '',
          ar: resolveTextSetting(RECEIPT_FOOTER_KEYS.ar, data, null) ?? '',
        },
        usdRate: resolveSetting('payments.usd_rate', data, null),
      };
    },
  });
}

/** Saves them all at once; an empty footer line is removed (the usual thanks prints again). */
export function useSaveGymSettings() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: GymSettings) => {
      const db = requireClient(client);
      const footers = (Object.keys(RECEIPT_FOOTER_KEYS) as Language[]).map((language) => ({
        key: RECEIPT_FOOTER_KEYS[language],
        text: settings.footer[language].trim(),
      }));
      const { error } = await db
        .from('settings')
        .upsert(
          [
            { key: 'payments.usd_rate', value: settings.usdRate },
            ...footers
              .filter((each) => each.text !== '')
              .map((each) => ({ key: each.key, value: each.text })),
          ],
          { onConflict: ON_CONFLICT },
        );
      if (error) throw error;
      const empty = footers.filter((each) => each.text === '').map((each) => each.key);
      if (empty.length > 0) {
        const removed = await db.from('settings').delete().in('key', empty).is('branch_id', null);
        if (removed.error) throw removed.error;
      }
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [GYM_SETTINGS_QUERY] }),
        queryClient.invalidateQueries({ queryKey: ['settings'] }),
      ]),
  });
}
