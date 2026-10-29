import { strToU8, zipSync } from 'fflate';

// A small Excel (.xlsx) writer for the reports (Phase 10, step 10c): one sheet of text and numbers,
// a bold heading row, right to left for Kurdish and Arabic. Made in the app, so both editions work
// without a server or the internet.

export type Cell = string | number | null;

export interface Sheet {
  /** The sheet's tab name (Excel allows 31 characters, without : \ / ? * [ ]). */
  readonly name: string;
  readonly headings: readonly string[];
  readonly rows: readonly (readonly Cell[])[];
  readonly rightToLeft: boolean;
}

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function escapeXml(text: string): string {
  return (
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      // XML 1.0 has no place for most control characters.
      // eslint-disable-next-line no-control-regex -- they are what is removed
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  );
}

/** A column's letters: 0 → A, 25 → Z, 26 → AA. */
export function columnName(index: number): string {
  let name = '';
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    name = String.fromCharCode(65 + ((rest - 1) % 26)) + name;
  }
  return name;
}

function cellXml(value: Cell, column: number, row: number, bold: boolean): string {
  const ref = `${columnName(column)}${String(row)}`;
  const style = bold ? ' s="1"' : '';
  if (value === null || value === '') return `<c r="${ref}"${style}/>`;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"${style}><v>${String(value)}</v></c>`;
  }
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}

function sheetName(name: string): string {
  return escapeXml(
    name
      .replace(/[:\\/?*[\]]/g, ' ')
      .slice(0, 31)
      .trim() || 'Sheet1',
  );
}

/** The workbook's files, before they are zipped. */
export function workbookFiles(sheet: Sheet): Record<string, string> {
  const rows = [sheet.headings, ...sheet.rows].map(
    (cells, index) =>
      `<row r="${String(index + 1)}">${cells.map((cell, column) => cellXml(cell, column, index + 1, index === 0)).join('')}</row>`,
  );
  const widths = sheet.headings.map(
    (_, column) =>
      `<col min="${String(column + 1)}" max="${String(column + 1)}" width="20" customWidth="1"/>`,
  );
  return {
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName(sheet.name)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"${sheet.rightToLeft ? ' rightToLeft="1"' : ''}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.join('')}</cols><sheetData>${rows.join('')}</sheetData></worksheet>`,
  };
}

/** The workbook as an .xlsx file. */
export function writeXlsx(sheet: Sheet): Blob {
  const files = Object.fromEntries(
    Object.entries(workbookFiles(sheet)).map(([path, xml]) => [path, strToU8(xml)]),
  );
  return new Blob([zipSync(files)], { type: MIME });
}
