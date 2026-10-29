import {
  fillMessage,
  nameIn,
  type MessageNames,
  type MessageTemplateKey,
  type MessageValues,
  type ReminderDetails,
} from '@gym/core';
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatTime,
  resources,
  type Language,
} from '@gym/i18n';

/** A gym's own wording of a template (message_templates); an empty language uses its default. */
export interface GymTemplate {
  readonly key: MessageTemplateKey;
  readonly bodyCkb: string | null;
  readonly bodyEn: string | null;
  readonly bodyAr: string | null;
}

/** The default wording, from the translation files. */
export function defaultTemplateText(key: MessageTemplateKey, language: Language): string {
  return resources[language].notifications.templates[key].default;
}

/** The gym's own text of a template in a language, or null when it uses the default. */
export function gymTemplateText(
  template: GymTemplate | undefined,
  language: Language,
): string | null {
  if (!template) return null;
  return { ckb: template.bodyCkb, en: template.bodyEn, ar: template.bodyAr }[language];
}

/** The text a message starts from: the gym's own, else the default of that language. */
export function templateText(
  key: MessageTemplateKey,
  language: Language,
  template: GymTemplate | undefined,
): string {
  return gymTemplateText(template, language) ?? defaultTemplateText(key, language);
}

/** Who a message is to and from. */
export interface MessageContext {
  readonly memberName: string;
  readonly memberNumber: number | null;
  readonly gymNames: MessageNames;
  /** The reminder's branch, or the member's. */
  readonly branchNames: MessageNames | null;
}

/**
 * The placeholders' values in the member's language. Messages always use Latin digits: they are
 * read on phones, whatever the reception screen shows.
 */
export function messageValues(
  context: MessageContext,
  details: ReminderDetails,
  language: Language,
): MessageValues {
  const options = { language, digits: 'latn' } as const;
  return {
    name: context.memberName,
    gym: nameIn(context.gymNames, language),
    branch: context.branchNames ? nameIn(context.branchNames, language) : undefined,
    number: context.memberNumber === null ? undefined : String(context.memberNumber),
    plan: details.plan ? nameIn(details.plan, language) : undefined,
    end_date: details.endDate ? formatDate(details.endDate, options) : undefined,
    days: details.days === undefined ? undefined : formatNumber(details.days, options),
    amount: details.amount === undefined ? undefined : formatMoney(details.amount, 'IQD', options),
    due_date: details.dueDate ? formatDate(details.dueDate, options) : undefined,
    service: details.service ? nameIn(details.service, language) : undefined,
    date: details.startsAt ? formatDate(details.startsAt, options) : undefined,
    time: details.startsAt ? formatTime(details.startsAt, options) : undefined,
  };
}

/** A template filled in for one member. */
export function composeMessage(
  key: MessageTemplateKey,
  language: Language,
  template: GymTemplate | undefined,
  context: MessageContext,
  details: ReminderDetails,
): string {
  return fillMessage(
    templateText(key, language, template),
    messageValues(context, details, language),
  );
}

/** The template a message written now most likely is: an ending membership, a debt, else welcome. */
export function suggestedTemplate(details: ReminderDetails): MessageTemplateKey {
  if (details.days === 7) return 'expiring_7';
  if (details.days === 3) return 'expiring_3';
  if (details.days === 1 || details.days === 0) return 'expiring_1';
  if (details.amount !== undefined) return details.dueDate ? 'installment_due' : 'debt';
  return 'welcome';
}
