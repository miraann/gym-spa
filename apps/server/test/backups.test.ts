import { describe, expect, it } from 'vitest';
import {
  backupName,
  DEFAULT_BACKUP_SETTINGS,
  parseBackupSettings,
  toPrune,
  untilBackup,
  type BackupEntry,
} from '../src/backups.ts';

const at = (iso: string) => Date.parse(iso);
const MINUTE = 60_000;

describe('untilBackup', () => {
  it('waits for the next HH:MM in Baghdad (UTC+3)', () => {
    // 22:00 UTC is 01:00 in Baghdad: 02:00 is an hour away.
    expect(untilBackup(at('2026-10-30T22:00:00Z'), '02:00')).toBe(60 * MINUTE);
    // 23:30 UTC is 02:30 in Baghdad: tomorrow's 02:00 is 23.5 hours away.
    expect(untilBackup(at('2026-10-30T23:30:00Z'), '02:00')).toBe(23.5 * 60 * MINUTE);
    // Exactly at the time: the next day's.
    expect(untilBackup(at('2026-10-30T23:00:00Z'), '02:00')).toBe(24 * 60 * MINUTE);
    expect(untilBackup(at('2026-10-30T10:00:00Z'), '13:15')).toBe(15 * MINUTE);
  });

  it('refuses a time that is not HH:MM', () => {
    expect(() => untilBackup(0, '25:00')).toThrow('invalid_time');
    expect(() => untilBackup(0, '2:00')).toThrow('invalid_time');
  });
});

describe('backupName', () => {
  it('names a backup by gym, Baghdad time and kind, so names sort by time', () => {
    expect(backupName('hawler-fit', at('2026-10-30T23:05:09Z'), 'daily')).toBe(
      'hawler-fit-20261031-020509-daily.dump',
    );
    expect(backupName(null, at('2026-10-30T10:00:00Z'), 'before-restore')).toBe(
      'server-20261030-130000-before-restore.dump',
    );
  });
});

describe('toPrune', () => {
  const entry = (day: number): BackupEntry => ({
    name: `gym-202610${String(day).padStart(2, '0')}-020000-daily.dump`,
    size: 1,
    createdAt: `2026-10-${String(day).padStart(2, '0')}T00:00:00.000Z`,
  });

  it('keeps the newest ones and gives the rest, oldest last', () => {
    const entries = [3, 1, 4, 2, 5].map(entry);
    expect(toPrune(entries, 3)).toEqual([entry(2).name, entry(1).name]);
    expect(toPrune(entries, 30)).toEqual([]);
  });
});

describe('parseBackupSettings', () => {
  it('reads what was saved, and falls back to 02:00 with no copy', () => {
    expect(parseBackupSettings(null)).toEqual(DEFAULT_BACKUP_SETTINGS);
    expect(parseBackupSettings('{"time":"03:30","copyTo":"E:\\\\backups"}')).toEqual({
      time: '03:30',
      copyTo: 'E:\\backups',
    });
    expect(parseBackupSettings('{"time":"9:00","copyTo":""}')).toEqual(DEFAULT_BACKUP_SETTINGS);
    expect(parseBackupSettings('{')).toEqual(DEFAULT_BACKUP_SETTINGS);
  });
});
