import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isMessageTemplateKey, type MessageTemplateKey } from '@gym/core';
import { requireClient, useActingClient } from '@/features/staff/admin-data';
import type { GymTemplate } from './message-text';

// Messages to members and the staff notifications (Phase 9). The database decides and records
// everything (supabase/migrations/20261029400000_notifications.sql); nothing is sent by the app.

export const NOTIFICATIONS_QUERY = 'notifications';

/** The gym's own wording of the templates it changed (the rest use the defaults). */
export function useMessageTemplates(enabled = true) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [NOTIFICATIONS_QUERY, actor, 'templates'],
    enabled: enabled && client !== undefined,
    queryFn: async (): Promise<ReadonlyMap<MessageTemplateKey, GymTemplate>> => {
      const { data, error } = await requireClient(client)
        .from('message_templates')
        .select('key, body_ckb, body_en, body_ar');
      if (error) throw error;
      const templates = new Map<MessageTemplateKey, GymTemplate>();
      for (const row of data) {
        if (!isMessageTemplateKey(row.key)) continue;
        templates.set(row.key, {
          key: row.key,
          bodyCkb: row.body_ckb,
          bodyEn: row.body_en,
          bodyAr: row.body_ar,
        });
      }
      return templates;
    },
  });
}

/** Saves a template's three texts; null is that language's default (all three: back to default). */
export function useSaveMessageTemplate() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (template: GymTemplate) => {
      const { error } = await requireClient(client).rpc('save_message_template', {
        p_key: template.key,
        // Left out: that language's default.
        ...(template.bodyCkb === null ? {} : { p_body_ckb: template.bodyCkb }),
        ...(template.bodyEn === null ? {} : { p_body_en: template.bodyEn }),
        ...(template.bodyAr === null ? {} : { p_body_ar: template.bodyAr }),
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_QUERY] }),
  });
}
