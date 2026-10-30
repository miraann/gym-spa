import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { LAN_PORT, SERVER_PORTS, type StackPorts } from './ports.ts';

// The installed server's settings: `server.json` in its data folder, written by nobody but an
// administrator who needs other ports (another program already uses one). Everything is optional;
// what is missing keeps its default.

export interface ServerConfig {
  readonly ports: StackPorts;
  readonly lanPort: number;
}

function port(value: unknown, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1024 || value > 65_535) {
    throw new Error(`server.json: ${name} must be a port number from 1024 to 65535.`);
  }
  return value;
}

/** Reads and checks a server.json text (empty: all defaults). */
export function parseServerConfig(text: string | null): ServerConfig {
  const raw: unknown = text === null || text.trim() === '' ? {} : JSON.parse(text);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('server.json must hold one JSON object.');
  }
  const settings = raw as Record<string, unknown>;
  const ports = (settings.ports ?? {}) as Record<string, unknown>;
  const config: ServerConfig = {
    ports: {
      postgres: port(ports.postgres, SERVER_PORTS.postgres, 'ports.postgres'),
      auth: port(ports.auth, SERVER_PORTS.auth, 'ports.auth'),
      rest: port(ports.rest, SERVER_PORTS.rest, 'ports.rest'),
      gateway: port(ports.gateway, SERVER_PORTS.gateway, 'ports.gateway'),
    },
    lanPort: port(settings.lanPort, LAN_PORT, 'lanPort'),
  };
  const { postgres, auth, rest, gateway } = config.ports;
  const all = [postgres, auth, rest, gateway, config.lanPort];
  if (new Set(all).size !== all.length) throw new Error('server.json: two ports are the same.');
  return config;
}

export function readServerConfig(dataRoot: string): ServerConfig {
  const file = path.join(dataRoot, 'server.json');
  return parseServerConfig(existsSync(file) ? readFileSync(file, 'utf8') : null);
}
