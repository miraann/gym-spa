import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { readBackendConfig, type BackendConfig } from './backend';

// Both editions always need the server (CLAUDE.md → Two editions): this tells the app whether it
// can be reached. The online edition's server is Supabase, the offline edition's is the gym's
// server PC; both answer GET /auth/v1/health.

/**
 * - checking: the first check hasn't finished.
 * - offline: the device has no network.
 * - unreachable: the device has a network but the server doesn't answer (or the build has no
 *   server address).
 */
export type ConnectionState = 'checking' | 'connected' | 'offline' | 'unreachable';

export interface ConnectionSnapshot {
  readonly state: ConnectionState;
  /** When the last check finished. */
  readonly checkedAt: Date | null;
}

const CHECK_CONNECTED_MS = 30_000;
const CHECK_DISCONNECTED_MS = 10_000;
const TIMEOUT_MS = 8_000;

export class ConnectionMonitor {
  private snapshot: ConnectionSnapshot = { state: 'checking', checkedAt: null };
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | null = null;

  constructor(
    private readonly config: BackendConfig | null,
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
    private readonly isOnline: () => boolean = () => navigator.onLine,
  ) {}

  getSnapshot = (): ConnectionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    const first = this.listeners.size === 0;
    this.listeners.add(listener);
    if (first) this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  };

  /** Checks now (and again on the usual schedule after). */
  check = (): Promise<void> => {
    this.running ??= this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  };

  private readonly onNetworkChange = () => {
    void this.check();
  };

  private start(): void {
    window.addEventListener('online', this.onNetworkChange);
    window.addEventListener('offline', this.onNetworkChange);
    void this.check();
  }

  private stop(): void {
    window.removeEventListener('online', this.onNetworkChange);
    window.removeEventListener('offline', this.onNetworkChange);
    clearTimeout(this.timer);
  }

  private async run(): Promise<void> {
    clearTimeout(this.timer);
    const state = await this.probe();
    this.snapshot = { state, checkedAt: new Date() };
    // Queries wait while the server can't be reached, and refetch when it can again.
    onlineManager.setOnline(state === 'connected');
    for (const listener of this.listeners) listener();
    if (this.listeners.size > 0) {
      this.timer = setTimeout(
        () => void this.check(),
        state === 'connected' ? CHECK_CONNECTED_MS : CHECK_DISCONNECTED_MS,
      );
    }
  }

  private async probe(): Promise<ConnectionState> {
    if (!this.isOnline()) return 'offline';
    if (!this.config) return 'unreachable';
    try {
      const response = await this.fetcher(`${this.config.supabaseUrl}/auth/v1/health`, {
        headers: { apikey: this.config.supabaseKey },
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return response.ok ? 'connected' : 'unreachable';
    } catch {
      return this.isOnline() ? 'unreachable' : 'offline';
    }
  }
}

export const connection = new ConnectionMonitor(readBackendConfig());

// TanStack Query follows the monitor (set after every check), not the browser's online events:
// a network can be up while the server doesn't answer.
onlineManager.setEventListener(() => undefined);

export function useConnection(): ConnectionSnapshot {
  return useSyncExternalStore(connection.subscribe, connection.getSnapshot);
}
