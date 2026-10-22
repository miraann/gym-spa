// @vitest-environment node
import { readFileSync } from 'node:fs';
import {
  importRowStatus,
  importRowTickedFirst,
  importSheetOf,
  matchImportBranch,
  matchImportColumns,
  prepareImport,
  type ImportBranch,
  type ImportRow,
} from '@gym/core';
import { describe, expect, it } from 'vitest';
import { readXlsx } from './read-xlsx';

// The sample member list (samples/sample-members-import.xlsx, all fake): its second sheet explains
// the case each row was made for. Read with the same reader as the import page (read-xlsx.ts).

const SAMPLE = new URL('../../../../../samples/sample-members-import.xlsx', import.meta.url);

/** B1 is named only in Kurdish, as in a gym made from the seller panel. */
const BRANCHES: ImportBranch[] = [
  { id: 'B1', code: 'B1', names: ['لقی سەرەکی', null, null] },
  { id: 'B2', code: 'B2', names: ['لقی بەختیاری', null, null] },
];

function sampleRows(canGiveCards: boolean): ImportRow[] {
  const data = readXlsx(new Uint8Array(readFileSync(SAMPLE)));
  const sheet = importSheetOf(data);
  if (!sheet) throw new Error('No header row');
  return prepareImport(sheet, matchImportColumns(sheet.headers), {
    today: '2026-10-22',
    canGiveCards,
    // Staff chose B2 for «لقی ٢» and nothing for «لقی ٣».
    branchFor: (value) => (value === 'لقی ٢' ? 'B2' : matchImportBranch(value, BRANCHES)),
  });
}

describe('the sample member list', () => {
  it('reads each column as what its Kurdish header says', () => {
    const data = readXlsx(new Uint8Array(readFileSync(SAMPLE)));
    const sheet = importSheetOf(data);
    expect(sheet && matchImportColumns(sheet.headers)).toEqual([
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
  });

  it('gives every intended case its outcome', () => {
    const rows = sampleRows(true);
    const outcome = rows.map((row) => [
      row.row,
      importRowStatus(row),
      row.issues.map((issue) => issue.key).join(' '),
      importRowTickedFirst(row),
    ]);
    expect(outcome).toEqual([
      [2, 'valid', '', true],
      [3, 'valid', '', true],
      [4, 'warning', 'birth_year_only', true],
      [5, 'warning', 'card_decimal same_person', false],
      [6, 'valid', '', true],
      [7, 'valid', '', true],
      [8, 'warning', 'shared_phone', true],
      [9, 'warning', 'phone_from_notes', true],
      [10, 'error', 'phone_invalid', false],
      [11, 'warning', 'birth_date_invalid', true],
      [12, 'warning', 'card_repeated', true],
      [13, 'error', 'branch_unknown', false],
      [14, 'warning', 'birth_year_only', true],
      [15, 'error', 'name_missing', false],
      [16, 'valid', '', true],
      [17, 'warning', 'shared_phone', true],
      [18, 'valid', '', true],
      [19, 'valid', '', true],
      [20, 'valid', '', true],
      [21, 'warning', 'birth_date_future', true],
    ]);
  });

  it('reads the values the way they were meant', () => {
    const rows = sampleRows(true);
    const draft = (row: number) => rows.find((each) => each.row === row)?.draft;
    expect(draft(2)).toMatchObject({
      fullName: 'ئارام کەریم محەمەد',
      gender: 'male',
      phone: '+9647501234567',
      birthDate: '1995-03-15',
      joinedOn: '2024-01-10',
      branchId: 'B1',
      bloodType: 'O+',
      card: '04A1C1334F6180',
      kept: { oldNumber: '1', subscriptionType: 'مانگانە', subscriptionEnd: '2026-11-10' },
    });
    expect(draft(3)).toMatchObject({ phone: '+9647701234567', card: '04B2119A3C6180' });
    expect(draft(4)).toMatchObject({
      gender: 'male',
      birthDate: null,
      kept: { birthYear: '1990' },
    });
    expect(draft(5)).toMatchObject({
      fullName: 'ريباز عمر ئەحمەد',
      phone: '+9647505556677',
      birthDate: '2001-12-05',
      branchId: 'B2',
      card: '499602D2',
    });
    expect(draft(6)).toMatchObject({ phone: '+9647513334455', birthDate: '1992-04-20' });
    expect(draft(7)).toMatchObject({
      gender: 'female',
      phone: '+9647708889900',
      card: '04C3221B4D6180',
      notes: 'ئازاری ئەژنۆ هەیە',
    });
    expect(draft(8)).toMatchObject({
      phone: null,
      emergencyPhone: '+9647501234567',
      birthDate: '1988-08-03',
    });
    expect(draft(9)).toMatchObject({ phone: null, emergencyPhone: '+9647509991122' });
    expect(draft(11)).toMatchObject({ phone: '+905321234567', birthDate: null });
    expect(draft(12)).toMatchObject({ gender: 'male', birthDate: '1985-06-05', card: null });
    expect(draft(14)).toMatchObject({ fullName: 'بێستون قادر' });
    expect(draft(16)).toMatchObject({ phone: '+989141234567' });
    expect(draft(17)).toMatchObject({ phone: null, emergencyPhone: '+9647501234567' });
    expect(draft(18)).toMatchObject({ phone: '+9647801234567' });
    expect(draft(19)).toMatchObject({ gender: 'female', birthDate: '2009-04-14' });
    expect(draft(20)).toMatchObject({ fullName: 'Daban Hiwa', gender: 'male', branchId: 'B1' });
    expect(draft(21)).toMatchObject({ birthDate: null });
  });

  it('keeps the card numbers for later when the importer may not give cards', () => {
    const rows = sampleRows(false);
    const row = (number: number) => rows.find((each) => each.row === number);
    expect(row(2)?.draft).toMatchObject({ card: null, kept: { card: '04A1C1334F6180' } });
    expect(row(2)?.issues.map((issue) => issue.key)).toEqual(['card_kept']);
    expect(importRowStatus(row(2) ?? { issues: [] })).toBe('valid');
  });
});
