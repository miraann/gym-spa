import { createSocket, type Socket } from 'node:dgram';

// Finding the server on the gym's network (spec §2.5, step OF-d): a new PC broadcasts a question on
// UDP 47201 and every offline server answers it directly with its HTTPS port, identity, gym and
// version. Nothing secret is in the answer (the same as /server/v1/info); a PC that can't hear the
// broadcast (another subnet, a firewall) types the server's address instead.

export const DISCOVERY_PORT = 47201;
export const DISCOVERY_QUESTION = 'gym-spa:discover:v1';

export interface DiscoveryAnswer {
  readonly v: 1;
  readonly port: number;
  readonly identity: string;
  readonly gym: { readonly code: string; readonly name: string } | null;
  readonly version: string;
}

/** Whether a datagram is the question (nothing else gets an answer). */
export function isDiscoveryQuestion(message: Buffer): boolean {
  return (
    message.length === DISCOVERY_QUESTION.length && message.toString('utf8') === DISCOVERY_QUESTION
  );
}

/** Reads a server's answer; null for anything else. */
export function readDiscoveryAnswer(message: Buffer): DiscoveryAnswer | null {
  try {
    const value = JSON.parse(message.toString('utf8')) as Partial<DiscoveryAnswer>;
    if (
      value.v !== 1 ||
      typeof value.port !== 'number' ||
      typeof value.identity !== 'string' ||
      typeof value.version !== 'string'
    ) {
      return null;
    }
    const gym =
      typeof value.gym === 'object' &&
      value.gym !== null &&
      typeof value.gym.code === 'string' &&
      typeof value.gym.name === 'string'
        ? { code: value.gym.code, name: value.gym.name }
        : null;
    return { v: 1, port: value.port, identity: value.identity, gym, version: value.version };
  } catch {
    return null;
  }
}

/** Answers the question while the server runs. */
export async function answerDiscovery(
  answer: () => Promise<DiscoveryAnswer>,
  log: (line: string) => void,
  port: number = DISCOVERY_PORT,
): Promise<{ stop: () => void }> {
  const socket: Socket = createSocket({ type: 'udp4', reuseAddr: true });
  socket.on('message', (message, from) => {
    if (!isDiscoveryQuestion(message)) return;
    answer().then(
      (value) => {
        socket.send(JSON.stringify(value), from.port, from.address);
      },
      () => undefined,
    );
  });
  socket.on('error', (error) => {
    log(`discovery: ${error.message}`);
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(port, () => {
      socket.off('error', reject);
      resolve();
    });
  });
  return {
    stop: () => {
      socket.close();
    },
  };
}
