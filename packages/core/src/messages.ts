// Messages to members (Phase 9): the templates, filling them in, the number they go to, and the
// WhatsApp link. Nothing is ever sent by the app or the server: staff open WhatsApp with the text
// and press Send themselves. The database keeps the same template keys
// (supabase/migrations/20261029400000_notifications.sql, app.is_message_template_key).

/** The nine templates, in the order the screens list them. */
export const MESSAGE_TEMPLATE_KEYS = [
  'expiring_7',
  'expiring_3',
  'expiring_1',
  'expired',
  'installment_due',
  'debt',
  'spa_booking',
  'welcome',
  'birthday',
] as const;
export type MessageTemplateKey = (typeof MESSAGE_TEMPLATE_KEYS)[number];

export function isMessageTemplateKey(value: unknown): value is MessageTemplateKey {
  return MESSAGE_TEMPLATE_KEYS.some((key) => key === value);
}

/** What a template may say, written `{name}` in every language. */
export const MESSAGE_PLACEHOLDERS = [
  'name',
  'gym',
  'branch',
  'number',
  'plan',
  'end_date',
  'days',
  'amount',
  'due_date',
  'service',
  'date',
  'time',
] as const;
export type MessagePlaceholder = (typeof MESSAGE_PLACEHOLDERS)[number];
export type MessageValues = Partial<Readonly<Record<MessagePlaceholder, string>>>;

/** The placeholders each template can fill; the editor offers these first. */
export const TEMPLATE_PLACEHOLDERS: Readonly<
  Record<MessageTemplateKey, readonly MessagePlaceholder[]>
> = {
  expiring_7: ['name', 'gym', 'plan', 'end_date', 'days'],
  expiring_3: ['name', 'gym', 'plan', 'end_date', 'days'],
  expiring_1: ['name', 'gym', 'plan', 'end_date', 'days'],
  expired: ['name', 'gym', 'plan', 'end_date'],
  installment_due: ['name', 'gym', 'amount', 'due_date'],
  debt: ['name', 'gym', 'amount'],
  spa_booking: ['name', 'gym', 'branch', 'service', 'date', 'time'],
  welcome: ['name', 'gym', 'number'],
  birthday: ['name', 'gym'],
};

export const MESSAGE_LIMITS = {
  /** A template's text, per language. */
  maxTemplateLength: 1000,
  /** A filled-in message. */
  maxMessageLength: 2000,
} as const;

const PLACEHOLDER = /\{([a-z_]+)\}/g;

function isPlaceholder(value: string): value is MessagePlaceholder {
  return MESSAGE_PLACEHOLDERS.some((key) => key === value);
}

/**
 * Fills a template: each known `{placeholder}` becomes its value, or nothing when it has none.
 * Anything else in braces stays as written. Spaces left doubled by an empty value are tidied.
 */
export function fillMessage(template: string, values: MessageValues): string {
  return template
    .replace(PLACEHOLDER, (whole, key: string) =>
      isPlaceholder(key) ? (values[key] ?? '') : whole,
    )
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([،,.!?؟])/g, '$1')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

/** The placeholders a text uses that aren't known (a typo such as `{nme}`). */
export function unknownPlaceholders(template: string): string[] {
  const unknown = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER)) {
    const key = match[1] ?? '';
    if (!isPlaceholder(key)) unknown.add(key);
  }
  return [...unknown];
}

/** Whether a template's text may be saved: 1 to 1,000 characters, no control characters but line breaks. */
export function isValidTemplateText(text: string): boolean {
  return (
    text.length >= 1 &&
    text.length <= MESSAGE_LIMITS.maxTemplateLength &&
    text === text.trim() &&
    // eslint-disable-next-line no-control-regex -- the control characters are what is refused
    !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(text)
  );
}

/** The number a member's messages go to: their own, else the emergency contact's (step 2a allows no own phone). */
export function messagePhone(member: {
  readonly phone: string | null;
  readonly emergencyPhone: string | null;
}): { readonly phone: string; readonly toEmergencyContact: boolean } | null {
  if (member.phone) return { phone: member.phone, toEmergencyContact: false };
  if (member.emergencyPhone) return { phone: member.emergencyPhone, toEmergencyContact: true };
  return null;
}

/**
 * The click-to-chat link for a stored phone (`+9647501234567`) and a text: the number in
 * international digits without `+`, the text URL-encoded. Null for a number WhatsApp can't take.
 */
export function whatsAppLink(phone: string, text: string): string | null {
  const digits = phone.replace(/[\s()-]/g, '').replace(/^\+/, '');
  if (!/^[1-9][0-9]{7,14}$/.test(digits)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/**
 * The only links the app opens outside itself: WhatsApp's click to chat (https://wa.me/ and
 * https://api.whatsapp.com/), with no user name, password or port. The Windows app's main process
 * checks the same rule (apps/desktop/src/app-protocol.ts).
 */
export function isWhatsAppUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === 'https:' &&
    (parsed.hostname === 'wa.me' || parsed.hostname === 'api.whatsapp.com') &&
    parsed.username === '' &&
    parsed.password === '' &&
    parsed.port === ''
  );
}

/** One message to one member, as a provider gets it. */
export interface OutgoingMessage {
  readonly memberId: string;
  readonly phone: string;
  readonly text: string;
  readonly templateKey: MessageTemplateKey | null;
}

/**
 * What happened to a message: `opened` when staff were handed WhatsApp to press Send themselves
 * (nobody knows whether they did), the others for a provider that sends by itself.
 */
export type MessageStatus = 'opened' | 'queued' | 'sent' | 'failed';

/**
 * A way to get a message to a member. The only one built is the WhatsApp link (staff press Send).
 * A paid API (WhatsApp Business Cloud API, SMS) would be another, with `automatic` true; none is
 * built, by the user's decision of 2026-10-29.
 */
export interface MessageProvider {
  readonly channel: 'whatsapp_link' | 'whatsapp_api' | 'sms';
  /** Sends without staff. False for the WhatsApp link. */
  readonly automatic: boolean;
  deliver(message: OutgoingMessage): Promise<MessageStatus>;
}

/** Names in the three languages, as reminders keep them. */
export interface MessageNames {
  readonly ckb: string;
  readonly en: string | null;
  readonly ar: string | null;
}

/** What a reminder (or a message written now) keeps for its placeholders. */
export interface ReminderDetails {
  readonly plan?: MessageNames;
  /** `YYYY-MM-DD`. */
  readonly endDate?: string;
  readonly days?: number;
  /** Dinars. */
  readonly amount?: number;
  readonly dueDate?: string;
  readonly service?: MessageNames;
  readonly startsAt?: string;
}

function namesOf(value: unknown): MessageNames | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const names = value as Record<string, unknown>;
  if (typeof names.ckb !== 'string') return undefined;
  return {
    ckb: names.ckb,
    en: typeof names.en === 'string' ? names.en : null,
    ar: typeof names.ar === 'string' ? names.ar : null,
  };
}

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function numberOf(value: unknown): number | undefined {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : undefined;
}

/** Reads a reminder's details as the database keeps them (snake_case JSON); unknown parts are dropped. */
export function parseReminderDetails(json: unknown): ReminderDetails {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return {};
  const raw = json as Record<string, unknown>;
  const plan = namesOf(raw.plan);
  const endDate = textOf(raw.end_date);
  const days = numberOf(raw.days);
  const amount = numberOf(raw.amount);
  const dueDate = textOf(raw.due_date);
  const service = namesOf(raw.service);
  const startsAt = textOf(raw.starts_at);
  return {
    ...(plan && { plan }),
    ...(endDate !== undefined && { endDate }),
    ...(days !== undefined && { days }),
    ...(amount !== undefined && { amount }),
    ...(dueDate !== undefined && { dueDate }),
    ...(service && { service }),
    ...(startsAt !== undefined && { startsAt }),
  };
}

/** A name in a language, falling back to Kurdish. */
export function nameIn(names: MessageNames, language: 'ckb' | 'en' | 'ar'): string {
  return (language === 'ckb' ? names.ckb : names[language]) ?? names.ckb;
}
