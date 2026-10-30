import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { formatMachineCode, machineCodeFrom } from '@gym/core';

// This PC's machine code (spec §2.6): from the Windows machine id and the motherboard serial, so
// reinstalling Windows needs a new activation. The code itself is made by packages/core, the same
// function the seller panel's checks use.

const SYSTEM32 = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32');

/** HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid: made when Windows is installed. */
export function readMachineGuid(): string {
  const result = spawnSync(
    path.join(SYSTEM32, 'reg.exe'),
    ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
    { encoding: 'utf8' },
  );
  const guid = /MachineGuid\s+REG_SZ\s+(\S+)/.exec(result.stdout)?.[1];
  if (result.status !== 0 || !guid) throw new Error('Could not read the Windows machine id.');
  return guid;
}

/**
 * The motherboard's serial number. Cheap boards often have none or a placeholder ("Default
 * string"); the machine id still makes the code unique then.
 */
export function readBoardSerial(): string {
  const result = spawnSync(
    path.join(SYSTEM32, 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_BaseBoard).SerialNumber'],
    { encoding: 'utf8' },
  );
  return result.status === 0 ? result.stdout.trim() : '';
}

/** This PC's machine code, XXXX-XXXX-XXXX-XXXX-XXXX. */
export async function thisMachineCode(): Promise<string> {
  return formatMachineCode(await machineCodeFrom(readMachineGuid(), readBoardSerial()));
}
