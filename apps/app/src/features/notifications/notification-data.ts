import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MESSAGE_TEMPLATE_KEYS,
  baghdadDateOf,
  isMessageTemplateKey,
  parseMessageNames,
  parseReminderDetails,
  type MessageNames,
  type MessageTemplateKey,
  type ReminderDetails,
} from '@gym/core';
import { isLanguage, type Language } from '@gym/i18n';
import { requireClient, useActingClient } from '@/features/staff/admin-data';
import { BELL_DAYS } from './bell-groups';
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

/** The member a message is for, with what the message needs. */
export interface MessageMember {
  readonly id: string;
  readonly fullName: string;
  readonly memberNumber: number | null;
  readonly phone: string | null;
  readonly emergencyPhone: string | null;
  readonly emergencyContactName: string | null;
  readonly preferredLanguage: Language;
  readonly branchId: string;
}

export interface Reminder {
  readonly id: string;
  readonly kind: MessageTemplateKey;
  readonly remindOn: string;
  readonly branchId: string;
  readonly details: ReminderDetails;
  readonly doneAt: string | null;
  /** When WhatsApp was last opened for it. */
  readonly openedAt: string | null;
  readonly member: MessageMember;
}

/** How often the open reminders page collects today's again itself (the cloud's job runs too). */
const COLLECT_EVERY_MS = 5 * 60_000;
let lastCollected = 0;

/**
 * The reminders of a day in the branches the staff member reaches (notifications.send). For today,
 * the gym's reminders are collected first (at most every five minutes): the offline edition has no
 * scheduled job, and a member registered a minute ago shows at once.
 */
export function useReminders(day: string, today: string) {
  const { client, actor } = useActingClient();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: [NOTIFICATIONS_QUERY, actor, 'reminders', day],
    enabled: client !== undefined,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Reminder[]> => {
      const db = requireClient(client);
      if (day === today && Date.now() - lastCollected > COLLECT_EVERY_MS) {
        const collected = await db.rpc('refresh_reminders');
        if (collected.error) throw collected.error;
        lastCollected = Date.now();
        // Collecting may have added to the bell.
        void queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_QUERY, actor, 'bell'] });
      }
      const { data, error } = await db
        .from('reminders')
        .select(
          'id, kind, remind_on, branch_id, details, done_at, member_messages (created_at), members (id, full_name, member_number, phone, emergency_phone, emergency_contact_name, preferred_language, branch_id)',
        )
        .eq('remind_on', day)
        .order('created_at');
      if (error) throw error;
      const reminders: Reminder[] = [];
      for (const row of data) {
        // Hidden by RLS without members.view, whatever the generated types say.
        const member = row.members as typeof row.members | null;
        if (!member || !isMessageTemplateKey(row.kind)) continue;
        const opened = row.member_messages.map((message) => message.created_at).sort();
        reminders.push({
          id: row.id,
          kind: row.kind,
          remindOn: row.remind_on,
          branchId: row.branch_id,
          details: parseReminderDetails(row.details),
          doneAt: row.done_at,
          openedAt: opened.at(-1) ?? null,
          member: {
            id: member.id,
            fullName: member.full_name,
            memberNumber: member.member_number,
            phone: member.phone,
            emergencyPhone: member.emergency_phone,
            emergencyContactName: member.emergency_contact_name,
            preferredLanguage: isLanguage(member.preferred_language)
              ? member.preferred_language
              : 'ckb',
            branchId: member.branch_id,
          },
        });
      }
      const order = (kind: MessageTemplateKey) => MESSAGE_TEMPLATE_KEYS.indexOf(kind);
      return reminders.sort(
        (a, b) =>
          order(a.kind) - order(b.kind) || a.member.fullName.localeCompare(b.member.fullName),
      );
    },
  });
}

export function useSetReminderDone() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; done: boolean }) => {
      const { error } = await requireClient(client).rpc('set_reminder_done', {
        p_id: input.id,
        p_done: input.done,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_QUERY] }),
  });
}

/** What a message written now can say about a member (their membership, debt, next booking). */
export function useMemberMessageDetails(memberId: string, enabled: boolean) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [NOTIFICATIONS_QUERY, actor, 'member-details', memberId],
    enabled: enabled && client !== undefined,
    queryFn: async (): Promise<ReminderDetails> => {
      const { data, error } = await requireClient(client).rpc('member_message_details', {
        p_member_id: memberId,
      });
      if (error) throw error;
      return parseReminderDetails(data);
    },
  });
}

/** When WhatsApp was last opened for a member, in the branches the staff member reaches. */
export function useLastMessage(memberId: string, enabled: boolean) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [NOTIFICATIONS_QUERY, actor, 'last-message', memberId],
    enabled: enabled && client !== undefined,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await requireClient(client)
        .from('member_messages')
        .select('created_at')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.created_at ?? null;
    },
  });
}

/** Writes down that WhatsApp was opened (after opening it: a browser blocks a late new tab). */
export function useRecordMessageOpened() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      branchId: string;
      memberId: string;
      phone: string;
      language: Language;
      body: string;
      templateKey: MessageTemplateKey | null;
      reminderId: string | null;
    }) => {
      const { error } = await requireClient(client).rpc('record_message_opened', {
        p_id: input.id,
        p_branch_id: input.branchId,
        p_member_id: input.memberId,
        p_phone: input.phone,
        p_language: input.language,
        p_body: input.body,
        ...(input.templateKey === null ? {} : { p_template_key: input.templateKey }),
        ...(input.reminderId === null ? {} : { p_reminder_id: input.reminderId }),
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_QUERY] }),
  });
}

/** One of the bell's notifications. */
export type StaffNotification =
  | {
      readonly id: string;
      readonly kind: 'reminders_ready';
      readonly branchId: string;
      readonly subjectId: string;
      readonly notifyOn: string;
      readonly createdAt: string;
      readonly read: boolean;
      readonly count: number;
    }
  | {
      readonly id: string;
      readonly kind: 'low_stock';
      readonly branchId: string;
      readonly subjectId: string;
      readonly notifyOn: string;
      readonly createdAt: string;
      readonly read: boolean;
      readonly product: MessageNames;
      readonly quantity: number;
    };

/** The bell: the last 7 days' notifications of the staff member's branches and permissions. */
export function useStaffNotifications(enabled: boolean) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [NOTIFICATIONS_QUERY, actor, 'bell'],
    enabled: enabled && client !== undefined,
    refetchInterval: 60_000,
    queryFn: async (): Promise<StaffNotification[]> => {
      const since = baghdadDateOf(Date.now() - (BELL_DAYS - 1) * 86_400_000);
      const { data, error } = await requireClient(client)
        .from('staff_notifications')
        // The read marks are the staff member's own (RLS).
        .select(
          'id, kind, branch_id, subject_id, notify_on, created_at, details, staff_notification_reads (id)',
        )
        .gte('notify_on', since)
        .order('notify_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      const notifications: StaffNotification[] = [];
      for (const row of data) {
        // Always an object (a check constraint).
        const details = row.details as Record<string, unknown>;
        const base = {
          id: row.id,
          branchId: row.branch_id,
          subjectId: row.subject_id,
          notifyOn: row.notify_on,
          createdAt: row.created_at,
          read: row.staff_notification_reads.length > 0,
        };
        if (row.kind === 'reminders_ready') {
          notifications.push({
            ...base,
            kind: 'reminders_ready',
            count: Number(details.count) || 0,
          });
        } else if (row.kind === 'low_stock') {
          const product = parseMessageNames(details.product);
          if (!product) continue;
          notifications.push({
            ...base,
            kind: 'low_stock',
            product,
            quantity: Number(details.quantity) || 0,
          });
        }
      }
      return notifications;
    },
  });
}

/**
 * The bell's "still to send": per day of the last 7 and branch, the reminders not done yet
 * (bell_reminders_left; only staff who send messages see reminders).
 */
export function useBellRemindersLeft(enabled: boolean) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [NOTIFICATIONS_QUERY, actor, 'bell', 'left'],
    enabled: enabled && client !== undefined,
    refetchInterval: 60_000,
    queryFn: async (): Promise<ReadonlyMap<string, number>> => {
      const since = baghdadDateOf(Date.now() - (BELL_DAYS - 1) * 86_400_000);
      const { data, error } = await requireClient(client).rpc('bell_reminders_left', {
        p_since: since,
      });
      if (error) throw error;
      // Per day, every branch together.
      const left = new Map<string, number>();
      for (const row of data)
        left.set(row.remind_on, (left.get(row.remind_on) ?? 0) + row.left_count);
      return left;
    },
  });
}

export function useMarkNotificationsRead() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: readonly string[]) => {
      const { error } = await requireClient(client).rpc('mark_notifications_read', {
        p_ids: [...ids],
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_QUERY] }),
  });
}
