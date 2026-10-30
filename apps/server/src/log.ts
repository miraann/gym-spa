import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

// gym-server's own log and its programs' logs, in the data folder's logs. A log that has grown
// past 10 MB is moved aside when the server starts (one older copy is kept), so the disk of a
// server that runs for years never fills up with logs.

export const LOG_LIMIT_BYTES = 10 * 1024 * 1024;

/** Moves a log aside (to `<name>.1`, replacing the older copy) when it is too big. */
export function rotateIfBig(file: string, limit: number = LOG_LIMIT_BYTES): void {
  if (!existsSync(file) || statSync(file).size <= limit) return;
  const older = `${file}.1`;
  rmSync(older, { force: true });
  renameSync(file, older);
}

/** Every log in the folder, rotated as needed. */
export function rotateLogs(folder: string, names: readonly string[]): void {
  mkdirSync(folder, { recursive: true });
  for (const name of names) rotateIfBig(path.join(folder, name));
}

/** A line logger to a file (and to the console while run by hand). */
export function fileLog(file: string, echo: boolean): (line: string) => void {
  mkdirSync(path.dirname(file), { recursive: true });
  return (line) => {
    const stamped = `${new Date().toISOString()} ${line}`;
    try {
      appendFileSync(file, `${stamped}\n`);
    } catch {
      // A full or locked disk must not stop the server; the console still has it.
    }
    if (echo) console.log(stamped);
  };
}
