# Gym & Spa Management System

Multi-branch gym & spa system with NFC check-in, sold in **two editions** (see below). Targets: Web/PWA, Android, Windows (iOS later).

**Repository:** https://github.com/miraann/gym-spa (git remote `origin`, private).

**Full spec: [gym-spa-system-prompt.md](gym-spa-system-prompt.md).** It is the source of truth. This file is only a summary; if the two disagree, the spec wins. Read the relevant spec section before starting any phase or module.

## Working rules (decided by the user on 2026-10-24, replacing "never push to main"; sped up on 2026-10-27)

**Work fully automatically.** Don't stop for the user's review between sub-steps. Claude may merge to `main` and push cloud migrations itself, but **only through the release flow below**. `gh` is logged in (a fine-grained token for this repository only); never ask the user for login codes.

**Sub-steps:** each sub-step is one or more commits on its own branch, stacked on the one before (`3d` on `3c`, ...), pushed with an explicit refspec. Test only what the change touches: the unit tests, the related pgTAP files and the related e2e specs. GitHub Actions runs `pnpm check`, `pnpm db:test` and `pnpm db:lint` on every push (`.github/workflows/checks.yml`); e2e stays local.

**Release flow (once per phase**, after its last sub-step: all its sub-steps together):
1. The phase's last branch is committed and pushed (`git push origin 3g`; check `git branch --show-current` right before every commit and push).
2. **The full suite must pass, once:** `pnpm check`, `pnpm db:test`, `pnpm db:lint` and the full `pnpm test:e2e` (with `pnpm db:functions` running). If something fails and Claude can't fix it, stop and tell the user.
3. **Cloud migrations before merging:** run a dry run. Push automatically only if every pending migration is purely additive: no `DROP`, no column or type change that loses data, no `RENAME`, no data deletes. Rehearse first on a local copy of the cloud's schema (reset the local database to the cloud's last migration, add sample data, apply the pending ones). Anything destructive: stop and ask the user. README → Releasing has the commands.
4. **Open one pull request to `main` from the phase's last branch with `gh pr create` and merge it with `gh pr merge`.** Never `git push` to `main` directly. Then confirm, read-only, that Vercel serves the new build and the live site works.
5. **Write a short report for the user after each release:** what shipped, migrations pushed, checks.

**Still always ask the user first:** `supabase config push`, any destructive migration, rotating secrets or keys, locking or suspending a real gym, deleting real data, spending money, or giving any build to a real gym.

Decisions that belong to the user (prices, business rules): follow the spec; where the spec is silent, choose the safest sensible default, write it in the report and in the spec, and keep going.

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
- Offline edition extras (planned): one installer with two modes ("This PC is the server" / "Connect to the server"), pairing code per PC, encrypted LAN traffic (self-made certificate), daily automatic backups + restore, LAN discovery with manual address fallback. The offline server must set Auth's `GOTRUE_DB_MAX_IDLE_POOL_SIZE`, build Supabase Auth with the Windows patch (`spikes/windows-auth/README.md`), and sign sessions with an asymmetric key (`GOTRUE_JWT_KEYS`, ES256) so it publishes a key set: the staff module checks tokens against it.

## Many gyms (multi-tenant, spec §2.6)

Decided by the user on 2026-10-10; the plan was approved the same day. Spec §2.6 has the details and wins over this summary. Built in sub-steps MT-1 to MT-5 (each stops for review). **Order (changed by the user on 2026-10-11):** MT-1, design step, MT-2, MT-3 (all done), then 1e → Phase 2 (members + NFC) → Phase 3 (plans, subscriptions, payments) → Phase 4 (check-in) → **MT-4** (support access). **MT-5** (offline licenses) comes just before the offline packaging phase (after Phase 10, before Phase 11), and 1f (offline-edition server test) opens that phase. Spec §8 has the full list.

- **The online edition is multi-tenant:** many gyms share one cloud project. **The offline edition** uses the same schema with exactly one gym row.
- **Isolation:** every business table has `gym_id`, with composite foreign keys so rows of two gyms can never be linked. RLS checks it everywhere, and a staff member belongs to exactly one gym. pgTAP tests prove that no gym can read or write another gym's data. Usernames, the PIN lockout, settings and the audit log are per gym. The `permissions` catalog stays global.
- **Login:** the first login on a device asks for the gym code; the device remembers it (web: `?gym=<code>` fills it in). The Auth email is `<username>@<gym code>.staff.gym-spa.invalid`. The offline edition never asks.
- **Gym codes are permanent** (3–20 of `a-z 0-9 -`). Reserved codes (`admin`, `seller`, `support`, `api`, `www`, `app`, `login`, `clickgroup`, `gym-spa`, `test`, `root`, `system`) are refused; the list lives in the database and in `packages/core`, and a test keeps them identical. The seller panel warns in Kurdish before creating a gym.
- **Roles:** the gym's top role is **Owner** (خاوەن, key `owner`), formerly Super Admin. Built-in roles are copied into each gym.
- **Seller panel** (Click Group) is a separate web-only app, `apps/seller`, served for now by the gym app's Vercel project at `/seller/` (same domain, no DNS; decided 2026-10-11): its own Vite build with base `/seller/`, its own headers and CSP, never cached by the gym app's service worker, session in `sessionStorage` under its own key. `platform_admins` are a separate account type that gym roles can never reach, with TOTP required (`aal2`), one-time recovery codes stored as hashes, and at least two admins. Every seller action goes into `platform_audit_logs`. The seller cannot read member data unless the gym grants time-limited support access, and then only through audited read-only functions.
- **Seller panel internals (MT-3, spec §2.6):** platform tables live in the private schema `platform` (`admins`, `recovery_codes`, `audit_logs`), reached only through `public.seller_*` functions that each start with `app.require_platform_admin()` (aal2; only `seller_me` and `seller_use_recovery_code` accept aal1). A trigger on each side keeps a login from being both staff and platform admin. **Lock also blocks Auth** through the Customize Access Token hook `auth_hooks.custom_access_token`: it refuses ONLY staff of a locked gym, returns everything else unchanged and never raises (it runs for every login; README → Seller panel has the emergency off switch). Locally it is on in `config.toml`; the cloud turns it on in the dashboard, never with `supabase config push`.
- **Access state:** active → 30-day grace → read-only (view only, nothing new added, data never deleted). Online gyms follow their subscription in the seller panel; offline gyms follow their license. **Suspend** = read-only; **Lock** (fraud, stolen account; needs a reason) blocks login completely.
- **Offline licenses:** signed with Ed25519 by an Edge Function. The private key is never in the app, the repo or the database; the offline server holds only the public keys, labelled by `kid`. They are yearly or perpetual-with-"updates until", activated per machine, with Kurdish warnings at 30, 7 and 1 days, and protected against clock tampering.

## How to work

- Build in the phases from spec §8, in order, and release each phase with the release flow (Working rules above).
- **Phase 2 (members + NFC, plan approved 2026-10-19; decisions in spec §1 and §4.1):** sub-steps 2a members database (done), 2b members screens (done), 2c photos (done), 2d NFC cards database (done), 2e keyboard-type readers + card screens (done), 2f ACR122U (PC/SC) reader in the Windows EXE (done), 2g Android NFC + Web NFC (postponed 2026-10-22: needs a real NFC Android device to test; must be done before the first gym uses phones for cards), 2h global search + seller member counts + docs and build check (web + Windows installer) (done), 2j Excel/CSV import, with taking an import back (done). All on branch `2a`, one commit per sub-step, each stopping for review; the cloud gets the migrations only after the user's OK.
- **Phase 3 (plans, subscriptions, payments; planned 2026-10-24 under the working rules, decisions in spec §4.2):** 3a was the web app's new-version notice (done); then 3b plans (done), 3c selling a subscription: database (done), 3d the selling screens (done), 3e payments and debts (done), 3f subscription changes (done), 3g receipts and the expired and frozen member statuses (done). One branch per sub-step, stacked; the phase is released together.
- **Phase 4 (check-in, planned 2026-10-27 under the working rules, decisions in spec §8):** 4a the engine: `attendance`, `check_in()`, `check_out()`, `void_visit()`, occupancy, the check-in settings, visits counted (done); 4b the check-in screen and kiosk; 4c the attendance list and live occupancy. Stacked on 3g; released together with Phase 3 once the GitHub token can write.
- **When a phase is split into sub-steps (Phase 1: 1a–1d, then 1d-R (PowerSync removed), the auth spike (Supabase Auth on the offline edition's Windows server PC), MT-1 (gyms and isolation, split into MT-1a database and MT-1b app; see Many gyms below), the design step (Calm Bento theme, adaptive navigation and Appearance settings, see Design below; split into D-1 look and navigation, and D-2 Appearance settings), MT-2 and MT-3 (staff module, seller panel; MT-3 is split into MT-3a database, MT-3b seller-admin module and scripts, MT-3c gym-app warnings, MT-3d packages/ui, MT-3e apps/seller), 1e; later MT-4 (support access, after Phase 4), MT-5 (license format and signing, just before the offline packaging phase) and 1f (offline-edition server test, which opens that phase)), each sub-step is built and tested on its own branch, and the phase is released together** with the release flow; the release report says how to test each sub-step.
- **Commits:** on feature branches only, pushed with an explicit refspec (`git push origin 3a`). `main` changes only through a pull request merged with `gh pr merge` in the release flow; never `git push` to `main`.
- Before writing code for a phase, write the plan (tables, files, assumptions) into the spec's phase section; the release report repeats the decisions taken.
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
- **Platform code lives only in `packages/platform` adapters** (`nfc`, `printer`, `camera`, `storage`, `updater`, `save-file`). The React app never imports Capacitor or Electron directly.
- **Data access:** supabase-js (PostgREST) + TanStack Query, directly against the backend. No local database.
- **Backend:** Supabase (Postgres, Auth, RLS) online; the same migrations on the offline edition's server PC.
- **Business rules:** the authority is Postgres (functions, triggers, RLS). `packages/core` (pure TS, tested) holds what the screens need: price previews, Zod validation, formatting, username mapping.
- Newer Supabase projects don't expose `public` tables to the Data API by default. Grant access explicitly in migrations.
- **Currency:** IQD default; optional USD with the exchange rate stored per transaction. **Timezone:** Asia/Baghdad; store all timestamps as `timestamptz` (UTC).

## Monorepo layout (pnpm workspaces)

```
apps/app            React + Vite app (+ android/ from Capacitor); feature folders: features/members, features/checkin, ...
apps/desktop        Electron shell for the Windows EXE
apps/seller         Click Group's seller panel (web only), deployed at /seller/ of the gym app's Vercel project
packages/platform   nfc, printer, camera, storage, updater adapters per platform
packages/core       business rules, pure TS, fully tested
packages/db         generated Supabase types
packages/i18n       locales/{ckb,en,ar}/<feature>.json
packages/ui         shared UI of the gym app and the seller panel: theme.css (tokens, fonts), shadcn/ui components, blocks
packages/vite-plugins  build-time Vite plugins both apps use (the Content-Security-Policy)
supabase/           migrations, Edge Functions, seed
```

Shared UI goes in `packages/ui` (`components/` for the vendored shadcn/ui components, `blocks/` for our own layout pieces like the responsive dialog and the sticky action bar, `hooks/` for `use-layout`/`use-mobile`); the apps import it as `@gym/ui/...`. App-only code goes in the app's `components/` and `lib`.

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
- **Member photos are kept in Postgres**, like the logo, never in Storage (decided 2026-10-19): at most 480 px and 150 KB, thumbnail at most 12 KB, checked by the app and again by the database.
- **NFC hardware (decision 6, 2026-10-19, spec §1):** the desk reader is ACR122U-type (PC/SC, not keyboard-type), read by the Windows EXE's main process with Get UID (`FF CA 00 00 00`) and sent to the page over IPC as UID events only, behind `NfcReader` (step 2f, done: `smartcard` 3.7.2 as an optional dependency plus our own watcher in `apps/desktop/src/pcsc-watcher.ts`; plug/unplug, sleep/wake, two readers; green / red-twice LED and beep on the ACR122U). **A card already lying on the reader** after app start, wake, replug or service recovery is not a new scan; opening a card dialog or the reader test reads it once; Phase 4 check-in counts only a newly placed card (decided 2026-10-22). Keyboard-type readers stay supported. The web app can't use PC/SC and says so (Windows app, keyboard-type reader or NFC phone). Cards: the UID (uppercase hex, 7-byte NTAG or 4-byte) is the identity; never rely on the NXP originality signature (the test cards are clones). The README recommends genuine NXP NTAG213/215. Phase 4's check-in shows the photo on every scan. Later iOS: Core NFC.
- Conflicts are decided by the server at once: locker and spa room/therapist bookings use constraints (the second one gets an error right away); visit limits are checked and recorded in one Postgres function, so no double use. Member profile edits: last write wins.

## Language: Kurdish Sorani is the default

- **`ckb` (RTL) is the default** on every platform: first launch, login screen, and after login. `en` (LTR) and `ar` (RTL) are additional languages.
- `i18next` + `react-i18next` with **typed keys** (a missing key is a TypeScript error). Files: `packages/i18n/locales/{ckb,en,ar}/<feature>.json`.
- **Never hardcode user-facing text:** components, errors, toasts, Zod messages, receipts/PDFs, notifications. **Write Kurdish first**; it is the source language.
- Use simple, natural, everyday Sorani, never formal or machine-translated wording. Use the correct Sorani letters (ە ێ ۆ ڕ ڵ ڤ ک گ ی), never Arabic substitutes (ي ك, or ه where ە is meant).
- **Sorani glossary (approved by the user, keep consistent):** check-in = "تۆمارکردنی هاتن" (short form where space is tight: "هاتن"); "چوونەژوورەوە" means login only; cash register = "قاسە"; lockers = "دۆڵابەکان"; gym = "جیم" (e.g. "کۆدی جیم", "جیمێکی تر", "ئەم جیمە"), never "یانە", because the app is "جیم و سپا" and staff say "جیم"; classes = "کلاسەکان" (short label "کلاس"), not "وانە". Digit styles are shown as samples ("123" / "١٢٣"), never as "English / Arabic". Design terms (approved 2026-10-10): Appearance = "ڕووکار" (gym look "ڕووکاری جیم", my look "ڕووکاری خۆم"), brand color = "ڕەنگی سەرەکی", custom color = "ڕەنگی دڵخواز", corner style = "شێوەی گۆشەکان" (نەرم / مامناوەند / تیژ), logo = "لۆگۆ", theme = "ڕووناک / تاریک / وەک ئامێرەکە", text size = "قەبارەی نووسین" (ئاسایی / گەورە), More = "زیاتر", Display = "پیشاندان". Seller panel terms (approved 2026-10-10): seller panel = "پانێڵی کلیک گرووپ", platform admin = "بەڕێوەبەری پانێڵ", two-step login = "چوونەژوورەوەی دوو هەنگاوی", recovery codes = "کۆدەکانی گەڕاندنەوە", Suspend = "ڕاگرتن", Lock = "قفڵکردن", Reactivate = "چالاککردنەوە", Paid until = "ئابوونە تا" (the gym's subscription with Click Group = "ئابوونە", not "بەشداری"), grace period = "ماوەی مۆڵەت", usage = "بەکارهێنان", seller log = "تۆماری کارەکانی پانێڵ". Admin screen terms (approved 2026-10-19): permission table = "خشتەی دەسەڵاتەکان", register a device = "تۆمارکردنی ئامێر", deactivate = "ناچالاککردن", built-in (role) = "بنەڕەتی", PIN = "پین" (Kurdish letters), this device = "ئەم ئامێرە", device language = "زمانی ئامێر", move to another branch = "گواستنەوە بۆ لقێکی تر", registered on = "تۆمارکراوە لە", last seen = "دواجار بینرا", web browser / Android / Windows = "وێبگەڕ" / "ئەندرۆید" / "ویندۆز", freeze a subscription = "وەستاندنی کاتیی ئابوونە" (not ڕاگرتن, which is the seller panel's Suspend), backup = "کۆپی یەدەگ", export = "دەرهێنان", booking = "نۆرە" (spa) / "جێگە" (class), stock = "کۆگا". Member terms (approved 2026-10-21): member = "ئەندام", new member = "ئەندامی نوێ", member number = "ژمارەی ئەندام", member registration date = "ڕێکەوتی تۆمارکردن" (devices keep "تۆمارکراوە لە"), joined at branch = "لقی ناونووسین", gender = "ڕەگەز" ("نێر" / "مێ"), tag = "نیشانە", emergency contact = "کەسی نزیک", health info = "زانیاریی تەندروستی", injuries = "برینداری و ئازار", other (choice) = "هیتر", Edit (button) = "دەستکاری", since a date = "لە {{date}}ـەوە", member statuses = "چالاک" / "ڕاگیراو" / "قەدەغەکراو" / "ئەرشیفکراو" (actions "ڕاگرتن" / "قەدەغەکردن" / "ئەرشیفکردن" / "چالاککردنەوە"), the default list filter = "هەموو، بێ ئەرشیف" (everyone except archived). Card terms (approved 2026-10-19 with the Phase 2 plan): card = "کارت", give a card = "پێدانی کارت", replace a card = "گۆڕینی کارت", card reader = "خوێنەری کارت", lost = "ونبوو", damaged = "تێکچوو", stolen = "دزراو", returned = "گەڕێنراوە", block / blocked = "بلۆککردن" / "بلۆککراو", unblock = "لابردنی بلۆک". Card screen terms (approved 2026-10-21, step 2e): take a card back = "وەرگرتنەوەی کارت", was blocked (a card unblocked later) = "بلۆککرا", no new card now = "بێ کارتی نوێ", card number order = "ڕیزبەندیی ژمارەی کارت" ("ئاسایی" / "پێچەوانە"), test the reader = "تاقیکردنەوەی خوێنەر", keyboard = "کیبۆرد", automatically = "خۆکارانە", is given to nobody = "بە کەس نادرێت". Card reader terms (approved 2026-10-22, step 2f): connected (a reader) = "بەستراوە", driver = "درایڤەر".
- **Use logical Tailwind classes only** (`ms- me- ps- pe- start- end- text-start`), never `ml- mr- pl- pr- left- right- text-left`. Mirror directional icons. Set `<html dir lang>` dynamically. Charts, tables and date pickers must work in RTL.
- Fonts are bundled locally and never loaded from the internet: **UniSalar_F_113** for Kurdish (`packages/ui/src/assets/fonts/unisalar-f-113.otf`, chosen by the user on 2026-10-21 in step D-3, replacing UniSalar_F_007), Vazirmatn for Arabic and as the Kurdish fallback, Inter for English. UniSalar has no Latin letters or ASCII digits, and its `unicode-range` covers only Arabic-script characters, so digits and Latin text in Kurdish screens come from Vazirmatn. Don't widen it; `packages/ui/test/fonts.test.ts` guards it.
- Latin digits by default (a setting allows Eastern Arabic). Phone numbers, card UIDs and invoice numbers are always Latin and LTR.
- IQD: `25,000 د.ع` with no decimals. USD: 2 decimals. Gregorian calendar with Sorani month names.
- Translatable config columns: `name_ckb` (required), `name_en`, `name_ar` (optional, fall back to Kurdish).
- Search normalizes look-alike letters (ي/ی, ك/ک, ه/ە), and the Kurdish letters an Arabic keyboard can't type (پ چ ژ گ ڤ ڕ ڵ ێ ۆ) match what is typed instead (ب ج ز ک ف ر ل ی و). `normalizeSearchText()` in `packages/core` and `app.normalize_search_text()` in Postgres are kept identical by a test. Seed/demo data is in Kurdish.

## Design: "Calm Bento" (2026 visual direction)

Soft, tonal, rounded, touch-first. The app looks like a modern phone/tablet app, not an old admin panel. Calm surfaces for reception staff who use it all day; the check-in kiosk is the one loud screen. This extends spec §6 and doesn't replace it.

- **Tokens only.** Colors, radii and shadows are CSS variables in `packages/ui/src/styles/theme.css` (OKLCH). Components use semantic classes (`bg-primary`, `text-muted-foreground`, `bg-success`), never raw palette classes like `bg-indigo-600` or hex values.
- **Color:** one brand color per gym, set in Appearance settings (spec §6.1). The default is **indigo-violet** (about `oklch(0.51 0.23 277)` light, `oklch(0.7 0.16 284)` dark: dark mode may turn the hue a little, `--brand-dark-h`, so light indigo doesn't look blue); presets blue, purple, gray, midnight, gold, teal, or a custom color. Ready-made looks (`LOOK_PRESETS` in `packages/core`: classic, midnight, gold, sport) set the brand color and corner style together. Large brand-filled surfaces (login brand panel, dashboard main tile) use the light-mode shade in dark mode too (`STRONG_BRAND_TOKENS`). It is used for primary buttons, the active nav item, focus rings and selected chips. **Green / amber / red are reserved for status** (allowed, warning, denied, paid/overdue) through `--success`, `--warning` and `--destructive`. They are fixed: they never follow the brand color, and they are never decoration or brand. Status is never shown by color alone: always add an icon and text too.
- **Surfaces:** layer by tone, not by heavy borders or shadows. The page background is a slightly tinted off-white (dark: tinted near-black); cards are one step lighter. Dark mode gets the same care as light mode.
- **Shape:** corner style per gym: soft (default, `--radius` about `1rem`), medium or sharp. Cards `rounded-2xl`/`rounded-3xl`, buttons and inputs `rounded-xl`. These all derive from `--radius` (with soft corners the scale in `theme.css` gives Tailwind's usual sizes: `xl` 12px, `2xl` 16px, `3xl` 24px), so the corner style switches everywhere. Chips, badges and the tab bar stay pills.
- **Type:** UniSalar has one weight and no bold file, so Kurdish text is never made bold (`font-synthesis-weight: none` on `:lang(ckb)`; the browser's fake bold smears the letters). Build hierarchy with size, color and space: in Kurdish every heading size is a step larger (`theme.css`), titles use the darkest text color, secondary text the muted one. Latin text and digits keep Vazirmatn's real weights. The owner supplied the font and is responsible for its licence (README). Base text 16px, large page titles (`text-title` with `PageHeader`; on phones the top bar shows the title once it scrolls away), and more line height for Arabic script (`theme.css`). KPIs and money totals use big numerals; money and count columns use `tabular-nums`. All sizes are in `rem`, so the personal "large text" setting scales text, spacing and touch targets together.
- **Appearance (ڕووکار) settings, spec §6.1:** the app never has just one look. The **gym** look (needs `settings.edit`, gym-wide rows in `settings`) sets the brand color (with a WCAG AA contrast warning for custom colors), corner style and logo (resized on upload, at most 300 KB, kept in Postgres, not Storage, so both editions work). The **personal** look (staff profile, cached on the device) sets light / dark / follow device and text size normal / large. All of it is CSS variables set at runtime, so changes apply without a reload. The color math and contrast check live in `packages/core`, with tests.
- **Layout by width** (the sidebar's mobile breakpoint is 768px):
  - **Phone (< 768px):** a floating pill **bottom tab bar** (safe-area aware) with 4 tabs plus "More", which opens a bottom sheet with the full grouped menu. **Tabs never move by themselves** (decided by the user on 2026-10-10: staff learn tab positions, and moving tabs causes mistakes at a busy reception). Each role has 4 fixed default tabs, kept in one place (`ROLE_NAV_TABS` in `packages/core/src/nav-tabs.ts`; e.g. receptionist: home, members, check-in, cash register; manager: home, members, reports, staff). Each staff member can choose their own 4 from the "More" sheet; the choice is saved on their profile (`staff_users.nav_tabs`, only they can change it) and follows them to other devices. When check-in is one of the tabs, it is the raised scan button in the middle. Dialogs become bottom sheets, tables become grouped lists (`packages/ui` `blocks/list-group.tsx`, rows with a chevron), and primary actions sit in the thumb zone (sticky bottom bar). Pulling down at the top of a page refetches its data (`PullToRefresh`; the browser's own pull-to-refresh is off because a reload locks the app). Saves, tab taps and PIN digits give haptic feedback in the Android app (`haptic()` in `packages/platform`).
  - **Pages not built yet are hidden** everywhere (menu, rail, tabs, More, search; decided by the user on 2026-10-21): an item appears by itself once its route exists (`to` in `apps/app/src/app/navigation.ts`). A role default tab that isn't built yet leaves its slot to the next page the staff member may open, so a role's tabs change once when that phase ships. "Change my tabs" is offered only when there are more pages than tabs.
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
- **Expand first, drop later** (decided by the user on 2026-10-19, for every migration): the cloud gets a migration before every client is updated (the deployed web app, installed APKs and EXEs), so a migration only adds new functions, columns and tables and keeps everything older clients use working unchanged. Removing or changing anything an older client uses goes in a separate, later migration kept in `supabase/pending-migrations/` (never pushed; its README lists what each file waits for) until every client is updated, then moved into `supabase/migrations/` with a new timestamp.
- **Multi-row business operations are atomic on the server:** all rows succeed or all are rejected together, never a partial application. Examples: payment + invoice + invoice_items + subscription (Phase 3), locker assignment, spa booking. Each one is **one Postgres function** called by RPC.
- Never delete financial rows. Refunds and voids need a permission and a reason. Staff accounts are deactivated, never hard-deleted.
- Postgres audit trigger on important tables: who, when, table, row id, old/new values, IP/device.
- NFC UIDs are normalized to uppercase hex with no separators (4, 7 or 10 bytes; readers may give hex with separators, 10 digits, or reversed bytes), with a unique index per gym while a card is active or blocked. `normalizeCardUid()` in `packages/core` and `app.normalize_card_uid()` in Postgres run one shared list of cases (`supabase/tests/270-nfc-cards.test.sql`). Card rows are the history (active / ended / blocked) and change only through the card functions.

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
- **Devices:** a `devices` table gives each device a code, its branch, a default language and a last-seen time. **Devices must be registered** (decided 2026-10-11): someone with `devices.manage` registers a device at their first login on it; the PIN works only on a registered, active device (`unlock_on_device`); every device counts toward `max_devices`, a manager's own phone too (spec §2.5).
- **Staff accounts (design B, decided 2026-10-10):** create, password reset, deactivation and username changes go through Supabase Auth's official admin API. The code is one shared TypeScript module, run as an Edge Function online and as a `gym-server` route offline. The secret key lives only there. It checks the caller in Postgres under their own session, calls Auth, then writes the staff rows under the caller's session, so the guards run. If that fails, it deletes the new Auth user again. Built in MT-2: `packages/staff-admin` + the Edge Function `supabase/functions/staff-admin` (README → Staff accounts). The server makes temporary passwords (shown once, never logged); only `public.staff_admin_orphan()` decides which left-behind login may be deleted.
- **Language order:** staff preference → device default → `ckb`. Sorani month names come from our own translation files, not the browser's `ckb` locale data (support varies between Chromium and Android WebView).
- **Tooling:** pnpm workspaces only (no Turborepo). Shared packages are plain TypeScript source without a build step, except Electron's main process. TypeScript stays on 6.0.x until typescript-eslint supports TS 7. Run `pnpm check` (typecheck, lint, format, unit tests) and `pnpm test:e2e` before handing over a step (for staff- or seller-module changes also `pnpm test:int` and `pnpm test:deno`; `pnpm test:e2e` includes the seller panel and needs `pnpm db:functions`). **Code the Edge Functions import (`packages/core`, `packages/db`, `packages/staff-admin`, `packages/seller-admin`) uses explicit `.ts` relative imports** (Deno resolves no other way; lint rule `gym/explicit-ts-extensions`), and the npm versions in each `supabase/functions/*/deno.json` must match the workspace.
- **Language rules are enforced by tooling:** the `gym/no-hardcoded-ui-text` and `gym/no-physical-direction-classes` lint rules (`tools/eslint-plugin-gym`), plus tests for translation parity, Sorani/Arabic spelling and font glyph coverage. Run `shadcn add` in `packages/ui` (its `components.json`), then `pnpm format`, and fix any hardcoded English the lint rule reports.
- **Deploys:** Vercel Git integration for the web app; GitHub Actions for checks and APK/EXE artifacts. Signing waits for Phase 11.
- **App ID:** `site.clickgroup.gymspa` on Android and Windows. Windows publisher: "Click Group". Permanent once published.
- **Platform adapters** (`nfc`, `printer`, `camera`, `storage`, `updater`, `save-file`) are added when first used, not as empty stubs.
