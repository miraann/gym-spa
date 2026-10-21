import { describe, expect, it } from 'vitest';
import { parseCardReaderSettings } from './card-reader-settings';
import { scanOf } from './card-reader';

describe('scanOf', () => {
  it('turns a reversed keyboard-type reader around, and no other reader', () => {
    expect(scanOf({ uid: '806E5DC13BA204', reader: 'keyboard' }, 'reversed')).toEqual({
      uid: '04A23BC15D6E80',
      raw: '806E5DC13BA204',
    });
    expect(scanOf({ uid: '04A23BC15D6E80', reader: 'keyboard' }, 'normal').uid).toBe(
      '04A23BC15D6E80',
    );
  });

  it('keeps what the reader gave when it is no card UID', () => {
    expect(scanOf({ uid: '1234567890123', reader: 'keyboard' }, 'normal')).toEqual({
      uid: null,
      raw: '1234567890123',
    });
  });
});

describe('parseCardReaderSettings', () => {
  it('reads saved settings, and falls back to the normal byte order', () => {
    expect(parseCardReaderSettings('{"keyboardByteOrder":"reversed"}')).toEqual({
      keyboardByteOrder: 'reversed',
    });
    expect(parseCardReaderSettings('{"keyboardByteOrder":"sideways"}')).toEqual({
      keyboardByteOrder: 'normal',
    });
    expect(parseCardReaderSettings('not json')).toEqual({ keyboardByteOrder: 'normal' });
    expect(parseCardReaderSettings(null)).toEqual({ keyboardByteOrder: 'normal' });
  });
});
