import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

// Windows access rights for the server's data folder: its database, its keys and its backups are
// readable only by the account the server runs as, SYSTEM and the Administrators group. Groups are
// named by their SIDs, because Windows translates their names (a Kurdish or Arabic Windows has no
// group called "Administrators").

const SYSTEM = 'S-1-5-18';
const ADMINISTRATORS = 'S-1-5-32-544';
/** Windows' own programs by full path: a PATH with Git's tools has a different whoami. */
const SYSTEM32 = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32');

/** The SID of the account this process runs as. */
export function currentUserSid(): string {
  const result = spawnSync(path.join(SYSTEM32, 'whoami.exe'), ['/user', '/fo', 'csv', '/nh'], {
    encoding: 'utf8',
  });
  const sid = /"(S-1-[\d-]+)"/.exec(result.stdout)?.[1];
  if (result.status !== 0 || !sid) throw new Error('Could not read this account (whoami /user).');
  return sid;
}

/**
 * Step 1, the folder itself: no inherited rights, only these accounts, passed on to everything in
 * it ((OI)(CI)). Those flags mean nothing on a file, so files are never given them directly.
 */
export function restrictArguments(folder: string, sids: readonly string[]): string[] {
  const grants = [...new Set([SYSTEM, ADMINISTRATORS, ...sids])].flatMap((sid) => [
    '/grant:r',
    `*${sid}:(OI)(CI)F`,
  ]);
  return [folder, '/inheritance:r', ...grants, '/Q'];
}

/** Step 2, what is in it already: only what it inherits from the folder. */
export function inheritArguments(folder: string): string[] {
  return [path.join(folder, '*'), '/reset', '/T', '/C', '/Q'];
}

function icacls(args: readonly string[], what: string): void {
  const result = spawnSync(path.join(SYSTEM32, 'icacls.exe'), args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`icacls could not ${what}:\n${result.stdout}${result.stderr}`);
  }
}

/** Takes every other account's access to the folder and everything in it away. */
export function restrictFolder(folder: string, sids: readonly string[] = [currentUserSid()]): void {
  icacls(restrictArguments(folder, sids), `protect ${folder}`);
  if (readdirSync(folder).length > 0)
    icacls(inheritArguments(folder), `protect what is in ${folder}`);
}
