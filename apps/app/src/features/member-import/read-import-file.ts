import {
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  importSheetOf,
  type ImportCell,
  type ImportSheet,
} from '@gym/core';
import { readXlsx, XlsxError } from './read-xlsx';

// The file staff choose on the import page, read in the browser: nothing is uploaded, only the rows
// they import are sent. .xlsx files go through read-xlsx.ts, .csv files through papaparse (loaded
// only here).

export type ImportFileProblem = 'xls' | 'unreadable' | 'too_big' | 'empty' | 'too_many_rows';

export class ImportFileError extends Error {
  constructor(readonly problem: ImportFileProblem) {
    super(problem);
  }
}

export interface ImportFile {
  readonly name: string;
  readonly sheet: ImportSheet;
  /** A CSV file that wasn't UTF-8, read as Arabic Windows text: some letters may be wrong. */
  readonly guessedEncoding: boolean;
}

function decodeText(bytes: Uint8Array): { readonly text: string; readonly guessed: boolean } {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), guessed: false };
  } catch {
    // Excel's plain "CSV" on an Arabic Windows.
    return { text: new TextDecoder('windows-1256').decode(bytes), guessed: true };
  }
}

async function readCsv(bytes: Uint8Array): Promise<{ data: ImportCell[][]; guessed: boolean }> {
  const { default: Papa } = await import('papaparse');
  const { text, guessed } = decodeText(bytes);
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
  return { data: parsed.data, guessed };
}

export async function readImportFile(file: File): Promise<ImportFile> {
  if (file.size > IMPORT_MAX_BYTES) throw new ImportFileError('too_big');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let data: ImportCell[][];
  let guessed = false;
  if (/\.(csv|txt)$/i.test(file.name) || file.type === 'text/csv') {
    ({ data, guessed } = await readCsv(bytes));
  } else {
    try {
      data = readXlsx(bytes);
    } catch (error) {
      if (error instanceof XlsxError) throw new ImportFileError(error.problem);
      throw error;
    }
  }
  const sheet = importSheetOf(data);
  if (!sheet || sheet.rows.length === 0) throw new ImportFileError('empty');
  if (sheet.rows.length > IMPORT_MAX_ROWS) throw new ImportFileError('too_many_rows');
  return { name: file.name, sheet, guessedEncoding: guessed };
}
