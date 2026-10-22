import { describe, expect, it } from 'vitest';
import {
  applyImportMatches,
  importFieldOfHeader,
  importPayloadRow,
  importRowStatus,
  importRowTickedFirst,
  importSheetOf,
  matchImportBranch,
  matchImportColumns,
  memberNamesMatch,
  phoneInText,
  prepareImport,
  readImportBloodType,
  readImportDate,
  readImportGender,
  type ImportCell,
  type ImportOptions,
  type ImportRow,
} from './member-import.ts';
import { databaseTestSql } from './sql-functions.test-helper.ts';

/** The name cases app.member_names_match() runs too (supabase/tests/290-member-import.test.sql). */
function sharedNameCases(): { a: string; b: string; expected: string | null }[] {
  const sql = databaseTestSql('290-member-import.test.sql');
  const block = /insert into name_cases \(a, b, expected\) values\n([\s\S]*?);\n/.exec(sql);
  if (!block?.[1]) throw new Error('No name_cases in 290-member-import.test.sql');
  return [...block[1].matchAll(/\('((?:[^']|'')*)', '((?:[^']|'')*)', (?:'([^']*)'|null)\)/g)].map(
    (match) => ({
      a: (match[1] ?? '').replaceAll("''", "'"),
      b: (match[2] ?? '').replaceAll("''", "'"),
      expected: match[3] ?? null,
    }),
  );
}

describe('memberNamesMatch', () => {
  it('gives every case the database gives, both ways round', () => {
    const cases = sharedNameCases();
    expect(cases.length).toBeGreaterThan(15);
    for (const { a, b, expected } of cases) {
      expect([a, b, memberNamesMatch(a, b)]).toEqual([a, b, expected]);
      expect([b, a, memberNamesMatch(b, a)]).toEqual([b, a, expected]);
    }
  });
});

describe('importFieldOfHeader', () => {
  it('reads Kurdish, Arabic and English headers', () => {
    expect(
      [
        'ژ',
        'ناوی سیانی',
        'ژمارەی مۆبایل',
        'ڕەگەز',
        'بەرواری لەدایکبوون',
        'لق',
        'ژمارەی کارت',
        'ڕێکەوتی ناونووسین',
        'کۆتایی ئابوونە',
        'جۆری ئابوونە',
        'گرووپی خوێن',
        'تێبینی',
      ].map(importFieldOfHeader),
    ).toEqual([
      'oldNumber',
      'fullName',
      'phone',
      'gender',
      'birthDate',
      'branch',
      'card',
      'joinedOn',
      'subscriptionEnd',
      'subscriptionType',
      'bloodType',
      'notes',
    ]);
    expect(
      ['الاسم الكامل', 'رقم الهاتف', 'الجنس', 'Full Name', 'Mobile', 'Date of Birth'].map(
        importFieldOfHeader,
      ),
    ).toEqual(['fullName', 'phone', 'gender', 'fullName', 'phone', 'birthDate']);
  });

  it('finds a field in a longer header, word for word only', () => {
    expect(importFieldOfHeader('ژمارەی مۆبایل (واتسئاپ)')).toBe('phone');
    expect(importFieldOfHeader('ناونیشان')).toBe('address');
    expect(importFieldOfHeader('شتێکی تر')).toBeNull();
  });

  it('gives a field to its first column only', () => {
    expect(matchImportColumns(['ناو', 'مۆبایل', 'تەلەفۆن', null])).toEqual([
      'fullName',
      'phone',
      null,
      null,
    ]);
  });
});

describe('readImportDate', () => {
  it('reads the ways gyms write dates', () => {
    const read = (cell: ImportCell) => readImportDate(cell);
    expect(read('15/3/1995')).toEqual({ kind: 'date', date: '1995-03-15' });
    expect(read('1998-07-20')).toEqual({ kind: 'date', date: '1998-07-20' });
    expect(read('٢٠/٠٤/١٩٩٢')).toEqual({ kind: 'date', date: '1992-04-20' });
    expect(read('1999/1/9')).toEqual({ kind: 'date', date: '1999-01-09' });
    expect(read('3-8-1988')).toEqual({ kind: 'date', date: '1988-08-03' });
    expect(read('05.06.1985')).toEqual({ kind: 'date', date: '1985-06-05' });
    expect(read('1/25/1990')).toEqual({ kind: 'date', date: '1990-01-25' });
    expect(read(new Date(Date.UTC(2001, 11, 4)))).toEqual({ kind: 'date', date: '2001-12-04' });
    expect(read(37230)).toEqual({ kind: 'date', date: '2001-12-05' });
  });

  it('tells a year alone, an impossible date and an empty cell apart', () => {
    expect(readImportDate('1990')).toEqual({ kind: 'year', year: '1990' });
    expect(readImportDate(1993)).toEqual({ kind: 'year', year: '1993' });
    expect(readImportDate('1996-02-30')).toEqual({ kind: 'invalid', text: '1996-02-30' });
    expect(readImportDate('sometime')).toEqual({ kind: 'invalid', text: 'sometime' });
    expect(readImportDate('')).toEqual({ kind: 'empty' });
    expect(readImportDate(null)).toEqual({ kind: 'empty' });
  });
});

describe('cell readers', () => {
  it('reads genders written in many ways', () => {
    expect(['نێر', 'ن', 'کوڕ', 'M', 'Male', 'ذكر'].map(readImportGender)).toEqual(
      Array(6).fill('male'),
    );
    expect(['مێ', 'ئافرەت', 'کچ', 'F', 'female', 'أنثى'].map(readImportGender)).toEqual(
      Array(6).fill('female'),
    );
    expect(readImportGender('?')).toBeNull();
  });

  it('reads blood types', () => {
    expect(['O+', 'a -', 'AB+', '0-'].map(readImportBloodType)).toEqual(['O+', 'A-', 'AB+', 'O-']);
    expect(readImportBloodType('C+')).toBeNull();
  });

  it('finds the one phone number in a text', () => {
    expect(phoneInText('منداڵە؛ مۆبایلی باوکی: 0750 999 1122 (کاروان)')).toBe('+9647509991122');
    expect(phoneInText('٠٧٥٠ ٩٩٩ ١١٢٢')).toBe('+9647509991122');
    expect(phoneInText('0750 999 1122 یان 0770 111 2233')).toBeNull();
    expect(phoneInText('ئازاری ئەژنۆ هەیە')).toBeNull();
  });

  it('matches branch names with or without the word branch, and codes', () => {
    const branches = [
      { id: 'b1', code: 'B1', names: ['لقی سەرەکی', 'Main Branch', null] },
      { id: 'b2', code: 'B2', names: ['لقی بەختیاری', 'Bakhtiari Branch', 'فرع بختياري'] },
    ];
    expect(
      ['سەرەکی', 'لقی سەرەکی', 'Main', 'b2', 'بەختیاری'].map((value) =>
        matchImportBranch(value, branches),
      ),
    ).toEqual(['b1', 'b1', 'b1', 'b2', 'b2']);
    expect(matchImportBranch('لقی ٣', branches)).toBeNull();
    // A first branch named only in Kurdish still matches "Main".
    const kurdishOnly = [{ id: 'b1', code: 'B1', names: ['لقی سەرەکی', null, null] }];
    expect(['Main', 'الفرع الرئيسي'].map((value) => matchImportBranch(value, kurdishOnly))).toEqual(
      ['b1', 'b1'],
    );
    expect(matchImportBranch('', branches)).toBeNull();
  });
});

const OPTIONS: ImportOptions = {
  today: '2026-10-22',
  canGiveCards: true,
  branchFor: (value) => (value === 'لقی ٣' ? null : 'branch-1'),
};

const HEADERS = ['ناو', 'مۆبایل', 'ڕەگەز', 'کارت', 'لق', 'تێبینی'];

function rowsOf(...data: ImportCell[][]): ImportRow[] {
  const sheet = importSheetOf([HEADERS, ...data]);
  if (!sheet) throw new Error('no sheet');
  return prepareImport(sheet, matchImportColumns(sheet.headers), OPTIONS);
}

const keys = (row: ImportRow | undefined) => row?.issues.map((issue) => issue.key);

describe('prepareImport', () => {
  it('numbers rows as the spreadsheet does and skips empty ones', () => {
    const rows = rowsOf(
      ['ئارام کەریم', '0750 123 4567', 'نێر', '', 'سەرەکی', ''],
      [],
      ['شیلان عەلی', '07701234567', 'مێ', '', 'سەرەکی', ''],
    );
    expect(rows.map((row) => [row.row, importRowStatus(row)])).toEqual([
      [2, 'valid'],
      [4, 'valid'],
    ]);
  });

  it('refuses rows without a name, a readable phone, a gender or a known branch', () => {
    const rows = rowsOf(
      ['', '0750 666 5544', 'مێ', '', 'سەرەکی', ''],
      ['سۆران ڕەشید', '0770 444', 'نێر', '', 'سەرەکی', ''],
      ['نیگار ئەنوەر', '07501112233', '?', '', 'لقی ٣', ''],
    );
    expect(rows.map(keys)).toEqual([
      ['name_missing'],
      ['phone_invalid'],
      ['gender_unknown', 'branch_unknown'],
    ]);
    expect(rows.every((row) => importRowStatus(row) === 'error')).toBe(true);
  });

  it('gives a later row with the same phone that phone as its emergency contact', () => {
    const rows = rowsOf(
      ['ئارام کەریم', '0750 123 4567', 'نێر', '', 'سەرەکی', ''],
      ['کاروان ئیبراهیم', '0750-123-4567', 'نێر', '', 'سەرەکی', ''],
    );
    expect(rows[1]?.draft).toMatchObject({ phone: null, emergencyPhone: '+9647501234567' });
    expect(rows[1]?.issues).toEqual([{ key: 'shared_phone', field: 'phone', row: 2 }]);
    expect(importRowTickedFirst(rows[1] ?? { issues: [] })).toBe(true);
  });

  it('gives a repeated card to its first row only', () => {
    const rows = rowsOf(
      ['ئارام کەریم', '0750 123 4567', 'نێر', '04A1C1334F6180', 'سەرەکی', ''],
      ['گۆران حەمە سەعید', '0750 777 8899', 'M', '04A1C1334F6180', 'سەرەکی', ''],
    );
    expect(rows[0]?.draft.card).toBe('04A1C1334F6180');
    expect(rows[1]?.draft.card).toBeNull();
    expect(keys(rows[1])).toEqual(['card_repeated']);
  });

  it('marks a name that may be an earlier row, and starts it unticked', () => {
    const rows = rowsOf(
      ['ڕێباز عومەر', '+964 750 222 3344', 'ن', '', 'سەرەکی', ''],
      ['ريباز عمر ئەحمەد', '750 555 6677', 'کوڕ', '', 'سەرەکی', ''],
    );
    expect(rows[1]?.issues).toEqual([{ key: 'same_person', row: 2 }]);
    expect(importRowTickedFirst(rows[1] ?? { issues: [] })).toBe(false);
  });

  it("takes a child's emergency phone from the notes", () => {
    const [row] = rowsOf([
      'دیلان کاروان ئیبراهیم',
      '',
      'مێ',
      '',
      'سەرەکی',
      'منداڵە؛ مۆبایلی باوکی: 0750 999 1122 (کاروان)',
    ]);
    expect(row?.draft).toMatchObject({ phone: null, emergencyPhone: '+9647509991122' });
    expect(keys(row)).toEqual(['phone_from_notes']);
  });

  it('finds that phone in the notes column sent to the medical notes too', () => {
    const sheet = importSheetOf([
      HEADERS,
      ['دیلان کاروان', '', 'مێ', '', 'سەرەکی', 'منداڵە؛ مۆبایلی باوکی: 0750 999 1122'],
    ]);
    if (!sheet) throw new Error('no sheet');
    const columns = matchImportColumns(sheet.headers).map((field) =>
      field === 'notes' ? 'medicalNotes' : field,
    );
    const [row] = prepareImport(sheet, columns, OPTIONS);
    expect(row?.draft).toMatchObject({ emergencyPhone: '+9647509991122', notes: null });
    expect(row?.draft.medicalNotes).toContain('0750 999 1122');
    expect(keys(row)).toEqual(['phone_from_notes']);
  });

  it('keeps card numbers for later when the importer may not give cards', () => {
    const sheet = importSheetOf([
      HEADERS,
      ['ئارام کەریم', '0750 123 4567', 'نێر', '04:A1:C1:33:4F:61:80', 'سەرەکی', ''],
    ]);
    if (!sheet) throw new Error('no sheet');
    const [row] = prepareImport(sheet, matchImportColumns(sheet.headers), {
      ...OPTIONS,
      canGiveCards: false,
    });
    expect(row?.draft.card).toBeNull();
    expect(row?.draft.kept).toEqual({ card: '04A1C1334F6180' });
    expect(row && importRowStatus(row)).toBe('valid');
  });
});

describe('applyImportMatches', () => {
  const member = { id: 'm1', memberNumber: 45, fullName: 'ئارام کەریم' };

  it('a member with the same phone and name is already in the app', () => {
    const [row] = applyImportMatches(
      rowsOf(['ئارام كەريم', '0750 123 4567', 'نێر', '', 'سەرەکی', '']),
      [{ row: 2, match: 'phone', member }],
    );
    expect(row && importRowStatus(row)).toBe('exists');
    expect(row && importPayloadRow(row, { member: 'x', card: 'y' })).toBeNull();
  });

  it("with another name, the row keeps that phone as its emergency contact's", () => {
    const [row] = applyImportMatches(
      rowsOf(['پەیمان ئازاد', '0750 123 4567', 'مێ', '04A1C1334F6180', 'سەرەکی', '']),
      [
        { row: 2, match: 'phone', member },
        { row: 2, match: 'card_active', member },
      ],
    );
    expect(row?.draft).toMatchObject({ phone: null, emergencyPhone: '+9647501234567', card: null });
    expect(keys(row)).toEqual(['shared_phone', 'card_taken']);
    expect(row && importPayloadRow(row, { member: 'id-1', card: 'card-1' })).toMatchObject({
      id: 'id-1',
      phone: null,
      emergency_phone: '+9647501234567',
      card_id: null,
      card_uid: null,
    });
  });
});
