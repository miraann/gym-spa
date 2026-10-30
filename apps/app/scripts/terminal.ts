// Stopping with a message and reading a hidden password, for the Android signing scripts (step
// 11b). Like supabase/scripts/script-support.ts, without its Supabase connection.
import { createInterface } from 'node:readline/promises';

export class ScriptError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

export function fail(message: string): never {
  throw new ScriptError(message);
}

/** Runs a script's main(): a ScriptError ends it with its message and exit code. */
export async function run(main: () => Promise<void>): Promise<void> {
  try {
    await main();
  } catch (error) {
    if (!(error instanceof ScriptError)) throw error;
    console.error(`\n✖ ${error.message}`);
    process.exitCode = error.exitCode;
  }
}

/** A terminal is needed: passwords are typed hidden, never taken from the environment or CI. */
export function checkTerminal(): void {
  if (process.env.CI) fail("Never in CI: run this on Click Group's own PC.");
  if (!process.stdin.isTTY) fail('Run this in a terminal: the password is typed, hidden.');
}

/** Reads a line without showing what is typed. */
export function readHidden(question: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) fail('Run this in a terminal: the password is typed, hidden.');
  return new Promise((resolve, reject) => {
    let value = '';
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n' || char === '\u0003') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          if (char === '\u0003') reject(new ScriptError('Cancelled.', 130));
          else resolve(value);
          return;
        }
        value = char === '\u007f' || char === '\b' ? value.slice(0, -1) : value + char;
      }
    };
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    stdin.on('data', onData);
  });
}

/** Asks to type `word` to go on; anything else stops without a change. */
export async function confirm(question: string, word = 'yes'): Promise<void> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  let answer = '';
  try {
    answer = await prompt.question(`${question} Type ${word} to go on: `);
  } catch {
    // The input ended.
  } finally {
    prompt.close();
  }
  if (answer.trim().toLowerCase() !== word) fail('Stopped. Nothing was changed.');
}
