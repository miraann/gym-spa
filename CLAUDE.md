# Gym & Spa Management System

Offline-first, multi-branch gym & spa system with NFC check-in. Targets: Web/PWA, Android, Windows (iOS later).

**Repository:** https://github.com/miraann/gym-spa (git remote `origin`, public).

**Full spec: [gym-spa-system-prompt.md](gym-spa-system-prompt.md).** It is the source of truth. This file is only a summary; if the two disagree, the spec wins. Read the relevant spec section before starting any phase or module.

## How to work

- Build in the phases from spec §8, in order. **Stop for the user's review after each phase.**
- **When a phase is split into sub-steps (Phase 1: 1a–1e), stop for review after each sub-step** and say how to test it and what to commit. The user makes the commits.
- Before writing code for a phase, present the plan (tables, files, assumptions) and **wait for approval**.
- At the end of each phase (and sub-step), report: what was built, migrations added, how to test manually, and known limitations.
- §4.7 Staff & HR is built in Phase 7 (together with classes and personal training).
- Ask only when a decision is truly blocking. Otherwise pick a sensible default and say so.
- Never skip migrations, RLS policies, or validation.

## Stack (do not change without asking)

- **App:** React + TypeScript + Vite SPA (no SSR), TanStack Router / Query / Table, Tailwind CSS, shadcn/ui, React Hook Form + Zod, Recharts.
- **Targets from one codebase:**
  - Web/PWA on Vercel: `vite-plugin-pwa` caches the whole app; `vercel.json` rewrites all routes to `index.html`.
  - Android: Capacitor 8+.
  - Windows EXE: Electron (auto-update, kiosk mode, auto-start, silent 80mm thermal printing).
  - iOS: **not in scope.** Don't create `ios/`, but keep code iOS-ready (only Capacitor plugins that support iOS, no Android-only APIs in shared code).
- **Platform code lives only in `packages/platform` adapters** (`nfc`, `printer`, `camera`, `storage`, `updater`). The React app never imports Capacitor or Electron directly.
- **Local DB:** PowerSync. `@powersync/web` + `@powersync/react` on web and Electron; PowerSync Capacitor SDK (native SQLite) on Android. Same schema and queries everywhere.
- **Backend:** Supabase (Postgres, Auth, RLS, Storage, Edge Functions, pg_cron). **Sync:** PowerSync Cloud.
- **Business rules** live in `packages/core` (pure TS, runs offline against local SQLite). Postgres triggers/functions re-validate every uploaded change and are the final authority.
- Newer Supabase projects don't expose `public` tables to the Data API by default. Grant access explicitly in migrations.
- **Currency:** IQD default; optional USD with the exchange rate stored per transaction. **Timezone:** Asia/Baghdad; store all timestamps as `timestamptz` (UTC).

## Monorepo layout (pnpm workspaces)

```
apps/app            React + Vite app (+ android/ from Capacitor); feature folders: features/members, features/checkin, ...
apps/desktop        Electron shell for the Windows EXE
packages/platform   nfc, printer, camera, storage, updater adapters per platform
packages/core       business rules, pure TS, fully tested
packages/db         PowerSync schema + generated types
packages/i18n       locales/{ckb,en,ar}/<feature>.json
supabase/           migrations, Edge Functions, seed
```

Inside the app, shared code goes in `components/ui` and `lib`.

## Local development

- Supabase runs locally with Docker (`supabase start`). Use the CLI through `pnpm exec supabase` / `npx supabase`.
- RLS tests are pgTAP files in `supabase/tests`, run locally with `supabase test db`. Every table's policies get tests.

## Offline-first rules (every module)

- **Writes go to local SQLite first**; an upload queue sends them to Supabase. The UI never waits for the network.
- **Client-generated UUIDs** for every primary key. Never depend on server sequences for PKs.
- **Never store decrementing counters** (e.g. remaining visits). Store append-only rows and compute the value.
- Invoice/receipt numbers use an offline-safe device prefix: `B1-D03-000457` (branch-device-local sequence). The server may add a global number after sync.
- **Never lose a queued change:** persist the queue, retry with backoff, alert the manager if a device has unsynced data older than 24 h. The server flags conflicts instead of silently dropping data.
- **Offline auth:** cached Supabase session + staff PIN unlock (PIN hash + permissions cached locally). The server re-checks permissions on upload.
- **Sync status indicator** always visible: Online / Offline / Syncing N / Error, last sync time, pending count, "Sync now" button.
- Online-only features must show a clear offline message: SMS/WhatsApp, payment gateways, cross-branch reports, photo uploads (queue locally, upload later), creating staff accounts.
- Each device syncs only its branch's data (PowerSync Sync Streams). Heavy history syncs on demand or only for managers.
- Tests must simulate going offline, changes on two devices, and reconnecting.

## Sync conflict rules

| Data | Rule |
|---|---|
| Attendance, payments, stock movements, audit logs | Append-only, so no conflicts |
| Member profile edits | Last-write-wins **per field**, using `updated_at` + `updated_by` |
| Locker assignments, spa room/therapist bookings | Server is the authority: first one wins, the second is marked `conflict` and shown on the **Sync conflicts** screen for a manager to resolve |
| Visit limits exceeded by offline double use | Allow it, flag it on the server, show it in a report |

## Language: Kurdish Sorani is the default

- **`ckb` (RTL) is the default** on every platform: first launch, login screen, and after login. `en` (LTR) and `ar` (RTL) are additional languages.
- `i18next` + `react-i18next` with **typed keys** (a missing key is a TypeScript error). Files: `packages/i18n/locales/{ckb,en,ar}/<feature>.json`.
- **Never hardcode user-facing text:** components, errors, toasts, Zod messages, receipts/PDFs, notifications. **Write Kurdish first**; it is the source language.
- Use simple, natural, everyday Sorani, never formal or machine-translated wording. Use the correct Sorani letters (ە ێ ۆ ڕ ڵ ڤ ک گ ی), never Arabic substitutes (ي ك, or ه where ە is meant).
- **Use logical Tailwind classes only** (`ms- me- ps- pe- start- end- text-start`), never `ml- mr- pl- pr- left- right- text-left`. Mirror directional icons. Set `<html dir lang>` dynamically. Charts, tables and date pickers must work in RTL.
- Fonts are bundled locally and never loaded from the internet: **UniSalar_F_007** for Kurdish (`apps/app/src/assets/fonts`, chosen by the user), Vazirmatn for Arabic and as the Kurdish fallback, Inter for English. UniSalar's `unicode-range` covers only Arabic-script characters because the font draws ASCII digits as Eastern Arabic and the comma as "،". Don't widen it; `apps/app/test/fonts.test.ts` guards it.
- Latin digits by default (a setting allows Eastern Arabic). Phone numbers, card UIDs and invoice numbers are always Latin and LTR.
- IQD: `25,000 د.ع` with no decimals. USD: 2 decimals. Gregorian calendar with Sorani month names.
- Translatable config columns: `name_ckb` (required), `name_en`, `name_ar` (optional, fall back to Kurdish).
- Search normalizes look-alike letters (ي/ی, ك/ک, ه/ە). Seed/demo data is in Kurdish.

## Database rules

- `uuid` PKs. Every business table has `id`, `branch_id` (where relevant), `created_at`, `updated_at`, `created_by`, `deleted_at` (soft delete).
- Money is `numeric(14,2)`, never float. Use enums or check constraints for statuses.
- **RLS is enabled on every table; no table is left open.** Permission checks go through `has_permission(perm text)`.
- All schema changes go in numbered migrations in `supabase/migrations`. Generate TS types with `supabase gen types`.
- Never delete financial rows. Refunds and voids need a permission and a reason. Staff accounts are deactivated, never hard-deleted.
- Postgres audit trigger on important tables: who, when, table, row id, old/new values, IP/device.
- NFC UIDs are normalized to uppercase hex with no separators, with a unique index.

## Security & RBAC

- Use permission strings (`members.create`, `payments.refund`, ...), never role-name checks.
- **One role per staff member.** Branch access: `staff_users.all_branches` flag, otherwise the rows in the `staff_branches` join table (a staff member can have several branches). `has_branch_access(branch_id)` is the single SQL implementation of this rule, and the PowerSync sync rules apply the same rule.
- Enforce in **three layers**: RLS, server validation of synced uploads, and UI (cached permissions).
- The Supabase service/secret key never reaches the client.
- Sensitive actions (payments, refunds) require a staff login. Never trust an NFC UID alone.

## Code quality

- Strict TypeScript, **no `any`**.
- Zod validation in the app, re-validated on the server when changes sync. Never trust uploaded data.
- Reusable hooks and components; no duplicated logic.
- Errors: user-friendly translated message + logged details.
- Unit tests for the check-in engine and pricing (pro-rata, freeze, installments), including edge cases: expires today, last visit, frozen, double scan, wrong branch, wrong hours.
- README: setup, env vars, NFC reader setup, build steps per target (Vercel, signed APK/AAB, Windows installer).
- CI (GitHub Actions): build and deploy web on every push; signed APK and Windows EXE as release artifacts.

## Approved architecture decisions (Phase 1 plan)

- **Electron:** a minimal hand-written shell (not the Capacitor Electron platform), packaged with electron-builder. The build is served over a privileged custom `app://` protocol so IndexedDB/OPFS, workers and WASM have a stable origin.
- **Staff login:** username + password, mapped to an internal email behind the scenes.
- **Offline PIN:** a staff member logs in with their password once per device (online); the device then keeps their session, PIN hash and permissions, encrypted. Every queued change is tagged with its author and uploaded under **that author's own session**, so the server checks permissions with `auth.uid()` and never trusts a staff ID in the payload. PIN hashes are never synced to other devices. 6-digit PIN, lockout after 5 wrong tries, auto-lock when idle.
- **Devices:** a `devices` table gives each device a code (the `D03` in receipt numbers), a default language and a last-seen time.
- **Sync scope:** the device's branch decides what syncs; the staff login only authorizes it. Switching staff by PIN never wipes or re-downloads local data.
- **Rejected uploads** go to a local "rejected changes" list shown on the Sync screen: never dropped silently, never retried forever.
- **Language order:** staff preference → device default → `ckb`. Sorani month names come from our own translation files, not the browser's `ckb` locale data (support varies between Chromium and Android WebView).
- **Tooling:** pnpm workspaces only (no Turborepo). Shared packages are plain TypeScript source without a build step, except Electron's main process. TypeScript stays on 6.0.x until typescript-eslint supports TS 7. Run `pnpm check` (typecheck, lint, format, unit tests) and `pnpm test:e2e` before handing over a step.
- **Language rules are enforced by tooling:** the `gym/no-hardcoded-ui-text` and `gym/no-physical-direction-classes` lint rules (`tools/eslint-plugin-gym`), plus tests for translation parity, Sorani/Arabic spelling and font glyph coverage. After `shadcn add`, run `pnpm format` and fix any hardcoded English the lint rule reports.
- **Deploys:** Vercel Git integration for the web app; GitHub Actions for checks and APK/EXE artifacts. Signing waits for Phase 11.
