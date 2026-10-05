// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import ckb from '../../../packages/i18n/src/locales/ckb/common.json' with { type: 'json' };

/**
 * `cap add android` copied the app name into strings.xml once; Capacitor never updates it again.
 * This keeps the name on the Android home screen in step with the Kurdish translation.
 */
const STRINGS_FILE = fileURLToPath(
  new URL('../android/app/src/main/res/values/strings.xml', import.meta.url),
);

function androidString(name: string): string | undefined {
  const xml = readFileSync(STRINGS_FILE, 'utf8');
  return new RegExp(`<string name="${name}">([^<]*)</string>`).exec(xml)?.[1];
}

describe('Android app name', () => {
  it('matches the Kurdish app name', () => {
    expect(androidString('app_name')).toBe(ckb.app.name);
    expect(androidString('title_activity_main')).toBe(ckb.app.name);
  });
});
