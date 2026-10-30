import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseServerConfig } from '../src/config.ts';
import { LAN_PORT, SERVER_PORTS } from '../src/ports.ts';
import { inheritArguments, restrictArguments } from '../src/windows.ts';

describe('server.json', () => {
  it('defaults everything that is missing', () => {
    expect(parseServerConfig(null)).toEqual({ ports: SERVER_PORTS, lanPort: LAN_PORT });
    expect(parseServerConfig('')).toEqual({ ports: SERVER_PORTS, lanPort: LAN_PORT });
    expect(parseServerConfig('{"lanPort": 48200, "ports": {"postgres": 48210}}')).toEqual({
      ports: { ...SERVER_PORTS, postgres: 48210 },
      lanPort: 48200,
    });
  });

  it('refuses ports that cannot work', () => {
    expect(() => parseServerConfig('{"lanPort": 80}')).toThrow('lanPort must be a port number');
    expect(() => parseServerConfig('{"lanPort": "47200"}')).toThrow('lanPort');
    expect(() => parseServerConfig('{"ports": {"auth": 70000}}')).toThrow('ports.auth');
    expect(() => parseServerConfig(`{"lanPort": ${String(SERVER_PORTS.rest)}}`)).toThrow(
      'two ports are the same',
    );
    expect(() => parseServerConfig('[]')).toThrow('one JSON object');
    expect(() => parseServerConfig('{')).toThrow();
  });
});

describe('protecting the data folder', () => {
  it('leaves only SYSTEM, Administrators and the server account on the folder', () => {
    expect(restrictArguments('D:/gym-data', ['S-1-5-80-123'])).toEqual([
      'D:/gym-data',
      '/inheritance:r',
      '/grant:r',
      '*S-1-5-18:(OI)(CI)F',
      '/grant:r',
      '*S-1-5-32-544:(OI)(CI)F',
      '/grant:r',
      '*S-1-5-80-123:(OI)(CI)F',
      '/Q',
    ]);
  });

  it('names each account once', () => {
    expect(restrictArguments('x', ['S-1-5-18']).filter((arg) => arg === '/grant:r')).toHaveLength(
      2,
    );
  });

  it('then lets everything in it inherit only that', () => {
    expect(inheritArguments('D:/gym-data')).toEqual([
      path.join('D:/gym-data', '*'),
      '/reset',
      '/T',
      '/C',
      '/Q',
    ]);
  });
});
