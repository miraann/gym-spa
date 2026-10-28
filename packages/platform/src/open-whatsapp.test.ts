import { describe, expect, it } from 'vitest';
import { whatsAppOpener } from './open-whatsapp';

describe('whatsAppOpener', () => {
  it('opens a tab on the web and in the Windows app, and hands the link to the system on phones', () => {
    expect(whatsAppOpener('web')).toBe('new-tab');
    expect(whatsAppOpener('electron')).toBe('new-tab');
    expect(whatsAppOpener('android')).toBe('navigate');
    expect(whatsAppOpener('ios')).toBe('navigate');
  });
});
