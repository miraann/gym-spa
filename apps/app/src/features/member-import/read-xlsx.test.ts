// @vitest-environment node
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readXlsx, XlsxError } from './read-xlsx';

/** A small .xlsx file: the given sheet XML, shared strings and styles. */
function workbook(sheetRows: string, options: { strings?: string[]; date1904?: boolean } = {}) {
  const files: Record<string, Uint8Array> = {
    'xl/workbook.xml': strToU8(
      `<workbook xmlns:r="r">${options.date1904 ? '<workbookPr date1904="1"/>' : ''}<sheets><sheet name="ئەندامان" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    'xl/styles.xml': strToU8(
      '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="#,##0"/></numFmts>' +
        '<cellXfs><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="165"/><xf numFmtId="14"/></cellXfs></styleSheet>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `<worksheet><sheetData>${sheetRows}</sheetData></worksheet>`,
    ),
  };
  if (options.strings) {
    files['xl/sharedStrings.xml'] = strToU8(
      `<sst>${options.strings.map((each) => `<si>${each}</si>`).join('')}</sst>`,
    );
  }
  return zipSync(files);
}

describe('readXlsx', () => {
  it('reads shared, inline and rich text, numbers, dates and empty cells by column', () => {
    const file = workbook(
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
        '<row r="3"><c r="A3" t="inlineStr"><is><t>ئارام &amp; شیلان</t></is></c>' +
        '<c r="B3" s="1"><v>45301</v></c><c r="C3" s="2"><v>7501234567</v></c>' +
        '<c r="D3" s="3"><v>37230</v></c><c r="E3" t="b"><v>1</v></c></row>',
      { strings: ['<t>ناو</t>', '<r><t>ژمارەی </t></r><r><t>مۆبایل</t></r>'] },
    );
    expect(readXlsx(file)).toEqual([
      ['ناو', null, 'ژمارەی مۆبایل'],
      [],
      [
        'ئارام & شیلان',
        new Date(Date.UTC(2024, 0, 10)),
        7501234567,
        new Date(Date.UTC(2001, 11, 5)),
        true,
      ],
    ]);
  });

  it('counts days from 1904 when the workbook says so', () => {
    const file = workbook('<row r="1"><c r="A1" s="1"><v>0</v></c></row>', { date1904: true });
    expect(readXlsx(file)).toEqual([[new Date(Date.UTC(1904, 0, 1))]]);
  });

  it('tells an old .xls file and a broken file apart', () => {
    const xls = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(() => readXlsx(xls)).toThrow(new XlsxError('xls'));
    expect(() => readXlsx(Uint8Array.from([1, 2, 3]))).toThrow(new XlsxError('unreadable'));
  });
});
