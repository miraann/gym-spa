// pnpm server:pgtap: supabase/tests against the running development server (pnpm server:dev
// start), without making it again. `pnpm test:offline --pgtap` makes a fresh one first.
import { runPgTap } from '../pgtap.ts';
import { devDataRoot } from '../paths.ts';
import { DEV_PORTS } from '../ports.ts';
import { openDatabase } from '../stack.ts';

try {
  const failed = runPgTap(openDatabase({ dataRoot: devDataRoot(), ports: DEV_PORTS }), (line) => {
    console.log(line);
  });
  if (failed > 0) process.exitCode = 1;
} catch (error) {
  console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
