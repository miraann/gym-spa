import { describe, expect, it } from 'vitest';
import {
  CARD_BLOCK_REASON_MAX_LENGTH,
  CARD_END_REASONS,
  CARD_REPLACE_REASONS,
  CARD_STATUSES,
  CARD_UID_PATTERN,
  formatCardUid,
  normalizeCardUid,
} from './cards.ts';
import { databaseTestSql, latestFunctionBody, migrationsSql } from './sql-functions.test-helper.ts';

/**
 * The UID cases of supabase/tests/270-nfc-cards.test.sql, which runs them through
 * app.normalize_card_uid(): one per line, as ('raw', reversed, 'expected' or null).
 */
function sharedUidCases(): { raw: string; reversed: boolean; expected: string | null }[] {
  const sql = databaseTestSql('270-nfc-cards.test.sql');
  const block = /insert into uid_cases \(raw, reversed, expected\) values\n([\s\S]*?);\n/.exec(sql);
  const lines = block?.[1]?.split('\n').filter((line) => line.trim() !== '') ?? [];
  return lines.map((line) => {
    const match = /^\s*\('((?:[^']|'')*)', (true|false), (?:'([0-9A-F]+)'|null)\),?$/.exec(line);
    if (!match) throw new Error(`Unreadable UID case: ${line}`);
    return {
      raw: (match[1] ?? '').replaceAll("''", "'"),
      reversed: match[2] === 'true',
      expected: match[3] ?? null,
    };
  });
}

describe('normalizeCardUid: the same cases as the database (270-nfc-cards)', () => {
  const cases = sharedUidCases();

  it('reads the shared cases', () => {
    expect(cases.length).toBeGreaterThanOrEqual(30);
  });

  it.each(cases)('$raw (reversed: $reversed) → $expected', ({ raw, reversed, expected }) => {
    expect(normalizeCardUid(raw, reversed ? 'reversed' : 'normal')).toBe(expected);
  });
});

describe('normalizeCardUid', () => {
  it('ignores the line end a keyboard-type reader types after the UID', () => {
    expect(normalizeCardUid('04A23BC15D6E80\r\n')).toBe('04A23BC15D6E80');
    expect(normalizeCardUid('\t3735928559\n')).toBe('DEADBEEF');
  });

  it('gives only stored forms, and reads them back unchanged', () => {
    for (const raw of ['04:a2:3b:c1:5d:6e:80', '3735928559', 'efbeadde', '0102030405060708090a']) {
      for (const order of ['normal', 'reversed'] as const) {
        const uid = normalizeCardUid(raw, order);
        expect(uid).toMatch(CARD_UID_PATTERN);
        expect(normalizeCardUid(uid ?? '')).toBe(uid);
      }
    }
  });
});

describe('formatCardUid', () => {
  it('shows the bytes apart', () => {
    expect(formatCardUid('04A23BC15D6E80')).toBe('04 A2 3B C1 5D 6E 80');
    expect(formatCardUid('DEADBEEF')).toBe('DE AD BE EF');
  });

  it('reads back as the same UID', () => {
    expect(normalizeCardUid(formatCardUid('04A23BC15D6E80'))).toBe('04A23BC15D6E80');
  });
});

describe('the database', () => {
  const sql = migrationsSql().join('\n');

  it('reads UIDs with the same patterns (app.normalize_card_uid)', () => {
    const body = latestFunctionBody('app.normalize_card_uid');
    expect(body).toContain("'^[0-9]{10}$'");
    expect(body).toContain('4294967295');
    expect(body).toContain("'[ \\t\\r\\n:-]'");
    expect(body).toContain("'^([0-9A-Fa-f]{8}|[0-9A-Fa-f]{14}|[0-9A-Fa-f]{20})$'");
    expect(body).toContain("E' \\t\\r\\n'");
    expect(body).toContain("'^(0+|F+)$'");
    expect(body).toContain("translate(value, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')");
  });

  it('stores only normalized UIDs', () => {
    expect(sql).toContain(
      'uid text not null check (app.normalize_card_uid(uid) is not distinct from uid)',
    );
  });

  it('has the same statuses and reasons', () => {
    const quoted = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ');
    expect(sql).toContain(`check (status in (${quoted(CARD_STATUSES)}))`);
    expect(sql).toContain(`check (end_reason in (${quoted(CARD_END_REASONS)}))`);
    expect(latestFunctionBody('public.replace_card')).toContain(
      `p_reason not in (${quoted(CARD_REPLACE_REASONS)})`,
    );
    expect(sql).toContain(
      `block_reason text check (app.is_clean_text(block_reason, ${CARD_BLOCK_REASON_MAX_LENGTH}))`,
    );
  });
});
