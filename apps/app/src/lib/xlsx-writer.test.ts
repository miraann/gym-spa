import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readXlsx } from '@/features/member-import/read-xlsx';
import { columnName, workbookFiles, writeXlsx } from './xlsx-writer';

describe('xlsx writer', () => {
  it('names columns like Excel', () => {
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  });

  it('writes a Kurdish sheet (rightToLeft) with a bold heading row, text and numbers', () => {
    const files = workbookFiles({
      name: 'داهات: ڕۆژانە',
      headings: ['ڕۆژ', 'بڕ'],
      rows: [
        ['2026-10-29', 25000],
        ['<ئاو & چا>', null],
      ],
      rightToLeft: true,
    });
    const sheet = files['xl/worksheets/sheet1.xml'] ?? '';
    expect(sheet).toContain('rightToLeft="1"');
    expect(sheet).toContain(
      '<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">ڕۆژ</t></is></c>',
    );
    expect(sheet).toContain('<c r="B2"><v>25000</v></c>');
    expect(sheet).toContain('&lt;ئاو &amp; چا&gt;');
    expect(sheet).toContain('<c r="B3"/>');
    expect(files['xl/workbook.xml']).toContain('name="داهات  ڕۆژانە"');
  });

  it('is a zip that our own reader opens again', async () => {
    const blob = writeXlsx({
      name: 'Report',
      headings: ['Name', 'Amount'],
      rows: [['Aram', 1500]],
      rightToLeft: false,
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(Object.keys(unzipSync(bytes))).toContain('xl/worksheets/sheet1.xml');
    expect(strFromU8(unzipSync(bytes)['[Content_Types].xml'] ?? new Uint8Array())).toContain(
      'spreadsheetml',
    );
    const rows = readXlsx(bytes);
    expect(rows[0]).toEqual(['Name', 'Amount']);
    expect(rows[1]).toEqual(['Aram', 1500]);
  });
});
