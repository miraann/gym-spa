import type { FoundServer, PairResult, ProbedServer, ServerLinkStatus } from './desktop-bridge';
import { desktopBridge } from './runtime';

// The offline edition's link to the gym's server PC (step OF-d), kept by the Windows app's main
// process: the page asks it to find, check and pair with a server, and never sees the address's
// certificate checks or the token itself. Only the Windows app has it (the offline edition is a
// Windows build); elsewhere there is no link.

export type { FoundServer, PairResult, ProbedServer, ServerLinkStatus };

/** Whether this device can link to an offline server (the Windows app). */
export function canLinkServer(): boolean {
  return desktopBridge !== undefined;
}

export function serverLinkStatus(): Promise<ServerLinkStatus | null> {
  return desktopBridge ? desktopBridge.serverStatus() : Promise.resolve(null);
}

export function findServers(): Promise<readonly FoundServer[]> {
  return desktopBridge ? desktopBridge.findServers() : Promise.resolve([]);
}

export function probeServer(address: string): Promise<ProbedServer | null> {
  return desktopBridge ? desktopBridge.probeServer(address) : Promise.resolve(null);
}

export function pairWithServer(
  server: Pick<ProbedServer, 'address' | 'port' | 'fingerprint'>,
  code: string,
  name: string,
): Promise<PairResult> {
  return desktopBridge
    ? desktopBridge.pairWithServer(server, code, name)
    : Promise.resolve({ ok: false, error: 'unreachable' });
}

export function linkThisPcAsServer(): Promise<boolean> {
  return desktopBridge ? desktopBridge.linkThisPc() : Promise.resolve(false);
}
