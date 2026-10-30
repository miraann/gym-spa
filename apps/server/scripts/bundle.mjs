// pnpm server:bundle: apps/server/dist/server, the server folder the offline installer puts on the
// gym's server PC (resources\server), from the parts `pnpm server:tools` fetched (spec §8, OF-f):
//
//   node.exe                 Node's own, signed by the OpenJS Foundation
//   gym-server.mjs           gym-server, bundled, with this build's date (updates until)
//   gym-server-admin.mjs     the administrator's command line
//   GymSpaServer.exe/.xml    WinSW and its settings: the Windows service
//   *.cmd                    installing, removing and updating the service
//   pgsql\ auth\ postgrest\  Postgres (bin, lib, share; no pgTAP), Supabase Auth, PostgREST
//   sql\ migrations\         the Supabase roles and our migrations
//
// It also writes apps/server/dist/offline-installer.nsh (the installer's two modes, with the build
// date) for electron-builder.offline.config.mjs.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const serverDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const repo = path.resolve(serverDir, '..', '..');
const out = path.join(serverDir, 'dist', 'server');
const tools =
  process.env.GYM_SERVER_TOOLS ??
  path.join(process.env.LOCALAPPDATA ?? '', 'gym-spa', 'server-tools');
// The build's day in Baghdad: a perpetual license's "updates until" is compared with it.
const buildDate = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
const version = JSON.parse(
  readFileSync(path.join(repo, 'apps', 'app', 'package.json'), 'utf8'),
).version;

for (const part of [
  'pgsql/bin/postgres.exe',
  'auth/auth.exe',
  'postgrest/postgrest.exe',
  'node/node.exe',
  'winsw/WinSW-x64.exe',
]) {
  if (!existsSync(path.join(tools, part))) {
    console.error(`${part} is missing in ${tools}: run pnpm server:tools first.`);
    process.exit(1);
  }
}

// Emptied rather than removed: Windows refuses to remove a folder some shell is still inside.
mkdirSync(out, { recursive: true });
for (const entry of readdirSync(out))
  rmSync(path.join(out, entry), { recursive: true, force: true });

await build({
  absWorkingDir: serverDir,
  entryPoints: { 'gym-server': 'src/cli/serve.ts', 'gym-server-admin': 'src/cli/admin.ts' },
  outdir: out,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  // Some dependencies still call require(): give the bundle one.
  banner: {
    js: "import { createRequire as gymRequire } from 'node:module'; const require = gymRequire(import.meta.url);",
  },
  define: { 'process.env.GYM_SERVER_BUILD_DATE': JSON.stringify(buildDate) },
  logLevel: 'warning',
});

const copy = (from, to, filter) => {
  cpSync(from, path.join(out, to), { recursive: true, ...(filter ? { filter } : {}) });
};
copy(path.join(tools, 'pgsql', 'bin'), 'pgsql/bin');
copy(path.join(tools, 'pgsql', 'lib'), 'pgsql/lib');
// pgTAP is for the tests only.
copy(
  path.join(tools, 'pgsql', 'share'),
  'pgsql/share',
  (file) => !path.basename(file).startsWith('pgtap'),
);
copy(path.join(tools, 'auth', 'auth.exe'), 'auth/auth.exe');
copy(path.join(tools, 'auth', 'migrations'), 'auth/migrations');
copy(path.join(tools, 'postgrest', 'postgrest.exe'), 'postgrest/postgrest.exe');
copy(path.join(tools, 'node', 'node.exe'), 'node.exe');
copy(path.join(tools, 'winsw', 'WinSW-x64.exe'), 'GymSpaServer.exe');
copy(path.join(serverDir, 'sql', 'compat.sql'), 'sql/compat.sql');
copy(path.join(repo, 'supabase', 'migrations'), 'migrations', (file) => !file.endsWith('.md'));
for (const file of readdirSync(path.join(serverDir, 'service'))) {
  if (file.endsWith('.cmd') || file.endsWith('.xml'))
    copy(path.join(serverDir, 'service', file), file);
}
writeFileSync(
  path.join(out, 'build-info.json'),
  `${JSON.stringify({ version, buildDate }, null, 2)}\n`,
);

// The installer's script, with the build date; UTF-8 with a BOM, so NSIS reads the Kurdish texts.
const template = readFileSync(path.join(serverDir, 'service', 'installer.nsh'), 'utf8');
writeFileSync(
  path.join(serverDir, 'dist', 'offline-installer.nsh'),
  `${String.fromCharCode(0xfeff)}${template.replace('@GYM_BUILD_DATE@', buildDate)}`,
);
console.log(`server bundle: ${out} (version ${version}, built ${buildDate})`);
