import { cellText, formatMemberNumber, type ImportIssue, type ImportSheet } from '@gym/core';
import type { TFunction } from 'i18next';

// What the import page says about a row (memberImport:issues) and the rows it leaves out.

type IssueText =
  | Exclude<ImportIssue['key'], 'shared_phone' | 'same_person' | 'card_taken'>
  | 'shared_phone_row'
  | 'shared_phone_member'
  | 'same_person_row'
  | 'same_person_member'
  | 'card_taken'
  | 'card_taken_member';

function issueTextKey(issue: ImportIssue): IssueText {
  switch (issue.key) {
    case 'shared_phone':
      return issue.member ? 'shared_phone_member' : 'shared_phone_row';
    case 'same_person':
      return issue.member ? 'same_person_member' : 'same_person_row';
    case 'card_taken':
      return issue.member ? 'card_taken_member' : 'card_taken';
    default:
      return issue.key;
  }
}

/**
 * A value from the file inside a sentence, kept apart from the text around it (Unicode first
 * strong isolate): +964… keeps its plus in front, and a Latin name its place in a Kurdish line.
 */
function isolated(value: string): string {
  return `${String.fromCodePoint(0x2068)}${value}${String.fromCodePoint(0x2069)}`;
}

/** One problem of a row, as a sentence. */
export function importIssueText(t: TFunction<'memberImport'>, issue: ImportIssue): string {
  return t(`issues.${issueTextKey(issue)}`, {
    value: isolated(issue.value ?? ''),
    row: issue.row ?? 0,
    name: isolated(issue.member?.fullName ?? ''),
    number: issue.member ? formatMemberNumber(issue.member.memberNumber) : '',
    field: issue.field ? t(`columns.fields.${issue.field}`) : '',
  });
}

/** The server's reason a row was refused (import_members), as a sentence. */
export function importServerText(t: TFunction<'memberImport'>, key: string): string {
  const keys = [
    'invalid_row',
    'repeated_row',
    'member_exists',
    'phone_in_use',
    'phone_repeated',
    'card_in_use',
    'card_blocked',
    'card_exists',
    'card_repeated',
    'no_branch_access',
    'branch_inactive',
  ] as const;
  return t(`server.${keys.find((each) => each === key) ?? 'invalid_row'}`);
}

/**
 * The rows that weren't imported, as a CSV file staff can fix and import again: the file's own
 * columns, then the reason. UTF-8 with a byte order mark, so Excel reads Kurdish letters right.
 */
export async function notImportedCsv(
  sheet: ImportSheet,
  reasons: ReadonlyMap<number, string>,
  reasonHeader: string,
): Promise<Blob> {
  const { default: Papa } = await import('papaparse');
  const rows = sheet.rows
    .filter((row) => reasons.has(row.row))
    .map((row) => [
      ...sheet.headers.map((_, index) => cellText(row.cells[index])),
      reasons.get(row.row) ?? '',
    ]);
  const csv = Papa.unparse([
    [...sheet.headers.map((header) => cellText(header)), reasonHeader],
    ...rows,
  ]);
  return new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
}
