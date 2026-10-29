import { describe, expect, it } from 'vitest';
import { MESSAGE_TEMPLATE_KEYS, TEMPLATE_PLACEHOLDERS, unknownPlaceholders } from '@gym/core';
import { LANGUAGE_CODES } from '@gym/i18n';
import {
  composeMessage,
  defaultTemplateText,
  templateText,
  type MessageContext,
} from './message-text';

const context: MessageContext = {
  memberName: 'ئارام کەریم',
  memberNumber: 1042,
  gymNames: { ckb: 'جیمی ئاسۆ', en: 'Aso Gym', ar: null },
  branchNames: { ckb: 'لقی سەرەکی', en: 'Main branch', ar: 'الفرع الرئيسي' },
};

describe('the default templates', () => {
  it('exist in every language and use only the placeholders their template fills', () => {
    for (const language of LANGUAGE_CODES) {
      for (const key of MESSAGE_TEMPLATE_KEYS) {
        const text = defaultTemplateText(key, language);
        expect(unknownPlaceholders(text)).toEqual([]);
        const used = [...text.matchAll(/\{([a-z_]+)\}/g)].map((match) => match[1]);
        expect(used.every((name) => TEMPLATE_PLACEHOLDERS[key].some((p) => p === name))).toBe(true);
        expect(text).toContain('{name}');
      }
    }
  });
});

describe('composeMessage', () => {
  it("fills a reminder in the member's language", () => {
    const text = composeMessage('expiring_7', 'en', undefined, context, {
      plan: { ckb: 'مانگانە', en: 'Monthly', ar: null },
      endDate: '2026-11-28',
      days: 7,
    });
    expect(text).toBe(
      'Hi ئارام کەریم, your membership (Monthly) ends in 7 days, on 28 November 2026. Visit Aso Gym to renew it.',
    );
  });

  it("uses the gym's own wording, and the default for a language it left empty", () => {
    const template = {
      key: 'debt',
      bodyCkb: 'قەرز: {amount} - {gym}',
      bodyEn: null,
      bodyAr: null,
    } as const;
    expect(composeMessage('debt', 'ckb', template, context, { amount: 25000 })).toBe(
      'قەرز: 25,000 د.ع - جیمی ئاسۆ',
    );
    expect(templateText('debt', 'ar', template)).toBe(defaultTemplateText('debt', 'ar'));
  });

  it('falls back to the Kurdish names and leaves what it lacks empty', () => {
    const text = composeMessage('welcome', 'ar', undefined, { ...context, memberNumber: null }, {});
    expect(text).toContain('جیمی ئاسۆ');
    expect(text).not.toContain('{');
  });
});
