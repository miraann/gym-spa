import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import plugin, { findPhysicalClasses } from './index.js';

describe('findPhysicalClasses', () => {
  it('finds physical utilities, including with variants', () => {
    expect(
      findPhysicalClasses('ml-2 md:pr-4 hover:left-0 -mr-1 !pl-3 text-left border-l rounded-r-md'),
    ).toEqual([
      'ml-2',
      'md:pr-4',
      'hover:left-0',
      '-mr-1',
      '!pl-3',
      'text-left',
      'border-l',
      'rounded-r-md',
    ]);
  });

  it('allows logical utilities and look-alikes', () => {
    expect(
      findPhysicalClasses(
        'ms-2 pe-4 start-0 end-2 text-start border-s rounded-e-md left right group-data-[side=left]:border-e mx-2 inset-x-0',
      ),
    ).toEqual([]);
  });
});

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

tester.run('no-physical-direction-classes', plugin.rules['no-physical-direction-classes'], {
  valid: ['<div className="ms-2 text-start" />', 'const side = "left"'],
  invalid: [
    { code: '<div className="ml-2 text-start" />', errors: [{ messageId: 'physical' }] },
    { code: 'cn(`pr-2 ${x}`)', errors: [{ messageId: 'physical' }] },
  ],
});

tester.run('no-import-meta-env-object', plugin.rules['no-import-meta-env-object'], {
  valid: [
    'const url = import.meta.env.VITE_SUPABASE_URL',
    'if (import.meta.env.DEV) start()',
    'const here = import.meta.url',
    // A define key in vite.config.ts is a string, not a use.
    'export default { define: { "import.meta.env.VITE_APP_VERSION": "1.0.0" } }',
  ],
  invalid: [
    'readBackendConfig(import.meta.env)',
    'function read(env = import.meta.env) { return env.VITE_SUPABASE_URL }',
    'const { VITE_SUPABASE_URL } = import.meta.env',
    'const value = import.meta.env[name]',
    'const value = import.meta.env["VITE_SUPABASE_URL"]',
    'const value = import.meta.env?.VITE_SUPABASE_URL',
    'console.log({ ...import.meta.env })',
  ].map((code) => ({ code, errors: [{ messageId: 'wholeObject' }] })),
});

tester.run('no-hardcoded-ui-text', plugin.rules['no-hardcoded-ui-text'], {
  valid: [
    '<p>{t("home.title")}</p>',
    '<span>123 · —</span>',
    '<input placeholder={t("search.placeholder")} />',
    '<div className="text-sm" data-testid="x" />',
    'toast(t("pwa.offlineReady"))',
  ],
  invalid: [
    { code: '<p>Hello</p>', errors: [{ messageId: 'hardcoded' }] },
    { code: '<p>سڵاو</p>', errors: [{ messageId: 'hardcoded' }] },
    { code: '<p>{"Hello"}</p>', errors: [{ messageId: 'hardcoded' }] },
    { code: '<input placeholder="Search" />', errors: [{ messageId: 'hardcoded' }] },
    { code: '<button aria-label={`Close`} />', errors: [{ messageId: 'hardcoded' }] },
    { code: 'toast.success("Saved")', errors: [{ messageId: 'hardcoded' }] },
  ],
});
