import { createSocket } from 'node:dgram';
import { describe, expect, it } from 'vitest';
import {
  answerDiscovery,
  DISCOVERY_QUESTION,
  isDiscoveryQuestion,
  readDiscoveryAnswer,
  type DiscoveryAnswer,
} from '../src/discovery.ts';

const ANSWER: DiscoveryAnswer = {
  v: 1,
  port: 47200,
  identity: '000G-40R4',
  gym: { code: 'hawler-fit', name: 'جیمی هەولێر' },
  version: '0.1.0',
};

describe('discovery messages', () => {
  it('knows the question and nothing else', () => {
    expect(isDiscoveryQuestion(Buffer.from(DISCOVERY_QUESTION))).toBe(true);
    expect(isDiscoveryQuestion(Buffer.from(`${DISCOVERY_QUESTION}x`))).toBe(false);
    expect(isDiscoveryQuestion(Buffer.from('hello'))).toBe(false);
  });

  it('reads an answer, and nothing else', () => {
    expect(readDiscoveryAnswer(Buffer.from(JSON.stringify(ANSWER)))).toEqual(ANSWER);
    expect(
      readDiscoveryAnswer(Buffer.from(JSON.stringify({ ...ANSWER, gym: null }))),
    ).toMatchObject({
      gym: null,
    });
    expect(readDiscoveryAnswer(Buffer.from('{'))).toBeNull();
    expect(readDiscoveryAnswer(Buffer.from(JSON.stringify({ ...ANSWER, v: 2 })))).toBeNull();
  });
});

describe('answerDiscovery', () => {
  it('answers the question over UDP, to whoever asked', async () => {
    // Below Windows' dynamic range, like every port of the server.
    const port = 45201;
    const responder = await answerDiscovery(
      () => Promise.resolve(ANSWER),
      () => undefined,
      port,
    );
    const client = createSocket('udp4');
    try {
      const reply = await new Promise<Buffer>((resolve, reject) => {
        client.once('message', resolve);
        client.once('error', reject);
        client.send(DISCOVERY_QUESTION, port, '127.0.0.1');
        setTimeout(() => {
          reject(new Error('no answer'));
        }, 3000);
      });
      expect(readDiscoveryAnswer(reply)).toEqual(ANSWER);
    } finally {
      client.close();
      responder.stop();
    }
  });
});
