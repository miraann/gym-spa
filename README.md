# Gym & Spa Management System

Offline-first, multi-branch gym & spa system with NFC check-in. One codebase for Web/PWA, Android and Windows. Kurdish Sorani is the default language; English and Arabic are also available.

- Repository: https://github.com/miraann/gym-spa
- Full spec: [gym-spa-system-prompt.md](gym-spa-system-prompt.md)
- Working rules for contributors and Claude: [CLAUDE.md](CLAUDE.md)

> **Status:** Phase 1a (monorepo, app shell, i18n/RTL, offline PWA). Android, Windows, Supabase, PowerSync and auth arrive in steps 1b–1e. This README grows with each step.

## Requirements

- **Node.js 24** (see `.node-version`)
- **pnpm 12**, through Corepack. If `corepack enable` fails with a permissions error on Windows, install the shim in your user folder instead:
  ```sh
  corepack enable --install-directory "%APPDATA%\npm" pnpm
  ```
- The project folder path must not contain `&`. Windows batch scripts (like Gradle's `gradlew.bat`, used for Android builds) break on it.

## Getting started

```sh
pnpm install
cp apps/app/.env.example apps/app/.env.local   # then fill in the values
pnpm dev                                       # http://localhost:5173
```

## Commands

Run from the repository root:

| Command | What it does |
|---|---|
| `pnpm dev` | Start the app in development mode (no service worker) |
| `pnpm build` | Production build into `apps/app/dist` |
| `pnpm preview` | Serve the production build at http://localhost:4173. Use this to try offline mode. |
| `pnpm test` | Unit tests (Vitest): formatting, translations, Sorani spelling, fonts, lint rules |
| `pnpm test:e2e` | Build, then run browser tests (Playwright): offline, RTL, language switching |
| `pnpm lint` | ESLint, including the project rules below |
| `pnpm typecheck` | TypeScript type checking for every package |
| `pnpm format` | Format all files with Prettier |
| `pnpm check` | Typecheck, lint, format check and unit tests together |

First-time setup for the browser tests: `pnpm --filter @gym/app exec playwright install chromium`.

## Project layout

```
apps/app             React + Vite app (PWA)
  src/app            app-level wiring: providers, navigation, service worker
  src/components     shared components; ui/ holds the shadcn/ui components
  src/features       one folder per module (home, settings, members, ...)
  src/lib            preferences, formatting, logging
  src/routes         TanStack Router file routes (thin; pages live in features/)
  e2e                Playwright tests
packages/i18n        translations (ckb, en, ar), typed keys, number/money/date formatting
tools/eslint-plugin-gym  project lint rules
```

## Languages

- **Kurdish (`ckb`) is the source language.** Add every new text to `packages/i18n/src/locales/ckb/*.json` first, then `en` and `ar`. A key missing from English or Arabic is a TypeScript error, and a test checks that all languages have the same keys and `{{placeholders}}`.
- A spelling test rejects Arabic letters in Kurdish texts (ي ك ى ة) and Kurdish letters in Arabic texts (ی ک ە).
- Lint rules:
  - `gym/no-hardcoded-ui-text`: text in JSX, labels, placeholders and toasts must come from `t('...')`.
  - `gym/no-physical-direction-classes`: use `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`/`text-start`, never `ml-`/`mr-`/`left-`/`text-left`, so layouts mirror in RTL.
- Dates are shown in Baghdad time. Kurdish uses Sorani month names (`4ی تشرینی یەکەمی 2026`). Digits are Western by default, with Eastern Arabic (`٢٥٬٠٠٠ د.ع`) as a setting.

## Deploying the web app (Vercel)

Import [miraann/gym-spa](https://github.com/miraann/gym-spa) in Vercel with **Root Directory = `apps/app`**. `apps/app/vercel.json` sets the install and build commands, the SPA rewrite and cache headers. Add the `VITE_*` environment variables from `apps/app/.env.example` in the Vercel project settings.
