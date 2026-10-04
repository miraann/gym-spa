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
