import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import gym from './tools/eslint-plugin-gym/index.js';

export default defineConfig(
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/dev-dist/',
    '**/playwright-report/',
    '**/test-results/',
    '**/routeTree.gen.ts',
    // Generated from the database: pnpm db:types.
    'packages/db/src/database.types.ts',
    // Generated native project (its build output contains copies of the web app).
    'apps/app/android/',
    'apps/desktop/release/',
    // Deno code (the Edge Functions): `pnpm test:deno` type-checks it with Deno's own rules.
    'supabase/functions/',
  ]),

  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },

  {
    files: ['**/*.{js,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  // The React app
  {
    files: ['apps/app/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
    plugins: { gym },
    rules: {
      'gym/no-physical-direction-classes': 'error',
      'gym/no-hardcoded-ui-text': 'error',
      'gym/no-import-meta-env-object': 'error',
      'gym/no-raw-color-classes': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@capacitor/*', '@capacitor-community/*', 'electron'],
              message: 'Platform code lives in the @gym/platform adapters (see CLAUDE.md).',
            },
          ],
        },
      ],
    },
  },

  // TanStack Router route files export `Route` next to their components.
  {
    files: ['apps/app/src/routes/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': ['error', { allowExportNames: ['Route'] }],
    },
  },

  // shadcn/ui components are vendored code: keep them close to upstream so updates stay easy.
  // Only purely stylistic rules are relaxed; type safety and the language rules still apply.
  {
    files: ['apps/app/src/components/ui/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
    },
  },

  // Shared packages
  {
    files: ['packages/*/src/**/*.{ts,tsx}'],
    plugins: { gym },
    rules: {
      'gym/no-physical-direction-classes': 'error',
      // These packages are bundled into the app too.
      'gym/no-import-meta-env-object': 'error',
    },
  },

  // Code that the staff-admin Edge Function runs in Deno, which resolves no import without its
  // extension.
  {
    files: [
      'packages/core/src/**/*.ts',
      'packages/db/src/**/*.ts',
      'packages/staff-admin/src/**/*.ts',
      'packages/staff-admin/test/**/*.ts',
    ],
    plugins: { gym },
    rules: {
      'gym/explicit-ts-extensions': 'error',
    },
  },
);
