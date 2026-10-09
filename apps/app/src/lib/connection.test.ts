import { describe, expect, it } from 'vitest';
import { ConnectionMonitor } from './connection';

const CONFIG = { supabaseUrl: 'https://server.example', supabaseKey: 'key' };

function answering(status: number): typeof fetch {
  return () => Promise.resolve(new Response(null, { status }));
}

async function stateAfterCheck(monitor: ConnectionMonitor) {
  await monitor.check();
  return monitor.getSnapshot().state;
}

describe('ConnectionMonitor', () => {
  it('starts as checking', () => {
    expect(new ConnectionMonitor(CONFIG, answering(200), () => true).getSnapshot()).toEqual({
      state: 'checking',
      checkedAt: null,
    });
  });

  it('is connected when the server answers its health check', async () => {
    const asked: string[] = [];
    const fetcher: typeof fetch = (input) => {
      asked.push(input instanceof Request ? input.url : input.toString());
      return Promise.resolve(new Response(null, { status: 200 }));
    };
    const monitor = new ConnectionMonitor(CONFIG, fetcher, () => true);
    expect(await stateAfterCheck(monitor)).toBe('connected');
    expect(asked).toEqual(['https://server.example/auth/v1/health']);
    expect(monitor.getSnapshot().checkedAt).toBeInstanceOf(Date);
  });

  it('is offline without a network, and does not ask the server', async () => {
    let asked = false;
    const fetcher: typeof fetch = () => {
      asked = true;
      return Promise.resolve(new Response(null, { status: 200 }));
    };
    expect(await stateAfterCheck(new ConnectionMonitor(CONFIG, fetcher, () => false))).toBe(
      'offline',
    );
    expect(asked).toBe(false);
  });

  it('is unreachable when the server fails or does not answer', async () => {
    expect(await stateAfterCheck(new ConnectionMonitor(CONFIG, answering(503), () => true))).toBe(
      'unreachable',
    );
    const failing: typeof fetch = () => Promise.reject(new TypeError('Failed to fetch'));
    expect(await stateAfterCheck(new ConnectionMonitor(CONFIG, failing, () => true))).toBe(
      'unreachable',
    );
  });

  it('is unreachable in a build without a server address', async () => {
    expect(await stateAfterCheck(new ConnectionMonitor(null, answering(200), () => true))).toBe(
      'unreachable',
    );
  });

  it('runs one check at a time', async () => {
    let calls = 0;
    const fetcher: typeof fetch = () => {
      calls += 1;
      return Promise.resolve(new Response(null, { status: 200 }));
    };
    const monitor = new ConnectionMonitor(CONFIG, fetcher, () => true);
    await Promise.all([monitor.check(), monitor.check()]);
    expect(calls).toBe(1);
  });
});
