import { isCleanText, normalizeName } from './admin-forms.ts';
import { normalizeCardUid } from './cards.ts';
import { toLatinDigits } from './digits.ts';
import {
  BLOOD_TYPES,
  isCalendarDate,
  MEMBER_LIMITS,
  MIN_BIRTH_DATE,
  normalizeMemberPhone,
  type BloodType,
  type Gender,
} from './members.ts';
import { normalizeSearchText } from './search.ts';

// Importing members from a gym's own Excel/CSV list (spec §4.1, step 2j). The import page reads the
// file in the browser; these functions decide what each column is, read each cell the way gyms in
// Kurdistan write them, and say what is wrong with each row. The database checks every row again
// (import_members() in supabase/migrations/20261023100000_member_import.sql).

export const IMPORT_MAX_ROWS = 5000;
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

/** A cell as the spreadsheet reader gives it. */
export type ImportCell = string | number | boolean | Date | null;

/** What a column can be imported as. */
export const IMPORT_FIELDS = [
  'fullName',
  'phone',
  'gender',
  'birthDate',
  'branch',
  'joinedOn',
  'card',
  'bloodType',
  'notes',
  'medicalNotes',
  'emergencyContactName',
  'emergencyPhone',
  'address',
  'oldNumber',
  'subscriptionType',
  'subscriptionEnd',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Columns that can't be used yet: kept with the import record for later (Phase 3, the profile). */
export const KEPT_FIELDS = ['oldNumber', 'subscriptionType', 'subscriptionEnd'] as const;
export type KeptKey = (typeof KEPT_FIELDS)[number] | 'birthYear' | 'card';
export type KeptValues = Readonly<Partial<Record<KeptKey, string>>>;

/**
 * Header names per field, in Kurdish, Arabic and English. Compared like search (look-alike letters,
 * capitals and spaces don't matter); a header that contains one of them word for word matches too.
 */
const HEADER_NAMES: Readonly<Record<ImportField, readonly string[]>> = {
  fullName: [
    'ناو',
    'ناوی سیانی',
    'ناوی تەواو',
    'ناوی ئەندام',
    'ناوی سیانی ئەندام',
    'ناو و پاشناو',
    'الاسم',
    'الاسم الكامل',
    'الاسم الثلاثي',
    'اسم العضو',
    'name',
    'full name',
    'member name',
  ],
  phone: [
    'مۆبایل',
    'ژمارەی مۆبایل',
    'تەلەفۆن',
    'ژمارەی تەلەفۆن',
    'مۆبایلی ئەندام',
    'الهاتف',
    'رقم الهاتف',
    'الموبايل',
    'رقم الموبايل',
    'جوال',
    'phone',
    'mobile',
    'phone number',
    'mobile number',
    'tel',
  ],
  gender: ['ڕەگەز', 'رەگەز', 'جنس', 'الجنس', 'gender', 'sex'],
  birthDate: [
    'بەرواری لەدایکبوون',
    'ڕێکەوتی لەدایکبوون',
    'لەدایکبوون',
    'ساڵی لەدایکبوون',
    'تاريخ الميلاد',
    'الميلاد',
    'تولد',
    'birth date',
    'date of birth',
    'birthday',
    'dob',
  ],
  branch: ['لق', 'لقی', 'ناوی لق', 'الفرع', 'فرع', 'branch'],
  joinedOn: [
    'ڕێکەوتی ناونووسین',
    'بەرواری ناونووسین',
    'ڕێکەوتی تۆمارکردن',
    'بەرواری تۆمارکردن',
    'ناونووسین',
    'تاريخ التسجيل',
    'تاريخ الانتساب',
    'registration date',
    'joined',
    'join date',
    'joined on',
    'member since',
  ],
  card: [
    'ژمارەی کارت',
    'کارت',
    'کۆدی کارت',
    'رقم البطاقة',
    'البطاقة',
    'card',
    'card number',
    'card no',
    'uid',
    'nfc',
  ],
  bloodType: [
    'گرووپی خوێن',
    'جۆری خوێن',
    'خوێن',
    'فصيلة الدم',
    'زمرة الدم',
    'blood type',
    'blood group',
    'blood',
  ],
  notes: ['تێبینی', 'تێبینییەکان', 'ملاحظات', 'ملاحظة', 'notes', 'note', 'remarks', 'comments'],
  medicalNotes: [
    'زانیاریی تەندروستی',
    'تەندروستی',
    'نەخۆشی',
    'ملاحظات صحية',
    'الحالة الصحية',
    'health',
    'health notes',
    'medical notes',
    'medical',
  ],
  emergencyContactName: [
    'کەسی نزیک',
    'ناوی کەسی نزیک',
    'اسم القريب',
    'شخص للطوارئ',
    'emergency contact',
    'emergency contact name',
  ],
  emergencyPhone: [
    'مۆبایلی کەسی نزیک',
    'ژمارەی کەسی نزیک',
    'تەلەفۆنی کەسی نزیک',
    'هاتف الطوارئ',
    'رقم الطوارئ',
    'emergency phone',
    'emergency number',
  ],
  address: ['ناونیشان', 'شوێنی نیشتەجێبوون', 'العنوان', 'address'],
  oldNumber: [
    'ژ',
    'ژمارە',
    'ژمارەی ئەندام',
    'ژمارەی پێشوو',
    'کۆد',
    'ت',
    'م',
    '#',
    'no',
    'no.',
    'number',
    'member number',
    'member no',
    'id',
    'member id',
    'رقم',
    'الرقم',
    'رقم العضو',
  ],
  subscriptionType: [
    'جۆری ئابوونە',
    'جۆری بەشداری',
    'ئابوونە',
    'نوع الاشتراك',
    'الاشتراك',
    'plan',
    'subscription',
    'membership',
    'subscription type',
    'membership type',
  ],
  subscriptionEnd: [
    'کۆتایی ئابوونە',
    'بەرواری کۆتایی',
    'کۆتایی بەشداری',
    'بەسەرچوونی ئابوونە',
    'انتهاء الاشتراك',
    'تاريخ الانتهاء',
    'نهاية الاشتراك',
    'subscription end',
    'expiry',
    'expires',
    'end date',
    'valid until',
  ],
};

function headerKey(text: string): string {
  return normalizeSearchText(text)
    .replace(/[:*()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const HEADER_KEYS: readonly { field: ImportField; key: string; words: readonly string[] }[] =
  IMPORT_FIELDS.flatMap((field) =>
    HEADER_NAMES[field].map((name) => {
      const key = headerKey(name);
      return { field, key, words: key.split(' ') };
    }),
  );

function containsWords(words: readonly string[], part: readonly string[]): boolean {
  for (let start = 0; start + part.length <= words.length; start += 1) {
    if (part.every((word, index) => words[start + index] === word)) return true;
  }
  return false;
}

/** The field a header names, or null: an exact name first, else the longest name it contains. */
export function importFieldOfHeader(header: string): ImportField | null {
  const key = headerKey(header);
  if (key === '') return null;
  const exact = HEADER_KEYS.find((each) => each.key === key);
  if (exact) return exact.field;
  const words = key.split(' ');
  const contained = HEADER_KEYS.filter(
    (each) => each.key.length >= 3 && containsWords(words, each.words),
  ).sort((a, b) => b.key.length - a.key.length);
  return contained[0]?.field ?? null;
}

/** What each column is imported as (null: not imported). A field is given to one column only. */
export function matchImportColumns(headers: readonly ImportCell[]): (ImportField | null)[] {
  const taken = new Set<ImportField>();
  return headers.map((header) => {
    const field = importFieldOfHeader(cellText(header));
    if (field === null || taken.has(field)) return null;
    taken.add(field);
    return field;
  });
}

// Cells -------------------------------------------------------------------------------------------

/** A cell as text, trimmed: numbers without a trailing .0, dates as YYYY-MM-DD. */
export function cellText(cell: ImportCell | undefined): string {
  if (cell === null || cell === undefined || typeof cell === 'boolean') return '';
  if (cell instanceof Date) return isoDate(cell) ?? '';
  if (typeof cell === 'number') return Number.isFinite(cell) ? String(cell) : '';
  return cell.trim();
}

function isoDate(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${month}-${day}`;
}

/** Excel stores a date as days since 30 December 1899. */
const EXCEL_DAY_ZERO = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

function excelSerialDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return null;
  return isoDate(new Date(EXCEL_DAY_ZERO + Math.round(serial) * DAY_MS));
}

function dateOf(year: number, month: number, day: number): string | null {
  const text = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isCalendarDate(text) ? text : null;
}

export type ImportDate =
  | { readonly kind: 'empty' }
  | { readonly kind: 'date'; readonly date: string }
  | { readonly kind: 'year'; readonly year: string }
  | { readonly kind: 'invalid'; readonly text: string };

/**
 * A date cell: a real Excel date, an Excel day number, or text with the day first (15/3/1995,
 * 3-8-1988, 05.06.1985), the year first (1998-07-20, 1999/1/9), Kurdish or Arabic digits, or only
 * a year. A text date whose second number can't be a month is read month first (1/25/1990).
 */
export function readImportDate(cell: ImportCell | undefined): ImportDate {
  if (cell instanceof Date) {
    const date = isoDate(cell);
    return date === null ? { kind: 'invalid', text: '' } : { kind: 'date', date };
  }
  if (typeof cell === 'number') {
    if (Number.isInteger(cell) && cell >= 1900 && cell <= 2100)
      return { kind: 'year', year: String(cell) };
    const date = excelSerialDate(cell);
    return date === null ? { kind: 'invalid', text: String(cell) } : { kind: 'date', date };
  }
  const text = toLatinDigits(cellText(cell));
  if (text === '') return { kind: 'empty' };
  if (/^\d{4}$/.test(text)) return { kind: 'year', year: text };
  const yearFirst = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (yearFirst) {
    const date = dateOf(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3]));
    return date === null ? { kind: 'invalid', text } : { kind: 'date', date };
  }
  const dayFirst = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  if (dayFirst) {
    const first = Number(dayFirst[1]);
    const second = Number(dayFirst[2]);
    const year = Number(dayFirst[3]);
    const date =
      second > 12 && first <= 12 ? dateOf(year, first, second) : dateOf(year, second, first);
    return date === null ? { kind: 'invalid', text } : { kind: 'date', date };
  }
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const date = excelSerialDate(Number(text));
    if (date !== null) return { kind: 'date', date };
  }
  return { kind: 'invalid', text };
}

const MALE_WORDS = [
  'نێر',
  'ن',
  'نیر',
  'پیاو',
  'کوڕ',
  'ذكر',
  'ذ',
  'رجل',
  'ولد',
  'm',
  'male',
  'man',
  'boy',
];
const FEMALE_WORDS = [
  'مێ',
  'م',
  'می',
  'ئافرەت',
  'افرەت',
  'ژن',
  'کچ',
  'أنثى',
  'انثى',
  'امرأة',
  'بنت',
  'f',
  'female',
  'woman',
  'girl',
];
const GENDER_WORDS = new Map<string, Gender>([
  ...MALE_WORDS.map((word) => [normalizeSearchText(word), 'male'] as const),
  ...FEMALE_WORDS.map((word) => [normalizeSearchText(word), 'female'] as const),
]);

/** A gender as gyms write it (نێر، ن، کوڕ، M، Male / مێ، ئافرەت، کچ، F، Female); null if unknown. */
export function readImportGender(text: string): Gender | null {
  return GENDER_WORDS.get(normalizeSearchText(text).replace(/[.]/g, '')) ?? null;
}

/** A blood type (O+, ab -, 0+ with a zero); null if it isn't one. */
export function readImportBloodType(text: string): BloodType | null {
  const match = /^(AB|A|B|O|0)\s*([+-])$/.exec(toLatinDigits(text).trim().toUpperCase());
  if (!match) return null;
  const type = `${match[1] === '0' ? 'O' : (match[1] ?? '')}${match[2] ?? ''}`;
  return BLOOD_TYPES.find((each) => each === type) ?? null;
}

const PHONE_IN_TEXT = /(?:\+|00)?[0-9٠-٩۰-۹][0-9٠-٩۰-۹ -]{6,16}[0-9٠-٩۰-۹]/g;

/** The one phone number in a text (a parent's number in the notes), or null for none or several. */
export function phoneInText(text: string): string | null {
  const phones = new Set(
    [...text.matchAll(PHONE_IN_TEXT)]
      .map((match) => normalizeMemberPhone(match[0]))
      .filter((phone) => phone !== null),
  );
  return phones.size === 1 ? ([...phones][0] ?? null) : null;
}

// Names -------------------------------------------------------------------------------------------

/**
 * A normalized name the way an Arabic keyboard tends to write it: ئ as ا (ئا as one ا), and without
 * ە, و and ی, which Arabic spelling leaves out. Like app.name_skeleton().
 */
export function nameSkeleton(normalized: string): string {
  return normalized.replaceAll('ئا', 'ا').replaceAll('ئ', 'ا').replace(/[ەوی]/g, '');
}

function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

export type NameMatch = 'same_name' | 'similar_name';

/**
 * Whether two names may be the same person, like app.member_names_match(): the same name with
 * spaces ignored; or the same first word's skeleton and then the same second word's skeleton, or
 * the whole names a letter (two from 11 letters on) apart. Shared cases:
 * supabase/tests/290-member-import.test.sql.
 */
export function memberNamesMatch(first: string, second: string): NameMatch | null {
  const a = normalizeSearchText(first);
  const b = normalizeSearchText(second);
  const flatA = a.replaceAll(' ', '');
  if (flatA.length >= 3 && flatA === b.replaceAll(' ', '')) return 'same_name';
  const wordsA = a.split(' ');
  const wordsB = b.split(' ');
  const firstKey = nameSkeleton(wordsA[0] ?? '');
  if (firstKey === '' || firstKey !== nameSkeleton(wordsB[0] ?? '')) return null;
  const secondA = wordsA[1] ?? '';
  const secondB = wordsB[1] ?? '';
  if (secondA !== '' && secondB !== '' && nameSkeleton(secondA) === nameSkeleton(secondB)) {
    return 'similar_name';
  }
  const limit = Math.max(a.length, b.length) > 10 ? 2 : 1;
  if (Math.min(a.length, b.length) >= 6 && Math.abs(a.length - b.length) <= limit) {
    return levenshtein(a, b) <= limit ? 'similar_name' : null;
  }
  return null;
}

// Branches ----------------------------------------------------------------------------------------

const BRANCH_WORDS = new Set(
  ['لق', 'لقی', 'فرع', 'الفرع', 'branch', 'br'].map(normalizeSearchText),
);

/** "Main" in English and Arabic, as most gyms name their first branch (سەرەکی). */
const MAIN_BRANCH_WORDS = new Map(
  ['main', 'central', 'head', 'الرئيسي', 'رئيسي', 'الرئيسية', 'رئيسية'].map(
    (word) => [normalizeSearchText(word), normalizeSearchText('سەرەکی')] as const,
  ),
);

/** A branch name without the word "branch" (لقی سەرەکی, سەرەکی, Main Branch → سەرەکی). */
function branchKey(text: string): string {
  return normalizeSearchText(text)
    .split(' ')
    .filter((word) => !BRANCH_WORDS.has(word))
    .map((word) => MAIN_BRANCH_WORDS.get(word) ?? word)
    .join(' ');
}

export interface ImportBranch {
  readonly id: string;
  readonly code: string;
  readonly names: readonly (string | null)[];
}

/** The branch a value in the file names, by name (with or without لقی) or code; null if unsure. */
export function matchImportBranch(value: string, branches: readonly ImportBranch[]): string | null {
  const key = branchKey(value);
  if (key === '') return null;
  const found = branches.filter(
    (branch) =>
      normalizeSearchText(branch.code) === key ||
      branch.names.some((name) => name !== null && branchKey(name) === key),
  );
  return found.length === 1 ? (found[0]?.id ?? null) : null;
}

// Rows --------------------------------------------------------------------------------------------

export type ImportIssueKey =
  // Errors: the row can't be imported.
  | 'name_missing'
  | 'name_too_long'
  | 'phone_missing'
  | 'phone_invalid'
  | 'gender_missing'
  | 'gender_unknown'
  | 'branch_unknown'
  // Warnings: imported, with something left out or changed.
  | 'birth_year_only'
  | 'birth_date_invalid'
  | 'birth_date_future'
  | 'joined_invalid'
  | 'blood_type_unknown'
  | 'emergency_phone_invalid'
  | 'text_too_long'
  | 'phone_from_notes'
  | 'shared_phone'
  | 'card_invalid'
  | 'card_decimal'
  | 'card_repeated'
  | 'card_taken'
  | 'card_blocked'
  | 'same_person'
  // Notes: nothing wrong.
  | 'card_kept'
  | 'already_member';

export type ImportIssueLevel = 'error' | 'warning' | 'note';

const ERROR_KEYS = new Set<ImportIssueKey>([
  'name_missing',
  'name_too_long',
  'phone_missing',
  'phone_invalid',
  'gender_missing',
  'gender_unknown',
  'branch_unknown',
]);
const NOTE_KEYS = new Set<ImportIssueKey>(['card_kept', 'already_member']);

export function importIssueLevel(key: ImportIssueKey): ImportIssueLevel {
  return ERROR_KEYS.has(key) ? 'error' : NOTE_KEYS.has(key) ? 'note' : 'warning';
}

/** An existing member a row was compared with. */
export interface ImportMemberRef {
  readonly id: string;
  readonly memberNumber: number;
  readonly fullName: string;
}

export interface ImportIssue {
  readonly key: ImportIssueKey;
  /** The column it concerns. */
  readonly field?: ImportField;
  /** The value read, e.g. a year, a phone number found in the notes. */
  readonly value?: string;
  /** The earlier row of the file it concerns. */
  readonly row?: number;
  /** The existing member it concerns. */
  readonly member?: ImportMemberRef;
}

/** A member as the row would be imported (fields the row lacks are null). */
export interface ImportDraft {
  readonly fullName: string | null;
  readonly gender: Gender | null;
  readonly phone: string | null;
  readonly emergencyContactName: string | null;
  readonly emergencyPhone: string | null;
  readonly birthDate: string | null;
  readonly joinedOn: string | null;
  readonly branchValue: string;
  readonly branchId: string | null;
  readonly address: string | null;
  readonly notes: string | null;
  readonly bloodType: BloodType | null;
  readonly medicalNotes: string | null;
  /** The card to give. */
  readonly card: string | null;
  readonly kept: KeptValues;
}

export type ImportStatus = 'valid' | 'warning' | 'error' | 'exists';

export interface ImportRow {
  /** The row's number in the spreadsheet (the header row is usually 1). */
  readonly row: number;
  readonly draft: ImportDraft;
  readonly issues: readonly ImportIssue[];
}

export function importRowStatus(row: Pick<ImportRow, 'issues'>): ImportStatus {
  const levels = row.issues.map((issue) => importIssueLevel(issue.key));
  if (levels.includes('error')) return 'error';
  if (row.issues.some((issue) => issue.key === 'already_member')) return 'exists';
  return levels.includes('warning') ? 'warning' : 'valid';
}

/** Whether a row starts ticked: it can be imported, and nobody needs to look at it first. */
export function importRowTickedFirst(row: Pick<ImportRow, 'issues'>): boolean {
  const status = importRowStatus(row);
  return (
    (status === 'valid' || status === 'warning') &&
    !row.issues.some((issue) => issue.key === 'same_person')
  );
}

export interface ImportOptions {
  /** Today in Baghdad (YYYY-MM-DD). */
  readonly today: string;
  /** Whether the importer may give cards (cards.manage); else card numbers are kept for later. */
  readonly canGiveCards: boolean;
  /** The branch for a value of the branch column ('' when the cell is empty or there is none). */
  readonly branchFor: (value: string) => string | null;
}

/** A spreadsheet: its header row, then its data rows with their row numbers. */
export interface ImportSheet {
  readonly headers: readonly ImportCell[];
  readonly rows: readonly { readonly row: number; readonly cells: readonly ImportCell[] }[];
}

function isEmptyRow(cells: readonly ImportCell[]): boolean {
  return cells.every((cell) => cellText(cell) === '');
}

/** The header (the first row with at least two filled cells) and the filled rows below it. */
export function importSheetOf(data: readonly (readonly ImportCell[])[]): ImportSheet | null {
  const headerIndex = data.findIndex(
    (cells) => cells.filter((cell) => cellText(cell) !== '').length >= 2,
  );
  if (headerIndex < 0) return null;
  return {
    headers: data[headerIndex] ?? [],
    rows: data
      .slice(headerIndex + 1)
      .map((cells, index) => ({ row: headerIndex + index + 2, cells }))
      .filter((each) => !isEmptyRow(each.cells)),
  };
}

/** The distinct values of the branch column, as written in the file ('' for empty cells). */
export function importBranchValues(
  sheet: ImportSheet,
  columns: readonly (ImportField | null)[],
): string[] {
  const index = columns.indexOf('branch');
  if (index < 0) return [''];
  return [...new Set(sheet.rows.map((row) => normalizeName(cellText(row.cells[index]))))];
}

/** Optional text: cleaned, or null with a warning when it is too long. */
function optionalText(
  text: string,
  maxLength: number,
  field: ImportField,
  issues: ImportIssue[],
): string | null {
  const clean = normalizeName(text);
  if (clean === '') return null;
  if (isCleanText(clean, maxLength)) return clean;
  issues.push({ key: 'text_too_long', field });
  return null;
}

/** Multi-line text (notes): line breaks kept, ends trimmed. */
function optionalLongText(
  text: string,
  maxLength: number,
  field: ImportField,
  issues: ImportIssue[],
): string | null {
  const clean = text
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
  if (clean === '') return null;
  if (isCleanText(clean, maxLength)) return clean;
  issues.push({ key: 'text_too_long', field });
  return null;
}

/** Reads one data row on its own (duplicates are found afterwards, see markImportDuplicates). */
export function readImportRow(
  cells: readonly ImportCell[],
  row: number,
  columns: readonly (ImportField | null)[],
  options: ImportOptions,
): ImportRow {
  const issues: ImportIssue[] = [];
  const cell = (field: ImportField): ImportCell | undefined => {
    const index = columns.indexOf(field);
    return index < 0 ? undefined : cells[index];
  };
  const text = (field: ImportField): string => cellText(cell(field));
  const kept: Partial<Record<KeptKey, string>> = {};
  const keep = (key: KeptKey, value: string) => {
    const clean = normalizeName(value).slice(0, 100).trim();
    if (clean !== '') kept[key] = clean;
  };

  // Name
  const name = normalizeName(text('fullName'));
  let fullName: string | null = name;
  if (name === '') {
    issues.push({ key: 'name_missing', field: 'fullName' });
    fullName = null;
  } else if (!isCleanText(name, MEMBER_LIMITS.fullName)) {
    issues.push({ key: 'name_too_long', field: 'fullName' });
    fullName = null;
  }

  // Gender
  let gender: Gender | null = null;
  const genderText = text('gender');
  if (genderText === '') issues.push({ key: 'gender_missing', field: 'gender' });
  else {
    gender = readImportGender(genderText);
    if (gender === null) issues.push({ key: 'gender_unknown', field: 'gender', value: genderText });
  }

  // Notes first: a child's row may have their parent's phone only there.
  const notes = optionalLongText(text('notes'), MEMBER_LIMITS.notes, 'notes', issues);

  // Phones
  let emergencyPhone: string | null = null;
  const emergencyText = text('emergencyPhone');
  if (emergencyText !== '') {
    emergencyPhone = normalizeMemberPhone(emergencyText);
    if (emergencyPhone === null) {
      issues.push({
        key: 'emergency_phone_invalid',
        field: 'emergencyPhone',
        value: emergencyText,
      });
    }
  }
  let phone: string | null = null;
  const phoneText = text('phone');
  if (phoneText !== '') {
    phone = normalizeMemberPhone(phoneText);
    if (phone === null) issues.push({ key: 'phone_invalid', field: 'phone', value: phoneText });
  } else if (emergencyPhone === null) {
    // The file's notes column, wherever staff sent it (medical notes, after the notes warning).
    const found = phoneInText(
      `${text('notes')} ${text('medicalNotes')} ${text('emergencyContactName')}`,
    );
    if (found !== null) {
      emergencyPhone = found;
      issues.push({ key: 'phone_from_notes', field: 'phone', value: found });
    } else {
      issues.push({ key: 'phone_missing', field: 'phone' });
    }
  }

  // Dates
  let birthDate: string | null = null;
  const birth = readImportDate(cell('birthDate'));
  if (birth.kind === 'date') {
    if (birth.date > options.today) {
      issues.push({ key: 'birth_date_future', field: 'birthDate', value: birth.date });
    } else if (birth.date < MIN_BIRTH_DATE) {
      issues.push({ key: 'birth_date_invalid', field: 'birthDate', value: birth.date });
    } else birthDate = birth.date;
  } else if (birth.kind === 'year') {
    issues.push({ key: 'birth_year_only', field: 'birthDate', value: birth.year });
    keep('birthYear', birth.year);
  } else if (birth.kind === 'invalid') {
    issues.push({ key: 'birth_date_invalid', field: 'birthDate', value: birth.text });
  }

  let joinedOn: string | null = null;
  const joined = readImportDate(cell('joinedOn'));
  if (joined.kind === 'date' && joined.date <= options.today && joined.date >= MIN_BIRTH_DATE) {
    joinedOn = joined.date;
  } else if (joined.kind !== 'empty') {
    issues.push({
      key: 'joined_invalid',
      field: 'joinedOn',
      value:
        joined.kind === 'date' ? joined.date : joined.kind === 'year' ? joined.year : joined.text,
    });
  }

  // Health
  let bloodType: BloodType | null = null;
  const bloodText = text('bloodType');
  if (bloodText !== '') {
    bloodType = readImportBloodType(bloodText);
    if (bloodType === null)
      issues.push({ key: 'blood_type_unknown', field: 'bloodType', value: bloodText });
  }
  const medicalNotes = optionalLongText(
    text('medicalNotes'),
    MEMBER_LIMITS.medicalNotes,
    'medicalNotes',
    issues,
  );

  // Branch
  const branchValue = normalizeName(text('branch'));
  const branchId = options.branchFor(branchValue);
  if (branchId === null)
    issues.push({ key: 'branch_unknown', field: 'branch', value: branchValue });

  // Card
  let card: string | null = null;
  const cardText = text('card');
  if (cardText !== '') {
    const uid = normalizeCardUid(cardText);
    if (uid === null) {
      issues.push({ key: 'card_invalid', field: 'card', value: cardText });
      keep('card', cardText);
    } else if (!options.canGiveCards) {
      issues.push({ key: 'card_kept', field: 'card', value: uid });
      keep('card', uid);
    } else {
      card = uid;
      if (/^\d{10}$/.test(toLatinDigits(cardText).trim())) {
        issues.push({ key: 'card_decimal', field: 'card', value: uid });
      }
    }
  }

  // Kept for later
  keep('oldNumber', text('oldNumber'));
  keep('subscriptionType', text('subscriptionType'));
  const subscriptionEnd = readImportDate(cell('subscriptionEnd'));
  if (subscriptionEnd.kind === 'date') keep('subscriptionEnd', subscriptionEnd.date);
  else keep('subscriptionEnd', text('subscriptionEnd'));

  return {
    row,
    issues,
    draft: {
      fullName,
      gender,
      phone,
      emergencyContactName: optionalText(
        text('emergencyContactName'),
        MEMBER_LIMITS.emergencyContactName,
        'emergencyContactName',
        issues,
      ),
      emergencyPhone,
      birthDate,
      joinedOn,
      branchValue,
      branchId,
      address: optionalText(text('address'), MEMBER_LIMITS.address, 'address', issues),
      notes,
      bloodType,
      medicalNotes,
      card,
      kept,
    },
  };
}

function withIssue(
  row: ImportRow,
  issue: ImportIssue,
  draft: Partial<ImportDraft> = {},
): ImportRow {
  return { ...row, issues: [...row.issues, issue], draft: { ...row.draft, ...draft } };
}

/** A phone given to someone else: the member keeps it as their emergency contact's phone. */
function sharePhone(row: ImportRow, issue: ImportIssue): ImportRow {
  const phone = row.draft.phone;
  return withIssue(row, issue, {
    phone: null,
    emergencyPhone: row.draft.emergencyPhone ?? phone,
  });
}

/**
 * Duplicates inside the file, among the rows that can be imported, the earlier row winning: the
 * same phone (a later row with a different name keeps it as their emergency contact's phone),
 * the same card (a later row is imported without it), and names that may be the same person.
 */
export function markImportDuplicates(rows: readonly ImportRow[]): ImportRow[] {
  const phones = new Map<string, ImportRow>();
  const cards = new Map<string, number>();
  const byFlat = new Map<string, number>();
  const byFirstKey = new Map<string, ImportRow[]>();
  return rows.map((original) => {
    if (importRowStatus(original) === 'error') return original;
    let row = original;
    const name = row.draft.fullName ?? '';
    const normalized = normalizeSearchText(name);

    const flat = normalized.replaceAll(' ', '');
    const firstKey = nameSkeleton(normalized.split(' ')[0] ?? '');
    const earlierSame = flat.length >= 3 ? byFlat.get(flat) : undefined;
    let samePerson: number | null =
      earlierSame ??
      (byFirstKey.get(firstKey) ?? []).find(
        (earlier) => memberNamesMatch(earlier.draft.fullName ?? '', name) !== null,
      )?.row ??
      null;

    const phone = row.draft.phone;
    const phoneOwner = phone === null ? undefined : phones.get(phone);
    if (phoneOwner !== undefined) {
      const sameName = memberNamesMatch(phoneOwner.draft.fullName ?? '', name) !== null;
      row = sharePhone(row, { key: 'shared_phone', field: 'phone', row: phoneOwner.row });
      if (sameName) samePerson ??= phoneOwner.row;
    } else if (phone !== null) phones.set(phone, row);

    const card = row.draft.card;
    const cardOwner = card === null ? undefined : cards.get(card);
    if (cardOwner !== undefined) {
      row = withIssue(row, { key: 'card_repeated', field: 'card', row: cardOwner }, { card: null });
    } else if (card !== null) cards.set(card, row.row);

    if (samePerson !== null) row = withIssue(row, { key: 'same_person', row: samePerson });

    if (flat.length >= 3 && !byFlat.has(flat)) byFlat.set(flat, row.row);
    if (firstKey !== '') byFirstKey.set(firstKey, [...(byFirstKey.get(firstKey) ?? []), row]);
    return row;
  });
}

/** What the server's check found for a row (check_member_import). */
export interface ImportServerMatch {
  readonly row: number;
  readonly match: 'phone' | 'card_active' | 'card_blocked' | 'same_name' | 'similar_name';
  readonly member: ImportMemberRef | null;
}

/**
 * Existing members and cards (check_member_import): a member with the same phone and name is
 * already in the app; with another name, the row keeps that phone as their emergency contact's
 * phone. A card someone has, or a blocked one, is left out. A similar name may be the same person.
 */
export function applyImportMatches(
  rows: readonly ImportRow[],
  matches: readonly ImportServerMatch[],
): ImportRow[] {
  const byRow = new Map<number, ImportServerMatch[]>();
  for (const match of matches) byRow.set(match.row, [...(byRow.get(match.row) ?? []), match]);
  return rows.map((original) => {
    let row = original;
    const name = row.draft.fullName ?? '';
    const found = byRow.get(row.row) ?? [];
    const phoneMatch = found.find((match) => match.match === 'phone' && match.member !== null);
    if (phoneMatch?.member) {
      row =
        memberNamesMatch(phoneMatch.member.fullName, name) !== null
          ? withIssue(row, { key: 'already_member', member: phoneMatch.member })
          : sharePhone(row, { key: 'shared_phone', field: 'phone', member: phoneMatch.member });
    }
    for (const match of found) {
      if (match.match === 'card_active' && row.draft.card !== null) {
        row = withIssue(
          row,
          { key: 'card_taken', field: 'card', ...(match.member ? { member: match.member } : {}) },
          { card: null },
        );
      } else if (match.match === 'card_blocked' && row.draft.card !== null) {
        row = withIssue(row, { key: 'card_blocked', field: 'card' }, { card: null });
      }
    }
    if (!row.issues.some((issue) => issue.key === 'already_member')) {
      const person = found.find(
        (match) =>
          (match.match === 'same_name' || match.match === 'similar_name') &&
          match.member !== null &&
          match.member.id !== phoneMatch?.member?.id,
      );
      if (person?.member) row = withIssue(row, { key: 'same_person', member: person.member });
    }
    return row;
  });
}

/** Reads a whole sheet and finds the duplicates inside it (the server's check comes after). */
export function prepareImport(
  sheet: ImportSheet,
  columns: readonly (ImportField | null)[],
  options: ImportOptions,
): ImportRow[] {
  return markImportDuplicates(
    sheet.rows.map((each) => readImportRow(each.cells, each.row, columns, options)),
  );
}

/** One row as import_members() takes it (ids made by the app). */
export interface ImportPayloadRow {
  readonly row: number;
  readonly id: string;
  readonly branch_id: string;
  readonly full_name: string;
  readonly gender: Gender;
  readonly phone: string | null;
  readonly emergency_contact_name: string | null;
  readonly emergency_phone: string | null;
  readonly birth_date: string | null;
  readonly joined_on: string | null;
  readonly address: string | null;
  readonly notes: string | null;
  readonly blood_type: BloodType | null;
  readonly medical_notes: string | null;
  readonly card_id: string | null;
  readonly card_uid: string | null;
  readonly kept: KeptValues;
}

/** The payload of a row that can be imported; null for one that can't. */
export function importPayloadRow(
  row: ImportRow,
  ids: { readonly member: string; readonly card: string },
): ImportPayloadRow | null {
  const { draft } = row;
  const status = importRowStatus(row);
  if (status === 'error' || status === 'exists') return null;
  if (draft.fullName === null || draft.gender === null || draft.branchId === null) return null;
  if (draft.phone === null && draft.emergencyPhone === null) return null;
  return {
    row: row.row,
    id: ids.member,
    branch_id: draft.branchId,
    full_name: draft.fullName,
    gender: draft.gender,
    phone: draft.phone,
    emergency_contact_name: draft.emergencyContactName,
    emergency_phone: draft.emergencyPhone,
    birth_date: draft.birthDate,
    joined_on: draft.joinedOn,
    address: draft.address,
    notes: draft.notes,
    blood_type: draft.bloodType,
    medical_notes: draft.medicalNotes,
    card_id: draft.card === null ? null : ids.card,
    card_uid: draft.card,
    kept: draft.kept,
  };
}
