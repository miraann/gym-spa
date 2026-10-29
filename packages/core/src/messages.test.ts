import { describe, expect, it } from 'vitest';
import {
  MESSAGE_PLACEHOLDERS,
  MESSAGE_TEMPLATE_KEYS,
  TEMPLATE_PLACEHOLDERS,
  fillMessage,
  isMessageTemplateKey,
  isValidTemplateText,
  isWhatsAppUrl,
  messagePhone,
  nameIn,
  parseReminderDetails,
  unknownPlaceholders,
  whatsAppLink,
} from './messages.ts';

describe('fillMessage', () => {
  it('puts the values in', () => {
    expect(
      fillMessage('سڵاو {name}، ئابوونەکەت لە {end_date} تەواو دەبێت.', {
        name: 'ئارام',
        end_date: '5ی تشرینی دووەم',
      }),
    ).toBe('سڵاو ئارام، ئابوونەکەت لە 5ی تشرینی دووەم تەواو دەبێت.');
  });

  it('leaves a placeholder without a value empty, and tidies the spaces', () => {
    expect(fillMessage('Hi {name}, welcome to {gym}!', { name: 'Aram' })).toBe(
      'Hi Aram, welcome to!',
    );
    expect(fillMessage('سڵاو {name}، بەخێربێیت', {})).toBe('سڵاو، بەخێربێیت');
  });

  it("keeps braces it doesn't know, and line breaks", () => {
    expect(fillMessage('{name}\n{price} {name}', { name: 'Aram' })).toBe('Aram\n{price} Aram');
  });
});

describe('templates', () => {
  it('knows the nine keys, each with its placeholders', () => {
    expect(MESSAGE_TEMPLATE_KEYS).toHaveLength(9);
    expect(isMessageTemplateKey('welcome')).toBe(true);
    expect(isMessageTemplateKey('newsletter')).toBe(false);
    for (const key of MESSAGE_TEMPLATE_KEYS) {
      expect(TEMPLATE_PLACEHOLDERS[key].every((p) => MESSAGE_PLACEHOLDERS.includes(p))).toBe(true);
      expect(TEMPLATE_PLACEHOLDERS[key]).toContain('name');
    }
  });

  it('finds typos in placeholders', () => {
    expect(unknownPlaceholders('{name} {nme} {gym} {nme}')).toEqual(['nme']);
    expect(unknownPlaceholders('{name}')).toEqual([]);
  });

  it('checks a text as the database does', () => {
    expect(isValidTemplateText('سڵاو {name}،\nبەخێربێیت')).toBe(true);
    expect(isValidTemplateText('')).toBe(false);
    expect(isValidTemplateText(' سڵاو')).toBe(false);
    expect(isValidTemplateText('x\u0007')).toBe(false);
    expect(isValidTemplateText('x'.repeat(1001))).toBe(false);
  });
});

describe('messagePhone', () => {
  it("is the member's own phone, else the emergency contact's", () => {
    expect(messagePhone({ phone: '+9647501234567', emergencyPhone: '+9647700000000' })).toEqual({
      phone: '+9647501234567',
      toEmergencyContact: false,
    });
    expect(messagePhone({ phone: null, emergencyPhone: '+9647700000000' })).toEqual({
      phone: '+9647700000000',
      toEmergencyContact: true,
    });
    expect(messagePhone({ phone: null, emergencyPhone: null })).toBeNull();
  });
});

describe('whatsAppLink', () => {
  it('uses the number without + and encodes the text', () => {
    expect(whatsAppLink('+9647501234567', 'سڵاو ئارام،\nبەخێربێیت & 100%')).toBe(
      `https://wa.me/9647501234567?text=${encodeURIComponent('سڵاو ئارام،\nبەخێربێیت & 100%')}`,
    );
    expect(whatsAppLink('+1 (555) 010-9999', 'Hi')).toBe('https://wa.me/15550109999?text=Hi');
  });

  it("refuses a number WhatsApp can't take", () => {
    expect(whatsAppLink('0750', 'x')).toBeNull();
    expect(whatsAppLink('+0123456789', 'x')).toBeNull();
  });
});

describe('isWhatsAppUrl', () => {
  it("opens only WhatsApp's click to chat", () => {
    expect(isWhatsAppUrl('https://wa.me/9647501234567?text=hi')).toBe(true);
    expect(isWhatsAppUrl('https://api.whatsapp.com/send?phone=9647501234567')).toBe(true);
    expect(isWhatsAppUrl('http://wa.me/9647501234567')).toBe(false);
    expect(isWhatsAppUrl('https://wa.me.example.com/1')).toBe(false);
    expect(isWhatsAppUrl('https://evil.example/https://wa.me/')).toBe(false);
    expect(isWhatsAppUrl('https://user@wa.me/1')).toBe(false);
    expect(isWhatsAppUrl('https://wa.me:8443/1')).toBe(false);
    expect(isWhatsAppUrl('https://example.com/')).toBe(false);
    expect(isWhatsAppUrl('file:///C:/Windows/System32/calc.exe')).toBe(false);
    expect(isWhatsAppUrl('javascript:alert(1)')).toBe(false);
    expect(isWhatsAppUrl('not a url')).toBe(false);
  });
});

describe('parseReminderDetails', () => {
  it('reads what the database keeps', () => {
    expect(
      parseReminderDetails({
        plan: { ckb: 'مانگانە', en: 'Monthly', ar: null },
        end_date: '2026-11-28',
        days: 7,
        amount: '30000.00',
        extra: 'x',
      }),
    ).toEqual({
      plan: { ckb: 'مانگانە', en: 'Monthly', ar: null },
      endDate: '2026-11-28',
      days: 7,
      amount: 30000,
    });
    expect(parseReminderDetails(null)).toEqual({});
    expect(parseReminderDetails({ plan: { en: 'x' } })).toEqual({});
  });

  it('names fall back to Kurdish', () => {
    expect(nameIn({ ckb: 'مانگانە', en: 'Monthly', ar: null }, 'ar')).toBe('مانگانە');
    expect(nameIn({ ckb: 'مانگانە', en: 'Monthly', ar: null }, 'en')).toBe('Monthly');
  });
});
