// Runs the Android Gradle wrapper in ./android with the Android SDK found automatically.
// Usage: node scripts/gradle.mjs <tasks...>   e.g. node scripts/gradle.mjs assembleDebug
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const androidDir = fileURLToPath(new URL('../android/', import.meta.url));
const isWindows = process.platform === 'win32';

// gradlew.bat expands its own folder path unquoted, so "&" in the path splits the command.
if (isWindows && androidDir.includes('&')) {
  console.error(
    `The project path contains "&": ${androidDir}\n` +
      'Gradle cannot run from such a folder on Windows. Move the project to a path without "&" ' +
      '(for example F:\\gym-spa), then run "pnpm install" once.',
  );
  process.exit(1);
}

function defaultSdkDir() {
  if (isWindows) return path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
  if (process.platform === 'darwin') return path.join(homedir(), 'Library', 'Android', 'sdk');
  return path.join(homedir(), 'Android', 'Sdk');
}

const sdkDir = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, defaultSdkDir()].find(
  (dir) => dir && existsSync(dir),
);
if (!sdkDir) {
  console.error(
    'Android SDK not found. Install Android Studio, or set ANDROID_HOME to the SDK folder.',
  );
  process.exit(1);
}

const tasks = process.argv.slice(2);
const env = { ...process.env, ANDROID_HOME: sdkDir };
// Windows: ".\" because cmd doesn't look in the current folder when NoDefaultCurrentDirectoryInExePath
// is set. Elsewhere: through sh, so a gradlew checked out without its executable bit still runs.
const result = isWindows
  ? spawnSync(`.\\gradlew.bat ${tasks.join(' ')}`, {
      cwd: androidDir,
      env,
      stdio: 'inherit',
      shell: true,
    })
  : spawnSync('sh', ['./gradlew', ...tasks], { cwd: androidDir, env, stdio: 'inherit' });

process.exit(result.status ?? 1);
