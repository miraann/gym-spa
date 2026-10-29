// `pnpm db:functions` runs this first: the local seller-admin function gets a throwaway license
// signing key (spec §2.6, step MT-5), so issuing licenses works and is tested locally. It goes into
// supabase/functions/.env (git-ignored), which `supabase functions serve` reads.
//
// Only test keys ever go there: their kid starts with "test-", and no shipped server accepts what
// they sign (LICENSE_PUBLIC_KEYS never holds a test kid). Click Group's real key is made by
// `pnpm license:new-key` and goes straight into the cloud project's secrets (README → Licenses).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { generateLicenseKey, isTestLicenseKid } from '@gym/core';
import { fail, run } from './script-support';

const ENV_FILE = new URL('../functions/.env', import.meta.url);
const NAME = 'LICENSE_SIGNING_KEY';

/** The kid of the key already in the file, or null when there is none. */
function existingKid(text: string): string | null {
  const line = text.split(/\r?\n/).find((entry) => entry.startsWith(`${NAME}=`));
  if (line === undefined) return null;
  const value = line.slice(NAME.length + 1).replace(/^'(.*)'$/, '$1');
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null && 'kid' in parsed) return String(parsed.kid);
  } catch {
    // Not a key we made: refused below.
  }
  return '';
}

async function main() {
  const text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '';
  const kid = existingKid(text);
  if (kid !== null) {
    if (!isTestLicenseKid(kid)) {
      fail(
        `supabase/functions/.env has a ${NAME} that isn't a test key. A real signing key never ` +
          'belongs on disk: remove that line (README → Licenses).',
      );
    }
    return;
  }
  const newKid = `test-${crypto.randomUUID().slice(0, 8)}`;
  const { privateJwk } = await generateLicenseKey(newKid);
  const separator = text === '' || text.endsWith('\n') ? '' : '\n';
  writeFileSync(
    ENV_FILE,
    `${text}${separator}# A throwaway local key (pnpm db:functions); never a real one.\n${NAME}='${privateJwk}'\n`,
  );
  console.log(`Made the local test license key ${newKid} in supabase/functions/.env.`);
}

await run(main);
