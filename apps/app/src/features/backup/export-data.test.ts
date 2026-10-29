// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXPORT_TABLES, NOT_EXPORTED, toCsv } from './export-data';

describe('exporting all data', () => {
  it('names every table the database has: exported, or left out on purpose', () => {
    const types = readFileSync(
      new URL('../../../../../packages/db/src/database.types.ts', import.meta.url),
      'utf8',
    );
    const publicSchema = types.slice(types.indexOf('  public: {'));
    const tables = publicSchema.slice(
      publicSchema.indexOf('Tables: {'),
      publicSchema.indexOf('Views: {'),
    );
    const names = [...tables.matchAll(/\n {6}([a-z_]+): \{\n {8}Row: \{/g)].map(
      (match) => match[1],
    );
    expect(names.length).toBeGreaterThan(50);
    const known = new Set<string>([...EXPORT_TABLES, ...NOT_EXPORTED]);
    expect(names.filter((name) => name !== undefined && !known.has(name))).toEqual([]);
    expect(EXPORT_TABLES.filter((name) => !names.includes(name))).toEqual([]);
  });

  it('writes CSV that Excel reads in Kurdish, with JSON for objects', () => {
    const csv = toCsv([
      { id: '1', full_name: 'ئارام، کەریم', tags: ['vip'], note: null, active: true },
      { id: '2', full_name: 'شیلان "عەلی"', tags: [], note: 'x', active: false },
    ]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('id,full_name,tags,note,active');
    expect(lines[1]).toBe('1,ئارام، کەریم,"[""vip""]",,true');
    expect(lines[2]).toBe('2,"شیلان ""عەلی""",[],x,false');
    expect(toCsv([])).toBe('\uFEFF');
  });
});
