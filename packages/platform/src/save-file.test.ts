import { describe, expect, it } from 'vitest';
import { base64Of } from './save-file';

describe('base64Of', () => {
  it('encodes text with Kurdish letters and a byte order mark as UTF-8 bytes', async () => {
    const text = `${String.fromCodePoint(0xfeff)}ناو,هۆکار\n`;
    const encoded = await base64Of(new Blob([text], { type: 'text/csv' }));
    expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe(text);
  });

  it('encodes files larger than one slice', async () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, index) => index % 256);
    const encoded = await base64Of(new Blob([bytes]));
    expect(Buffer.from(encoded, 'base64').equals(Buffer.from(bytes))).toBe(true);
  });
});
