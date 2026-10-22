import type { ImportCell } from '@gym/core';
import { strFromU8, unzipSync } from 'fflate';

// Reads the first sheet of an .xlsx file (step 2j), synchronously and without web workers: the
// app's Content-Security-Policy allows none, and spreadsheet libraries start one for big files. An
// .xlsx file is a zip of XML files; this reads only the parts a member list needs: the sheet's
// cells, the shared strings, and the styles that tell a date from a number.

export type XlsxProblem = 'xls' | 'unreadable';

export class XlsxError extends Error {
  constructor(readonly problem: XlsxProblem) {
    super(problem);
  }
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (whole, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return ENTITIES[entity] ?? whole;
  });
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match ? decodeXml(match[1] ?? '') : null;
}

/** The text of every <t> inside an element (rich text has several runs); phonetic runs left out. */
function textOf(xml: string): string {
  const withoutPhonetic = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  return [...withoutPhonetic.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map((match) => decodeXml(match[1] ?? ''))
    .join('');
}

function sharedStrings(xml: string | undefined): string[] {
  if (xml === undefined) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)].map((match) => textOf(match[1] ?? ''));
}

/** Excel's built-in number formats that show a date or a time. */
const BUILT_IN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function isDateFormat(code: string): boolean {
  // Ignore quoted text, [colors]/[conditions] and escaped characters before looking for d, m, y.
  const bare = code
    .replace(/"[^"]*"/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\\./g, '');
  return /[dy]/i.test(bare) || /(^|[^a-z])m{1,4}([^a-z]|$)/i.test(bare.replace(/general/gi, ''));
}

/** For each cell style (the s attribute), whether it shows a date. */
function dateStyles(xml: string | undefined): boolean[] {
  if (xml === undefined) return [];
  const custom = new Map<number, string>();
  for (const match of xml.matchAll(/<numFmt\b[^>]*>/g)) {
    const id = Number(attribute(match[0], 'numFmtId'));
    custom.set(id, attribute(match[0], 'formatCode') ?? '');
  }
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? '';
  return [...cellXfs.matchAll(/<xf\b[^>]*\/?>/g)].map((match) => {
    const id = Number(attribute(match[0], 'numFmtId') ?? '0');
    const code = custom.get(id);
    return code === undefined ? BUILT_IN_DATE_FORMATS.has(id) : isDateFormat(code);
  });
}

/** The zero-based column of a cell reference (A1 → 0, AB7 → 27). */
function columnOf(reference: string): number {
  let column = 0;
  for (const letter of /^[A-Z]+/.exec(reference)?.[0] ?? '') {
    column = column * 26 + (letter.charCodeAt(0) - 64);
  }
  return column - 1;
}

const DAY_MS = 86_400_000;

/** An Excel day number as a date (UTC midnight); 1904-based workbooks start four years later. */
function excelDate(serial: number, from1904: boolean): Date {
  const dayZero = from1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  return new Date(dayZero + Math.round(serial) * DAY_MS);
}

/** The path of the workbook's first sheet inside the zip. */
function firstSheetPath(files: Record<string, Uint8Array>): string {
  const workbookFile = files['xl/workbook.xml'];
  const relsFile = files['xl/_rels/workbook.xml.rels'];
  if (!workbookFile || !relsFile) return 'xl/worksheets/sheet1.xml';
  const workbook = strFromU8(workbookFile);
  const sheet = /<sheet\b[^>]*>/.exec(workbook)?.[0] ?? '';
  const id = attribute(sheet, 'r:id');
  for (const match of strFromU8(relsFile).matchAll(/<Relationship\b[^>]*>/g)) {
    if (attribute(match[0], 'Id') !== id) continue;
    const target = attribute(match[0], 'Target') ?? '';
    return target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  }
  return 'xl/worksheets/sheet1.xml';
}

/** The first sheet's rows, as arrays of cells (empty cells are null). */
export function readXlsx(bytes: Uint8Array): ImportCell[][] {
  // An old .xls file is an OLE compound file, not a zip.
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new XlsxError('xls');
  }
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) =>
        file.name === 'xl/workbook.xml' ||
        file.name === 'xl/_rels/workbook.xml.rels' ||
        file.name === 'xl/sharedStrings.xml' ||
        file.name === 'xl/styles.xml' ||
        file.name.startsWith('xl/worksheets/'),
    });
  } catch {
    throw new XlsxError('unreadable');
  }
  const sheetFile = files[firstSheetPath(files)];
  if (!sheetFile) throw new XlsxError('unreadable');
  const read = (name: string) => {
    const file = files[name];
    return file ? strFromU8(file) : undefined;
  };
  const strings = sharedStrings(read('xl/sharedStrings.xml'));
  const dates = dateStyles(read('xl/styles.xml'));
  const from1904 = /<workbookPr\b[^>]*\sdate1904="(1|true)"/.test(read('xl/workbook.xml') ?? '');

  // Sparse: rows and cells the file leaves out are holes until the end.
  const rows: (ImportCell[] | undefined)[] = [];
  const sheet = strFromU8(sheetFile);
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(attribute(rowMatch[0], 'r') ?? rows.length + 1);
    const cells: (ImportCell | undefined)[] = [];
    for (const cellMatch of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = `<c${cellMatch[1] ?? ''}>`;
      const body = cellMatch[2] ?? '';
      const reference = attribute(tag, 'r');
      const column = reference === null ? cells.length : columnOf(reference);
      const type = attribute(tag, 't');
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value: ImportCell = null;
      if (type === 's') value = strings[Number(raw)] ?? null;
      else if (type === 'inlineStr') value = textOf(body);
      else if (type === 'str') value = raw === undefined ? null : decodeXml(raw);
      else if (type === 'b') value = raw === '1';
      else if (type === 'e') value = null;
      else if (raw !== undefined && raw !== '') {
        const number = Number(raw);
        const style = Number(attribute(tag, 's') ?? '0');
        value = Number.isFinite(number)
          ? dates[style] === true
            ? excelDate(number, from1904)
            : number
          : decodeXml(raw);
      }
      cells[column] = value;
    }
    rows[rowNumber - 1] = Array.from(cells, (cell) => cell ?? null);
  }
  return Array.from(rows, (row) => row ?? []);
}
