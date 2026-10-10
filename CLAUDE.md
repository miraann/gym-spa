# Gym & Spa Management System

Multi-branch gym & spa system with NFC check-in, sold in **two editions** (see below). Targets: Web/PWA, Android, Windows (iOS later).

**Repository:** https://github.com/miraann/gym-spa (git remote `origin`, private).

**Full spec: [gym-spa-system-prompt.md](gym-spa-system-prompt.md).** It is the source of truth. This file is only a summary; if the two disagree, the spec wins. Read the relevant spec section before starting any phase or module.

The two-edition design below was decided by the user on 2026-10-09 and replaced the earlier offline-first / PowerSync design (spec §2.5).

## Two editions

One app and one set of migrations, with two backends that expose the same API (Postgres + PostgREST + Supabase-compatible Auth):

| | Online edition | Offline edition |
|---|---|---|
| Targets | Web/PWA, Android, Windows EXE | **Windows EXE only** |
| Backend | Supabase cloud | A **server PC on the gym's local network** (Postgres for Windows + PostgREST + Auth, run as Windows services, behind a small `gym-server` proxy) |
| Internet | **Always required.** No local database, no sync. With no connection the app shows a clear message and saves nothing | **Never used.** Several PCs (reception, kiosk, cashier) talk to the server PC over the LAN |
| Updates | Auto-update | Installer on USB; server and PCs must run the same version |

- The app only knows one backend address (cloud Supabase, or the server PC).
- **Server-side logic goes in Postgres functions and triggers**, so it runs the same in both editions. Don't use Supabase-only features (Edge Functions, pg_cron, Realtime, Storage) unless the offline edition gets its own version too. Screens refresh with TanStack Query (on focus or on a timer), not Realtime.
- There is no PowerSync and no powersync.com.
- Offline edition extras (planned): one installer with two modes ("This PC is the server" / "Connect to the server"), pairing code per PC, encrypted LAN traffic (self-made certificate), daily automatic backups + restore, LAN discovery with manual address fallback. The offline server must set Auth's `GOTRUE_DB_MAX_IDLE_POOL_SIZE` and build Supabase Auth with the Windows patch (`spikes/windows-auth/README.md`).

## Many gyms (multi-tenant, spec §2.6)

Decided by the user on 2026-10-10; the plan was approved the same day. Spec §2.6 has the details and wins over this summary. Built in sub-steps MT-1 to MT-5 (each stops for review).

- **The online edition is multi-tenant:** many gyms share one cloud project. **The offline edition** uses the same schema with exactly one gym row.
- **Isolation:** every business table has `gym_id`, with composite foreign keys so rows of two gyms can never be linked. RLS checks it everywhere, and a staff member belongs to exactly one gym. pgTAP tests prove that no gym can read or write another gym's data. Usernames, the PIN lockout, settings and the audit log are per gym. The `permissions` catalog stays global.
- **Login:** the first login on a device asks for the gym code; the device remembers it (web: `?gym=<code>` fills it in). The Auth email is `<username>@<gym code>.staff.gym-spa.invalid`. The offline edition never asks.
- **Gym codes are permanent** (3–20 of `a-z 0-9 -`). Reserved codes (`admin`, `seller`, `support`, `api`, `www`, `app`, `login`, `clickgroup`, `gym-spa`, `test`, `root`, `system`) are refused; the list lives in the database and in `packages/core`, and a test keeps them identical. The seller panel warns in Kurdish before creating a gym.
- **Roles:** the gym's top role is **Owner** (خاوەن, key `owner`), formerly Super Admin. Built-in roles are copied into each gym.
- **Seller panel** (Click Group) is a separate web-only app, `apps/seller`. `platform_admins` are a separate account type that gym roles can never reach, with TOTP required (`aal2`), one-time recovery codes stored as hashes, and at least two admins. Every seller action goes into `platform_audit_logs`. The seller cannot read member data unless the gym grants time-limited support access, and then only through audited read-only functions.
- **Access state:** active → 30-day grace → read-only (view only, nothing new added, data never deleted). Online gyms follow their subscription in the seller panel; offline gyms follow their license. **Suspend** = read-only; **Lock** (fraud, stolen account; needs a reason) blocks login completely.
- **Offline licenses:** signed with Ed25519 by an Edge Function. The private key is never in the app, the repo or the database; the offline server holds only the public keys, labelled by `kid`. They are yearly or perpetual-with-"updates until", activated per machine, with Kurdish warnings at 30, 7 and 1 days, and protected against clock tampering.

## How to work

- Build in the phases from spec §8, in order. **Stop for the user's review after each phase.**
- **When a phase is split into sub-steps (Phase 1: 1a–1d, then 1d-R (PowerSync removed), the auth spike (Supabase Auth on the offline edition's Windows server PC), MT-1 (gyms and isolation, split into MT-1a database and MT-1b app; see Many gyms below), the design step (Calm Bento theme, adaptive navigation and Appearance settings, see Design below), MT-2 to MT-5 (staff module, seller panel, support access, license format and signing), 1e, 1f (offline-edition server test)), stop for review after each sub-step** and say how to test it and what to commit. The user makes the commits.
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
- **Data access:** supabase-js (PostgREST) + TanStack Query, directly against the backend. No local database.
- **Backend:** Supabase (Postgres, Auth, RLS) online; the same migrations on the offline edition's server PC.
- **Business rules:** the authority is Postgres (functions, triggers, RLS). `packages/core` (pure TS, tested) holds what the screens need: price previews, Zod validation, formatting, username mapping.
- Newer Supabase projects don't expose `public` tables to the Data API by default. Grant access explicitly in migrations.
- **Currency:** IQD default; optional USD with the exchange rate stored per transaction. **Timezone:** Asia/Baghdad; store all timestamps as `timestamptz` (UTC).

## Monorepo layout (pnpm workspaces)

```
apps/app            React + Vite app (+ android/ from Capacitor); feature folders: features/members, features/checkin, ...
apps/desktop        Electron shell for the Windows EXE
packages/platform   nfc, printer, camera, storage, updater adapters per platform
packages/core       business rules, pure TS, fully tested
packages/db         generated Supabase types
packages/i18n       locales/{ckb,en,ar}/<feature>.json
supabase/           migrations, Edge Functions, seed
```

Inside the app, shared code goes in `components/ui` and `lib`.

## Local development

- Supabase runs locally with Docker: `pnpm db:start`, `pnpm db:reset` (migrations + seed), `pnpm db:test`, `pnpm db:lint`. The CLI is a devDependency of `@gym/supabase` (the `supabase/` folder): `pnpm --filter @gym/supabase exec supabase <command> --workdir ..`.
- RLS tests are pgTAP files in `supabase/tests`. Every table's policies and guards get tests. `000-setup-test-helpers.sql` installs shared helpers (`tests.create_fixture()`, `tests.authenticate_as()`, ...), so always run the whole folder. `001-schema-rules.test.sql` fails on any table without RLS, policies or the audit trigger, any anon access, unindexed foreign keys, or functions without a fixed `search_path`.
- `pnpm bootstrap:admin --gym <code>` creates a gym's first Owner, and the gym itself if it doesn't exist (`--remote` for a cloud project, with `supabase/.env.local`). The seed makes the gym `demo`. `pnpm staff-logins:move` moves logins made before MT-1 to the per-gym address, once per project (dry run unless `--apply`).

## Data rules (every module)

- **Client-generated UUIDs** for every primary key are still fine; never depend on server sequences for PKs.
- **Never store decrementing counters** (e.g. remaining visits). Store append-only rows and compute the value.
- Invoice/receipt numbers come from the server, per branch: `B1-000457`.
- **Always-online UI:** a connection indicator is always visible (Connected / No connection). Without a connection, actions are disabled with a clear translated message; nothing is queued.
- Internet-only features (online edition only; hidden in the offline edition): SMS/WhatsApp, payment gateways, cross-branch cloud reports.
- Conflicts are decided by the server at once: locker and spa room/therapist bookings use constraints (the second one gets an error right away); visit limits are checked and recorded in one Postgres function, so no double use. Member profile edits: last write wins.

## Language: Kurdish Sorani is the default

- **`ckb` (RTL) is the default** on every platform: first launch, login screen, and after login. `en` (LTR) and `ar` (RTL) are additional languages.
- `i18next` + `react-i18next` with **typed keys** (a missing key is a TypeScript error). Files: `packages/i18n/locales/{ckb,en,ar}/<feature>.json`.
- **Never hardcode user-facing text:** components, errors, toasts, Zod messages, receipts/PDFs, notifications. **Write Kurdish first**; it is the source language.
- Use simple, natural, everyday Sorani, never formal or machine-translated wording. Use the correct Sorani letters (ە ێ ۆ ڕ ڵ ڤ ک گ ی), never Arabic substitutes (ي ك, or ه where ە is meant).
- **Sorani glossary (approved by the user, keep consistent):** check-in = "تۆمارکردنی هاتن" (short form where space is tight: "هاتن"); "چوونەژوورەوە" means login only; cash register = "قاسە"; lockers = "دۆڵابەکان". Digit styles are shown as samples ("123" / "١٢٣"), never as "English / Arabic".
- **Use logical Tailwind classes only** (`ms- me- ps- pe- start- end- text-start`), never `ml- mr- pl- pr- left- right- text-left`. Mirror directional icons. Set `<html dir lang>` dynamically. Charts, tables and date pickers must work in RTL.
- Fonts are bundled locally and never loaded from the internet: **UniSalar_F_007** for Kurdish (`apps/app/src/assets/fonts`, chosen by the user), Vazirmatn for Arabic and as the Kurdish fallback, Inter for English. UniSalar's `unicode-range` covers only Arabic-script characters because the font draws ASCII digits as Eastern Arabic and the comma as "،". Don't widen it; `apps/app/test/fonts.test.ts` guards it.
- Latin digits by default (a setting allows Eastern Arabic). Phone numbers, card UIDs and invoice numbers are always Latin and LTR.
- IQD: `25,000 د.ع` with no decimals. USD: 2 decimals. Gregorian calendar with Sorani month names.
- Translatable config columns: `name_ckb` (required), `name_en`, `name_ar` (optional, fall back to Kurdish).
- Search normalizes look-alike letters (ي/ی, ك/ک, ه/ە). Seed/demo data is in Kurdish.

## Design: "Calm Bento" (2026 visual direction)

Soft, tonal, rounded, touch-first. The app looks like a modern phone/tablet app, not an old admin panel. Calm surfaces for reception staff who use it all day; the check-in kiosk is the one loud screen. This extends spec §6 and doesn't replace it.

- **Tokens only.** Colors, radii and shadows are CSS variables in `apps/app/src/styles.css` (OKLCH). Components use semantic classes (`bg-primary`, `text-muted-foreground`, `bg-success`), never raw palette classes like `bg-indigo-600` or hex values.
- **Color:** one brand color per gym, set in Appearance settings (spec §6.1). The default is **indigo-violet** (about `oklch(0.51 0.23 277)` light, `oklch(0.68 0.17 277)` dark); presets blue, purple, gray, or a custom color. It is used for primary buttons, the active nav item, focus rings and selected chips. **Green / amber / red are reserved for status** (allowed, warning, denied, paid/overdue) through `--success`, `--warning` and `--destructive`. They are fixed: they never follow the brand color, and they are never decoration or brand. Status is never shown by color alone: always add an icon and text too.
- **Surfaces:** layer by tone, not by heavy borders or shadows. The page background is a slightly tinted off-white (dark: tinted near-black); cards are one step lighter. Dark mode gets the same care as light mode.
- **Shape:** corner style per gym: soft (default, `--radius` about `1rem`), medium or sharp. Cards `rounded-2xl`/`rounded-3xl`, buttons and inputs `rounded-xl`. These all derive from `--radius`, so the corner style switches everywhere. Chips, badges and the tab bar stay pills.
- **Type:** UniSalar has one weight, so in Kurdish the browser fakes bold. Build hierarchy with size, color and space, not font weight. KPIs and money totals use big numerals; money and count columns use `tabular-nums`. All sizes are in `rem`, so the personal "large text" setting scales text, spacing and touch targets together.
- **Appearance (ڕووکار) settings, spec §6.1:** the app never has just one look. The **gym** look (needs `settings.edit`, gym-wide rows in `settings`) sets the brand color (with a WCAG AA contrast warning for custom colors), corner style and logo (resized on upload, at most 300 KB, kept in Postgres, not Storage, so both editions work). The **personal** look (staff profile, cached on the device) sets light / dark / follow device and text size normal / large. All of it is CSS variables set at runtime, so changes apply without a reload. The color math and contrast check live in `packages/core`, with tests.
- **Layout by width** (the sidebar's mobile breakpoint is 768px):
  - **Phone (< 768px):** a floating pill **bottom tab bar** (safe-area aware) with the staff member's 4 most-used destinations plus "More", which opens a bottom sheet with the full grouped menu. If they can check members in, the middle tab is a raised scan button. Dialogs become bottom sheets, tables become card lists, and primary actions sit in the thumb zone (sticky bottom bar).
  - **Tablet (768–1279px):** the sidebar collapsed to an icon **rail** on the reading-start side. In landscape, list and detail sit side by side (e.g. members list + profile).
  - **Desktop (≥ 1280px):** the full sidebar grouped by module, dense tables, keyboard shortcuts (Ctrl+K).
  - Tab and rail order follows reading direction through flex/logical classes, never manual reversing.
- **Bento dashboards:** KPI tiles of different sizes in a CSS grid (today's check-ins, live occupancy, today's revenue, expiring this week). Tiles use container queries (`@container`) so they adapt to the space they get, not the window width.
- **Touch:** targets at least 44×44px (48px on phone primary actions and the kiosk). Use `pointer-coarse:` to give touch screens taller inputs and rows; mouse and keyboard keep the denser layout.
- **Glass:** only on floating bars (top bar, bottom tab bar, sticky action bar), always with a solid fallback (`supports-backdrop-filter:`). Never behind body text or on cards: blur is slow on cheap Android tablets and older reception PCs, and it hurts Kurdish legibility.
- **Motion:** short (150–250ms), spring-like for sheets and the kiosk result; wrap it in `motion-safe:` so reduced-motion users get none. Motion never delays work.
- **Check-in kiosk (spec §6):** dark idle screen; the result fills the whole screen with the status color, a large member photo, the name in very large text, one line of reason, and a countdown ring for the 5-second auto-reset. Readable from 2 meters, in portrait and landscape.
- **States:** skeletons shaped like the real content; empty states with an icon, one line of text and an action; contrast at least WCAG AA; visible focus rings.
- **Layout guards** (seen in the design preview):
  - Rail labels never overflow: a long one like "ڕێکخستنەکان" wraps to at most two lines or uses a short label, with the full name as tooltip and accessible name.
  - Filter chip rows are never clipped: they scroll sideways with padding at both ends on phones and wrap on wider screens.
  - Phone scroll areas end with bottom padding equal to the tab bar, the safe area and any floating button, so the last item is never hidden behind the bottom bar.

## Database rules

- `uuid` PKs. Every business table has `id`, `gym_id` (from the multi-tenant step on), `branch_id` (where relevant), `created_at`, `updated_at`, `created_by`, `deleted_at` (soft delete).
- Money is `numeric(14,2)`, never float. Use enums or check constraints for statuses.
- **RLS is enabled on every table; no table is left open.** Permission checks go through `has_permission(perm text)`.
- SQL helpers live in the private `app` schema (not exposed to the API). In policies write `(select app.has_permission('x'))` and `branch_id in (select app.accessible_branch_ids())` so they run once per query, not per row.
- New tables follow README → Database → Adding a table (`stamp`, `read_only` and `audit` triggers, explicit grants, tests). Guards reject with a stable key as the error message (e.g. `cannot_grant_role`) and an English detail; the app translates the key.
- All schema changes go in numbered migrations in `supabase/migrations`. Generate TS types with `supabase gen types`.
- **Multi-row business operations are atomic on the server:** all rows succeed or all are rejected together, never a partial application. Examples: payment + invoice + invoice_items + subscription (Phase 3), locker assignment, spa booking. Each one is **one Postgres function** called by RPC.
- Never delete financial rows. Refunds and voids need a permission and a reason. Staff accounts are deactivated, never hard-deleted.
- Postgres audit trigger on important tables: who, when, table, row id, old/new values, IP/device.
- NFC UIDs are normalized to uppercase hex with no separators, with a unique index.

## Security & RBAC

- Use permission strings (`members.create`, `payments.refund`, ...), never role-name checks.
- **One role per staff member.** Branch access: `staff_users.all_branches` flag, otherwise the rows in the `staff_branches` join table (a staff member can have several branches). The rule is written once in SQL, `app.refresh_branch_access()`, which keeps it as rows in `staff_branch_access`; RLS (`app.accessible_branch_ids()`, `app.has_branch_access()`) reads those rows.
- Enforce in **three layers**: RLS, server validation (guards, Postgres functions), and UI (permissions).
- The Supabase service/secret key never reaches the client.
- Sensitive actions (payments, refunds) require a staff login. Never trust an NFC UID alone.

## Code quality

- Strict TypeScript, **no `any`**.
- Zod validation in the app, re-validated on the server. Never trust client data.
- Reusable hooks and components; no duplicated logic.
- Errors: user-friendly translated message + logged details.
- Tests (pgTAP for the Postgres functions, unit tests for TS helpers) for the check-in engine and pricing (pro-rata, freeze, installments), including edge cases: expires today, last visit, frozen, double scan, wrong branch, wrong hours.
- README: setup, env vars, NFC reader setup, build steps per target (Vercel, signed APK/AAB, Windows installer).
- CI (GitHub Actions): build and deploy web on every push; signed APK and Windows EXE as release artifacts.

## Approved architecture decisions (Phase 1 plan)

- **Electron:** a minimal hand-written shell (not the Capacitor Electron platform), packaged with electron-builder. The build is served over a privileged custom `app://` protocol so storage has a stable origin.
- **Staff login:** gym code (first login on a device only) + username + password, mapped to an internal email behind the scenes (`<username>@<gym code>.staff.gym-spa.invalid`, `packages/core/src/staff.ts`; the database checks it matches).
- **PIN switching:** a staff member logs in with their password once per device; the device keeps their session so others can switch to them with a 6-digit PIN. **The server checks the PIN and the lockout** (5 wrong tries); PIN hashes never leave the server. Auto-lock when idle. Every request runs under the acting staff member's own session, so the server checks permissions with `auth.uid()`.
- **Devices:** a `devices` table gives each device a code, its branch, a default language and a last-seen time.
- **Staff accounts (design B, decided 2026-10-10):** create, password reset, deactivation and username changes go through Supabase Auth's official admin API. The code is one shared TypeScript module, run as an Edge Function online and as a `gym-server` route offline. The secret key lives only there. It checks the caller in Postgres under their own session, calls Auth, then writes the staff rows under the caller's session, so the guards run. If that fails, it deletes the new Auth user again.
- **Language order:** staff preference → device default → `ckb`. Sorani month names come from our own translation files, not the browser's `ckb` locale data (support varies between Chromium and Android WebView).
- **Tooling:** pnpm workspaces only (no Turborepo). Shared packages are plain TypeScript source without a build step, except Electron's main process. TypeScript stays on 6.0.x until typescript-eslint supports TS 7. Run `pnpm check` (typecheck, lint, format, unit tests) and `pnpm test:e2e` before handing over a step.
- **Language rules are enforced by tooling:** the `gym/no-hardcoded-ui-text` and `gym/no-physical-direction-classes` lint rules (`tools/eslint-plugin-gym`), plus tests for translation parity, Sorani/Arabic spelling and font glyph coverage. After `shadcn add`, run `pnpm format` and fix any hardcoded English the lint rule reports.
- **Deploys:** Vercel Git integration for the web app; GitHub Actions for checks and APK/EXE artifacts. Signing waits for Phase 11.
- **App ID:** `site.clickgroup.gymspa` on Android and Windows. Windows publisher: "Click Group". Permanent once published.
- **Platform adapters** (`nfc`, `printer`, `camera`, `storage`, `updater`) are added when first used, not as empty stubs.
