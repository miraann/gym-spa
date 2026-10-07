import { describe, expect, it } from 'vitest';
import { readAuthor, writeMetadata } from './schema';

describe('change metadata', () => {
  it('round-trips the author', () => {
    expect(readAuthor(writeMetadata('a0000000-0000-4000-8000-000000000001'))).toBe(
      'a0000000-0000-4000-8000-000000000001',
    );
  });

  it.each([undefined, '', 'not json', '{"author": 5}', '[]', 'null'])(
    'reads no author from %j',
    (metadata) => {
      expect(readAuthor(metadata)).toBeNull();
    },
  );
});
