# Gym & Spa Management System

Multi-branch gym & spa system with NFC check-in. One codebase for Web/PWA, Android and Windows. Kurdish Sorani is the default language; English and Arabic are also available.

- Repository: https://github.com/miraann/gym-spa
- Full spec: [gym-spa-system-prompt.md](gym-spa-system-prompt.md)
- Working rules for contributors and Claude: [CLAUDE.md](CLAUDE.md)

> **Status:** Phase 1d done, then reworked for two editions (1d-R). The app always talks to its server: Supabase in the cloud for the **online edition** (web, Android, Windows), and later a server PC on the gym's local network for the **offline edition** (Windows only, see [CLAUDE.md](CLAUDE.md) → Two editions). Staff log in with their password once per device, then switch with a PIN that the server checks. The cloud setup (Supabase, Vercel) is live. The auth spike is done: Supabase Auth runs on the offline edition's Windows server PC ([spikes/windows-auth/README.md](spikes/windows-auth/README.md)). This README grows with each step.
>
> **Many gyms (spec §2.6).** Click Group sells the system to many gyms. **MT-1 is done:** every row belongs to a gym, staff log in with their gym's code, and the gym's top role is the **Owner** (خاوەن, formerly Super Admin); see [Gyms](#gyms). Older projects move with [Moving a cloud project to many gyms](#moving-a-cloud-project-to-many-gyms-mt-1). A separate **seller panel** (`apps/seller`, step MT-3) creates and manages gyms and their subscriptions; see [Seller panel](#seller-panel-click-group). `pnpm bootstrap:admin --gym <code>` still works. MT-1 and the design step are live. **MT-2, the staff module, is done:** staff logins are created and changed through Supabase Auth's admin API by a server-side module, the Edge Function `staff-admin`. It is live on the cloud project, and a smoke test there passed (`pnpm smoke:staff-admin --remote`); see [Staff accounts](#staff-accounts). The staff and roles screens that use it are done (1e-2, [The staff and roles screens](#the-staff-and-roles-screens)), and so are the branches and devices screens and required device registration (1e-3, [The branches and devices screens](#the-branches-and-devices-screens)). **MT-3, the seller panel, is done and live.** Next, in order (spec §8, changed 2026-10-11): Phase 2 (members + NFC), Phase 3 (plans, subscriptions, payments), Phase 4 (check-in), MT-4 (support access). MT-5 (offline licenses) and 1f (offline-edition server test) come later, in the offline packaging phase before Phase 11.

## Requirements

- **Node.js 24** (see `.node-version`)
- **pnpm 12**, through Corepack. If `corepack enable` fails with a permissions error on Windows, install the shim in your user folder instead:
  ```sh
  corepack enable --install-directory "%APPDATA%\npm" pnpm
  ```
- The project folder path must not contain `&`. Windows batch scripts (like Gradle's `gradlew.bat`, used for Android builds) break on it.
- **Android builds:** JDK 21 and the Android SDK (install Android Studio). The build finds the SDK through `ANDROID_HOME`, or in Android Studio's default folder (`%LOCALAPPDATA%\Android\Sdk` on Windows).
- **Windows builds:** Electron and the installer tools download on first use. PC/SC card readers (ACR122U) need `smartcard`, which is compiled during `pnpm install`, so a PC that builds the Windows app also needs **Visual Studio 2022 Build Tools** with the "Desktop development with C++" workload, and **Python 3.12** on the PATH (see [Windows app](#windows-app)). Without them `pnpm install` still works, and the Windows app is built without PC/SC readers.
- **Local database:** [Docker Desktop](https://www.docker.com/products/docker-desktop/), which runs Supabase in containers. On Windows it needs WSL 2: the installer turns it on, which needs a restart and virtualization enabled in the BIOS. The Supabase CLI comes with `pnpm install`.

## Getting started

```sh
pnpm install
pnpm db:start          # local Supabase in Docker (the first start downloads its images)
pnpm db:reset          # build the database: migrations, then demo data
pnpm bootstrap:admin --gym demo   # the Owner of the demo gym (the seed made the gym)
cp apps/app/.env.e2e apps/app/.env.development.local   # pnpm dev talks to the local Supabase
pnpm dev               # http://localhost:5173, log in with gym code demo and the Owner you just created
```

## Commands

Run from the repository root:

| Command | What it does |
|---|---|
| `pnpm dev` | Start the app in development mode (no service worker) |
| `pnpm build` | Production build into `apps/app/dist` |
| `pnpm preview` | Serve the production build at http://localhost:4173 |
| `pnpm test` | Unit tests (Vitest): formatting, translations, Sorani spelling, fonts, lint rules, connection state |
| `pnpm test:e2e` | Build against the local backend (`--mode e2e`, `apps/app/.env.e2e`), then run Playwright tests for the web app (login, PIN, lock, lost connection, RTL), the Windows app (encrypted sessions, storage and workers on `app://`, security rules) and the seller panel (on the web deployment's own output: the gym app with the panel under `/seller/`). Needs `pnpm db:start`, and `pnpm db:functions` for the panel |
| `pnpm test:int` | Integration tests of the staff module (`packages/staff-admin`) and the seller module (`packages/seller-admin`) against the local Supabase: the real Auth admin API (with TOTP and the access token hook) and database. Needs `pnpm db:start` |
| `pnpm db:functions` | Serve the Edge Functions locally at http://127.0.0.1:54321/functions/v1/staff-admin and `.../seller-admin` (`supabase functions serve`). First puts a throwaway `test-` license signing key into `supabase/functions/.env` when there is none ([Licenses](#licenses)). Leave it running in its own terminal |
| `pnpm test:deno` | The staff and seller modules in Deno, the Edge Functions' runtime: type-checks each function, runs the unit cases, then HTTP tests against the served functions. Needs `pnpm db:start` and `pnpm db:functions` |
| `pnpm lint` | ESLint, including the project rules below |
| `pnpm typecheck` | TypeScript type checking for every package |
| `pnpm format` | Format all files with Prettier |
| `pnpm check` | Typecheck, lint, format check and unit tests together |
| `pnpm android:apk` | Build the web app, copy it into the Android project and build a debug APK |
| `pnpm android:open` | Open the Android project in Android Studio |
| `pnpm desktop:dev` | Run the Windows app against the dev server (start `pnpm dev` first) |
| `pnpm desktop:start` | Run the Windows app with the production web build |
| `pnpm desktop:exe` | Build the Windows installer |
| `pnpm db:start` / `pnpm db:stop` | Start or stop local Supabase (Docker) |
| `pnpm db:status` | Local URLs and keys: API, Studio (the database UI, http://localhost:54323), database |
| `pnpm db:reset` | Rebuild the local database: every migration, then the demo data in `supabase/seed.sql`. Deletes local data, including your admin login |
| `pnpm db:test` | Database tests (pgTAP in `supabase/tests`): row level security, the access rules and the PIN functions |
| `pnpm db:lint` | Check the SQL functions for errors (plpgsql_check) in the `public`, `app` and `auth_hooks` schemas |
| `pnpm db:types` | Regenerate the TypeScript types of the database (`packages/db`). Run after changing migrations |
| `pnpm bootstrap:admin` | Create a gym's first Owner: `--gym <code>`, and the gym itself if it doesn't exist yet (its code can never change). Add `--remote` for a cloud project (see [A cloud project](#a-cloud-project)) |
| `pnpm bootstrap:platform-admin` | Create a Click Group platform admin for the seller panel: `--email`, `--full-name`; prints a temporary password once. `--remote` for the cloud project ([Seller panel](#seller-panel-click-group)) |
| `pnpm platform-admin:reset-2fa` | Last resort of the [recovery procedure](#recovery-procedure): removes a platform admin's two-step devices (`--email`), and with `--password` gives a new temporary password. `--remote` for the cloud project |
| `pnpm license:new-key` | Click Group's license signing key, made once on Click Group's PC: `--kid <id>`; writes one encrypted backup file, the public key into `packages/core`, and the private key into the cloud project's secret ([Licenses](#licenses)) |
| `pnpm license:restore-key` | Puts a backup's key back into the cloud project's secret: `--file <backup>` ([Licenses](#licenses)) |
| `pnpm smoke:staff-admin` | Smoke test of the staff module as a gym's Owner: creates `smoke.test`, checks that its temporary password logs in and must be changed, deactivates it and checks that its login is refused. Prints only the staff id, never a password. `--remote` for the cloud project (needs the publishable key: `SUPABASE_PUBLISHABLE_KEY` in `supabase/.env.local`, or the app's `apps/app/.env.local` for the same project); local needs `pnpm db:functions` |
| `pnpm staff-logins:move` | Once, after the MT-1 migrations, on a project that already had staff: moves their logins to their gym's address. Only shows what it would change; `--apply` changes it. `--remote` for a cloud project |
| `pnpm release:migrations` | The release flow's cloud migrations ([Releasing](#releasing)): lists the migrations the cloud lacks and whether each is purely additive. `--rehearse` also applies them to a local copy of the cloud's schema; `--push` then runs the cloud dry run and pushes |
| `pnpm release:check-live` | After a merge: waits until Vercel serves the merged commit, then loads the live gym app and seller panel in a fresh browser (read-only). `--commit <sha>`, `--site <url>` |

First-time setup for the browser tests: `pnpm --filter @gym/app exec playwright install chromium`.

The database, integration, Deno and end-to-end commands need Docker running, so `pnpm check` includes none of `pnpm db:test`, `pnpm test:int`, `pnpm test:deno` and `pnpm test:e2e`. The first `pnpm test:deno` downloads the function's npm packages into Deno's cache. The end-to-end tests create their own branches and staff and remove them afterwards.

## Project layout

```
apps/app             React + Vite app (PWA)
  src/app            app-level wiring: providers, navigation, service worker
  src/components     the app's own components (the layout: sidebar, rail, tab bar, top bar)
  src/features       one folder per module (auth, home, settings, members, ...)
  src/lib            preferences, formatting, logging, Supabase clients, the connection monitor
  src/routes         TanStack Router file routes (thin; pages live in features/)
  e2e                Playwright tests
  android            Android project (Capacitor); its build output is not committed
  scripts            Android build and icon scripts
apps/desktop         Windows app: an Electron shell around the same web build
  src/main.ts        window, app:// protocol, security rules
  src/preload.ts     the small bridge the web app gets (window.gymDesktop)
  e2e                Playwright tests that launch the real Electron app
packages/core        rules in plain TypeScript for the screens (validation, settings, permissions)
packages/db          generated Supabase types
packages/platform    platform detection and native adapters; the only code that touches Capacitor or Electron
packages/i18n        translations (ckb, en, ar), typed keys, number/money/date formatting
packages/ui          the shared UI (gym app and seller panel): src/styles/theme.css (tokens, fonts),
                     components/ (shadcn/ui; add more with `shadcn add` here), blocks/, hooks/
packages/vite-plugins build-time Vite plugins of both apps (the Content-Security-Policy)
packages/staff-admin the staff module: staff logins through Supabase Auth's admin API (server side;
                     the app imports only its request types and error keys)
packages/seller-admin the seller panel's server module (Edge Function seller-admin): gyms with their
                     first Owner, platform admin logins; never imported by the gym app
apps/seller          the seller panel (web only), served at /seller/ of the gym app's deployment
supabase             the database
  functions          Edge Functions (Deno): staff-admin, seller-admin
  migrations         schema changes, in order (tables, RLS policies, triggers, functions, built-in roles)
  tests              pgTAP tests, run with pnpm db:test
  seed.sql           demo data for local development (Kurdish)
  scripts            bootstrap-admin.ts, bootstrap-platform-admin.ts, reset-platform-admin.ts,
                     move-staff-logins.ts, test-deno.ts
tools/eslint-plugin-gym  project lint rules
```

## Languages

- **Kurdish (`ckb`) is the source language.** Add every new text to `packages/i18n/src/locales/ckb/*.json` first, then `en` and `ar`. A key missing from English or Arabic is a TypeScript error, and a test checks that all languages have the same keys and `{{placeholders}}`.
- A spelling test rejects Arabic letters in Kurdish texts (ي ك ى ة) and Kurdish letters in Arabic texts (ی ک ە).
- Lint rules:
  - `gym/no-hardcoded-ui-text`: text in JSX, labels, placeholders and toasts must come from `t('...')`.
  - `gym/no-physical-direction-classes`: use `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`/`text-start`, never `ml-`/`mr-`/`left-`/`text-left`, so layouts mirror in RTL.
- Fonts (all bundled, never loaded from the internet): **UniSalar_F_113** for Kurdish (`packages/ui/src/assets/fonts`), Vazirmatn for Arabic, Inter for English. UniSalar is limited to Arabic-script characters with `unicode-range` (it has no Latin letters or ASCII digits): digits and Latin text in Kurdish screens use Vazirmatn. **UniSalar_F_113 was supplied by the project owner, who is responsible for its licence: confirm the licence before selling the system.** It has one weight, so Kurdish text is never made bold (`font-synthesis-weight: none`): Kurdish headings are larger instead.
- Dates are shown in Baghdad time. Kurdish uses Sorani month names (`4ی تشرینی یەکەمی 2026`). Digits are Western by default, with Eastern Arabic (`٢٥٬٠٠٠ د.ع`) as a setting.

## Database (Supabase)

Supabase runs locally in Docker for development (`supabase/config.toml` is the local setup). The app has no local copy of the data: every screen reads and saves through the server (supabase-js + TanStack Query), under the signed-in staff member's own session. For the cloud project, see [A cloud project](#a-cloud-project).

Both editions use the same migrations, so server logic goes into Postgres (functions, triggers, RLS). Supabase-only features (Edge Functions, pg_cron, Realtime, Storage) need an offline-edition version too before a module may use them. The one Edge Function, `staff-admin`, is a plain `Request → Response` handler that the offline edition's `gym-server` will run as well ([Staff accounts](#staff-accounts)).

### Migrations

- Every schema change is a new file in `supabase/migrations`. Create one with `pnpm --filter @gym/supabase exec supabase migration new <name> --workdir ..`. Never change a migration that has already run on a shared database.
- After changing migrations or tests: `pnpm db:reset`, `pnpm db:test`, then `pnpm db:types`.
- **Expand first, drop later.** The cloud gets a migration before every client is updated (the deployed web app, installed APKs and EXEs), so a migration only adds: new functions, columns and tables, with the old ones still working unchanged. Removing or changing something an older client uses goes in a later migration that waits in `supabase/pending-migrations/` (never pushed; its README says what each file waits for) until every client is updated, then moves into `supabase/migrations/` with a new timestamp.
- Nothing is reachable through the API by default (`auto_expose_new_tables = false`, like new cloud projects): each migration grants exactly what it needs.
- Operations that change several rows together (a payment with its invoice and subscription, a locker assignment, a spa booking) are one Postgres function called with `rpc()`, so they succeed or fail as a whole.

### Gyms

Spec §2.6. Migrations `20261010100000_gyms.sql` and `20261010100100_gym_rules.sql`.

- The online edition keeps many gyms in one database; the offline edition has exactly one. Every table except the permission catalog has `gym_id`, and every rule checks it, so staff only ever reach their own gym's rows. `supabase/tests/120-gym-isolation.test.sql` proves it for every table (the list comes from the catalog).
- `gym_id` fills itself in from the signed-in staff member, so the app never sends it; server code using the secret key must give it. It never changes, and every link between rows includes it (composite foreign keys), so no row can point at another gym's, whoever writes it.
- **Gym codes are permanent.** The code is part of every staff login, so it can never change and is never reused: 3 to 20 lowercase Latin letters and digits, single hyphens between them, starting with a letter. These codes are reserved: `admin`, `seller`, `support`, `api`, `www`, `app`, `login`, `clickgroup`, `gym-spa`, `test`, `root`, `system`. The rules are in `app.is_valid_gym_code()` and `app.is_reserved_gym_code()`, and again in `packages/core/src/gym.ts`; a unit test keeps the two identical. Choose a code carefully before creating a gym.
- A new gym (`public.create_gym()`) gets its own copy of the 8 built-in roles and its first branch, B1. Usernames, branch codes, roles, settings, the PIN lockout and the audit log are per gym.
- **Access state** (`app.gym_access()`; the app asks with `public.my_gym()`):
  - active, then 30 days of **grace** after `paid_until`, then **read-only**;
  - **suspended** (`suspended_at`): read-only at once. Staff can log in, look and use their PINs, but nothing can be added or changed (`gym_read_only`);
  - **locked** (`locked_at`): all access ends at once; staff see nothing (`gym_locked`), and Supabase Auth gives them no new token ([The Auth hook](#the-auth-hook)).
  - Click Group sets these with the seller functions ([Seller panel](#seller-panel-click-group)). `my_gym()` also says whether a read-only gym is suspended (`suspended`) or its subscription ran out.
- **What the gym app shows** (a banner at the top of every page, `apps/app/src/features/billing`; the rule is `billingNotice()` in `packages/core/src/billing.ts`, counted in Baghdad calendar days):
  - to staff with `billing.view` (the Owner, and Admin in every gym): a warning when the subscription ends in 30 days or less, again at 7 days and on the last day, then the grace period with the date the gym becomes read-only. The 30- and 7-day warnings can be closed until the next stage (per staff member, on that device); the last day's warning and the grace notice can't;
  - to everyone: that the gym is read-only, and whether Click Group suspended it or the subscription ran out. It can't be closed;
  - nothing for a locked gym: the app locks itself. It uses the gym state of the device's last server check (at start, at unlock, every 5 minutes, and when the network returns), and counts the days again every hour.
- **Limits:** `max_branches` and `max_devices` (empty: no limit) are checked whenever a branch or device is added or made active again (`gym_branch_limit`, `gym_device_limit`). **Every registered device counts toward `max_devices`,** an Owner's or manager's personal phone or laptop too: a device must be registered before staff can work on it ([Staff, roles, branches and devices](#staff-roles-branches-and-devices)). Deactivate a device that is no longer used to free its place.

### How access works

- Staff log in with their gym's code and a username. Supabase Auth gets `<username>@<gym code>.staff.gym-spa.invalid` behind the scenes (`packages/core/src/staff.ts`); `.invalid` is a reserved domain, so no mail can go there. The database refuses a staff account whose Auth email doesn't match (`staff_login_mismatch`).
- Every table has row level security. Policies use helpers in the private `app` schema, which the API doesn't expose:
  - `app.current_gym_id()`: the signed-in staff member's gym, only while they are active and the gym isn't locked. Every policy checks `gym_id = (select app.current_gym_id())`.
  - `app.has_permission('members.create')`: the signed-in staff member's role has that permission. The Owner has all of them.
  - `app.accessible_branch_ids()` and `app.has_branch_access(id)`: every branch of the gym for staff with `all_branches`, otherwise their rows in `staff_branches`. The rule is written once, in `app.refresh_branch_access()`, which keeps it as rows in `staff_branch_access`.
- Guard triggers stop privilege escalation. Nobody can give a permission (or a role with a permission) they don't have, change their own role or access, or manage someone with access they lack. Only the Owner can give the Owner role or edit the built-in roles.
- Changes made without a staff session (migrations, server code using the secret key) skip the per-user checks. The secret key never goes into the app.
- These rules reject a change with a stable key as the error message (`cannot_grant_role`, `read_only_column`, ...) for the app to translate, and an English detail for the logs.
- Every change to the important tables goes into `audit_logs`: who, when, the old and new values, IP and device. Nobody can change or delete it, and secrets such as PIN hashes are logged as `redacted`.
- The permission catalog is in `supabase/migrations/20261005100300_permission_catalog.sql`. The 8 built-in roles are templates (`app.role_templates`, migration `20261010100000_gyms.sql`) that every new gym copies.

### Staff, roles, branches and devices

Step 1e, migration `20261011100000_admin_screens.sql`, tests `supabase/tests/220-admin-screens.test.sql`. The database half of the admin screens; every change still goes through the guards above.

- **Multi-row changes are one call each, all or nothing**, running under the caller's own session (security invoker), so RLS, the guards and the audit log apply:
  - `save_staff_access()`: a staff member's name, phone, role and branches. With all branches their `staff_branches` rows go, because access follows the flag. Their login (username, password, active or not) changes through the [staff module](#staff-accounts) instead.
  - `save_role()`: creates a custom role (its id comes from the app) or changes one. It updates the names, and the permissions too unless the list is `null` (an empty list takes them all away). The Owner role is always saved with `null`: it has every permission and stores none. Refusals: `unknown_permission`, `cannot_grant_permission`, `cannot_edit_own_role`, `system_role_read_only` (built-in roles are the Owner's to edit), `role_deleted`.
- **What the screens read:** `staff_directory()` lists the staff the caller may see, with role, branches (`hidden_branch_count` counts those the caller can't access), PIN state, last login and `can_manage`. `role_overview()` lists the gym's roles with their permissions, staff count, `can_edit`, `can_edit_permissions` and `can_grant`. Both work these flags out with the guards' own rules, so a button is never offered that the server would refuse.
- **Branches:** `create_branch()` gives a new branch the gym's next code (`B2`, `B3`, ...). Codes are never reused, because receipt numbers carry them. Branches are deactivated, never removed, and a gym always keeps one active branch (`last_active_branch`).
- **Devices must be registered** (decided 2026-10-11). Someone with `devices.manage` registers a device once (`register_device()`: a name, and a branch they can access; it must be active). From then on the device works in that branch. `my_device()` tells every staff member's app the device's branch and whether they may use it. `move_device()` moves it to another branch, where it gets the next code (`D01`, ...); `branch_id` and `code` change in no other way (the guard looks for its row in `app.transaction_marks`, see Members → Health info). `unlock_on_device()` checks the PIN on a device, after checking that the device is registered (`device_not_registered`), active (`device_inactive`), in an active branch (`branch_inactive`) and in the staff member's branches (`no_branch_access`). None of these use up a PIN try. The app no longer calls `unlock_with_pin()`, but it stays, unchanged, until every installed client is updated; its removal waits in `supabase/pending-migrations/` (expand first, drop later). Migration `20261015100000_devices_and_branches_screens.sql` adds `device_overview()` and `gym_limits()`.
- **This is a deterrent, not a security boundary.** The device id comes from the device, so someone could make up a new one. What a staff member can read or change is still decided per staff member by RLS.
- **A read-only gym** can still deactivate a device (it only takes access away), but it can't register, move, rename or reactivate one.

### Members

Phase 2, step 2a, migration `20261019100000_members.sql`, tests `supabase/tests/240-members.test.sql`. The rules the forms need are in `packages/core/src/members.ts` and `search.ts`; tests compare them with the migration. The decisions are in spec §4.1.

- **Members belong to the whole gym.** Everyone with `members.view` sees every member of their gym; `branch_id` is the home branch (where they joined), a filter. Adding a member needs `members.create` and a branch the staff member can access (an active one).
- **The member number** (`member_number`) is given by the server, one counter per gym (`app.gym_counters`), in order and without gaps: a save that fails gives its number back. It never changes and is shown as `000123` (`formatMemberNumber()`).
- **Phones** are stored as `+9647XXXXXXXXX` for Iraqi mobiles (other countries: `+` and the country code). The app turns what staff type into that form (`normalizeMemberPhone()`). A member without a phone of their own (a child) needs an emergency contact's phone (`contact_phone_required`). A phone belongs to one member per gym, archived members included (`phone_in_use`).
- **Health info** is the table `member_health` (one row per member, the same id). Reading it needs `members.medical.view`. `create_member()` may write it with only `members.create` (it marks that one member for its own transaction: a row in the private table `app.transaction_marks`, which only `create_member()` and `move_device()` write, since 2j's migration `20261024100000_transaction_marks.sql`; a setting would do for clients of the Data API, but not on the offline edition's server PC, where someone may get SQL access; `create_member()` is security definer for that and checks the phone in the caller's gym itself); later changes need `members.medical.view` and `members.edit`. `members.has_health_notes` (medical notes or injuries are there) follows it, for staff who can't read it. The audit log records health changes as `redacted`.
- **Status:** active, suspended, banned or archived, changed by `set_member_status()` with `members.delete`, and a reason except for active (`reason_required`). Who changed it and when are recorded on the row. An archived member can't be changed until they are restored (`member_archived`). Members are never deleted: no client may delete a row.
- **RPCs** (security invoker, so RLS, the guards and the audit log apply): `create_member()` (with health info, all or nothing; the same id again says `member_exists`, for a retry after a lost answer), `update_member()` (the whole profile, last write wins; with `p_save_health` also the health info), `set_member_status()`, `find_member_duplicates()` (same phone, same name, or a similar name: the same first two words or a letter or two apart, via `fuzzystrmatch`), and `search_members()` (by name, number or phone, best matches first). The member list reads the table directly, filtering on `search_text`.
- **Search** compares normalized text: `members.search_text` holds the name, the number and the phones (also in the local `0750…` form) as `app.normalize_search_text()` writes them, and a query goes through `app.member_search_needle()` (`memberSearchNeedle()` in the app). Arabic and Kurdish look-alike letters match, and so do the Kurdish letters an Arabic keyboard can't type, so `ريباز` finds `ڕێباز`.
- **Searching from anywhere** (step 2h): Ctrl+K, or the search button in the top bar on phones, finds members by name, phone or member number next to the pages (`apps/app/src/components/layout/command-palette.tsx`).
  - It searches `search_text` like the list's search box, archived members included, and shows at most 6; the member whose number was typed comes first. "All results in the members list" opens the list with the same search.
  - Pages are matched in the app with `matchesSearch()`, so Kurdish typed with an Arabic keyboard finds them too.
  - A card held to a reader on a screen that doesn't wait for one opens its member ([NFC cards and readers](#nfc-cards-and-readers)).
- **Seed:** the demo gym has 200 members in B1 and B2, numbered 1 to 200, with ids `md5('demo-member-<n>')`.
- **Photos** (step 2c, migration `20261021100000_member_photos.sql`, tests `260-member-photos.test.sql`) are kept in Postgres, never in Storage, so both editions work the same and every backup has them. The table `member_photos` has one row per member (the same id): the photo (at most 480 px and 150 KB) and a square thumbnail for lists (128 px, at most 12 KB), each WebP or JPEG as base64. The app makes both (`member-photo-image.ts`, with the shared resizing in `apps/app/src/lib/image.ts`, which the logo uses too); `set_member_photo()` and the table check the type by the file's first bytes and the sizes again (`invalid_photo`; limits in `packages/core/src/member-photos.ts`, compared with the migration by a test). `members.photo_updated_at` follows the table (only its trigger sets it), so lists fetch only the thumbnails they need and caches know when a photo is new. Seeing photos needs `members.view`; adding, replacing and removing them needs `members.edit`, and an archived member's photo stays until they are restored. `remove_member_photo()` deletes the photo for real (personal data the gym asked to remove). The audit log records who and when, with the pictures `redacted`.
- **The camera** (`packages/platform/src/camera.ts`) is the web camera API in all three targets: the browser asks the user; the Windows app allows video only, only for its own page (`apps/desktop/src/main.ts`, never the microphone); the Android app declares `CAMERA` (not required, so devices without a camera still install it) and the WebView asks at first use. Staff can always choose a picture from a file instead.

### NFC cards

Phase 2, step 2d, migration `20261021300000_nfc_cards.sql`, tests `supabase/tests/270-nfc-cards.test.sql`. The UID rules the screens need are in `packages/core/src/cards.ts`. The decisions are in spec §1; the readers are in [NFC cards and readers](#nfc-cards-and-readers).

- **The UID is the card.** `app.normalize_card_uid()` (and `normalizeCardUid()` in the app) reads what a reader gives: hex with or without separators (`04:a2:3b:c1:5d:6e:80`), or exactly 10 digits (a 4-byte UID as a number), Kurdish or Arabic digits too, in the card's byte order or reversed. It gives uppercase hex of 4, 7 or 10 bytes, or nothing; a UID of only `00` or only `FF` bytes (a failed read) is refused. The table stores normalized UIDs only. The list of cases is in the 270 test file, and `cards.test.ts` runs the same list through the app's function, so both read cards alike.
- **One row per time a card was a member's** (`nfc_cards`), so the rows are the member's card history: `active`, `ended` (with `end_reason`: returned, lost, damaged, stolen, blocked, member_archived) or `blocked`. A member has at most one active card, and a UID is active or blocked at most once per gym (unique indexes); two gyms' cards may share a UID. Staff change a row only through the steps below (the guard refuses anything else, `invalid_card_change`), and the server writes when and who. Cards are never deleted.
- **RPCs** (security invoker, so RLS, the guard and the audit log apply). They take the UID in the card's own byte order: the app turns a reversed reader's UID around first.
  - `assign_card()` (`cards.manage`): `card_exists` for the same id again (a retry after a lost answer), `invalid_card_uid`, `card_blocked`, `card_in_use` (someone has it), `member_has_card` (replace it instead), `member_archived`.
  - `replace_card()` (`cards.manage`): lost, damaged or stolen. The card stops working at once; with `p_new_uid` the new card is given in the same step, all or nothing (`replaces_id` links them, for the fee in Phase 3). Stolen also blocks it and needs `cards.blacklist`. `card_not_active`, `same_card`.
  - `end_card()` (`cards.manage`): the member gave the card back; anyone may be given it.
  - `block_card()` / `unblock_card()` (`cards.blacklist`): blocking needs a reason (`reason_required`) and stops a working card; a lost or returned card is blocked from its latest row (`card_reassigned` once someone else had it). Unblocking frees the UID; the block stays in the row's history.
  - `find_card()` (`members.view`): who has the UID now (active or blocked), or else who had it last; nothing for a card the gym never gave out.
- **At the same moment:** when two staff members give one card to two members, or two cards to one member, at once, the unique indexes refuse the second save with the same keys (`card_in_use`, `member_has_card`). The test plays that race with a trigger, because a real race can't run inside one test transaction.
- **Archiving a member** ends their working card (`member_archived`, also for staff without `cards.manage`), so it can be given to someone else. A blocked card stays blocked.
- **Seeing cards** needs `members.view`. A read-only gym changes no cards, but staff can still look them up.
- **Seed:** the demo members have made-up cards (7-byte `04…` UIDs, 4-byte for every 7th member), ids `md5('demo-card-<n>')`. Every 10th member (4, 14, 24, …) has no card yet. Members 11, 61, 111 and 161 lost a card before, member 21's old card was stolen (blocked), and member 71's lost card was blocked later.
- **The card screens** (step 2e, `apps/app/src/features/cards`): a member's page has a card section with the card that works now (its UID with the bytes apart, always left to right) and the cards they had before, each with what happened to it (icon and words, never color alone). With `cards.manage`: give a card (پێدانی کارت), replace it when it was lost or damaged (گۆڕینی کارت; the new card can come later), and take it back (وەرگرتنەوەی کارت). With `cards.blacklist`: report it stolen, block it with a reason (بلۆککردن) and unblock it (لابردنی بلۆک), also from the history. In the dialogs, holding a card to any reader fills in the number and saves at once when nothing else is missing; a number typed by hand waits for the button. When a card is someone else's or blocked, the dialog says whose it is. Nothing can be changed without a connection or in a read-only gym. Tests: `apps/app/e2e/cards.spec.ts`.

### Importing members

Phase 2, step 2j, migrations `20261023100000_member_import.sql` and `20261023110000_member_import_undo.sql`, tests `supabase/tests/290-member-import.test.sql` and `300-member-import-undo.test.sql`. Reading a file and its rows is `packages/core/src/member-import.ts`; the page is `apps/app/src/features/member-import` (`/members/import`, a button on the member list). The decisions are in spec §4.1. The sample list `samples/sample-members-import.xlsx` (all fake; its second sheet explains the case each row was made for) is read by `sample-file.test.ts` and imported by `apps/app/e2e/member-import.spec.ts`.

- **Who:** `members.import` and `members.create` (Owner and branch manager). Cards are given only with `cards.manage`; without it the card numbers are kept with the import record. Health info is written without `members.medical.view`, as when adding one member.
- **The file is read on the device**, nothing is uploaded: `.xlsx` with our own reader (`read-xlsx.ts` with fflate's `unzipSync`; spreadsheet libraries that unzip in a web worker are blocked by the Content-Security-Policy), `.csv` with papaparse (UTF-8, otherwise Arabic Windows text with a warning). At most 5,000 rows and 5 MB; an old `.xls` file is refused with a hint to save it as `.xlsx`.
- **Columns** are matched by their header in Kurdish, Arabic or English (`HEADER_NAMES`), and staff can change each one. The old member number, subscription type and subscription end can't be used yet: they are kept per member in `member_imports.kept` for Phase 3, with a birth year when that is all a row gives and card numbers that weren't given. When the notes column goes to the member's notes, the page warns that everyone who sees members reads them, with a button that sends it to the medical notes.
- **Branches:** each value of the branch column goes to a branch, matched by name (with or without «لقی») or code; empty cells, or a file without that column, go to this device's branch. Staff choose the rest.
- **The preview** shows every row as ready, warning, error or already there, with every reason as a sentence. Errors (no name, gender or branch, no valid phone) can't be imported; warnings are imported with something left out or changed. Inside the file the earlier row wins: the same phone with another name becomes the later row's emergency contact phone, and a card is given once. `check_member_import()` compares the rows with the gym's members and cards: the same phone and name is already there; the same phone with another name becomes the emergency contact phone; the same or a similar name (`app.member_names_match()`, `memberNamesMatch()` in the app, one list of cases in the 290 test) may be the same person. Ready rows and warnings start ticked, except those that may be the same person.
- **All or nothing:** `import_members()` saves the ticked rows in one transaction (members, health info, cards and one `member_imports` row) or refuses them all with `import_refused` and `[{row, key}]` as the detail. The page shows each reason next to its row and unticks it, so the rest can be imported again. The same import id again returns the saved import (a retry after a lost answer). Members are numbered in the file's order, `created_at` is the file's registration date at noon in Baghdad, and `members.import_id` names the import (set from the transaction's mark only, never changed). The audit log records every new member as usual, with the kept values `redacted`.
- **It fits the cloud's statement timeout** (8 s for the `authenticated` role, the same locally). The function checks everything once, set-based, and then marks its transaction so the members' triggers skip the per-row checks it already made (below). Measured locally under `statement_timeout = 8s`: 5,000 rows, each with a card, health info and kept values, in 3.4–3.6 s (one row at a time took 12.3 s); the check against 5,000 members takes 0.8–1.2 s per call of 1,000 rows, the size the page sends. A function's own `SET statement_timeout` doesn't lengthen a statement already running, so it can't be raised that way. The 290 test imports 5,000 rows under `statement_timeout = 8s`.
- **The transaction mark can't be made by anyone else.** It is a row in the private table `app.member_import_marks` (the transaction's id, the import, and the action `import` or `undo`); no API role has any right on it. Only security-definer code owned by the migrations' role can write it, and `import_members()` and `undo_member_import()` are the only such code that does, after their checks; each removes its mark before it returns. Both are security definer for that reason, and make every check RLS would make themselves (the caller's gym, permissions, branches); the triggers, row stamps and audit log still name the caller (`auth.uid()`). No setting is involved, since a session with SQL could set any setting with `set_config()`. While marked, the triggers skip only what the function checked: the gym being writable; for an import, the branch of each new member, its number (reserved in one step by `app.reserve_member_numbers()`, which only the import may call) and its health info; for an undo, `members.delete` and ending cards one by one. The 290 test tries the old setting, writing the table, reserving numbers, and direct inserts and updates after an import in the same transaction; every check still runs.
- **Afterwards** the page counts what was imported and offers the rows left out, with the reason, as a CSV file staff can fix and import again (an unticked row also says why it started unticked). Files are saved with `saveFile()` (`packages/platform/src/save-file.ts`): the web app downloads them; in the Windows app they go through Windows' save dialog, in the Downloads folder and titled with the file's name (`will-download` in `apps/desktop/src/main.ts`; the app cancels any other download); Android's WebView can't download what a page makes, so the Android app writes the file to its cache and opens the share sheet (Drive, Files, WhatsApp, ...) with the official Capacitor plugins `@capacitor/filesystem` and `@capacitor/share` (MIT; iOS later works the same).
- **Taking an import back** (staff with `members.delete`, decided 2026-10-22): the result screen, and the list of earlier imports on the import page (who, when, which file, how many members and cards), offer "archive all members from this import". `member_import_undo_preview()` counts what it would do: the members to archive, those archived already, those changed since the import (their profile, status, photo, health info or cards changed after it) and their working cards. `undo_member_import()` archives them with the reason and ends their cards, all or nothing, and records who took the import back, when and why (`member_imports.undone_at`, `undone_by`, `undo_reason`; once per import, `import_undone`). Members changed since are archived too. Nobody is deleted, so each member can still be reactivated. `member_import_history()` lists the gym's last 50 imports for staff with `members.view` and `members.import` or `members.delete`. 5,000 members are archived in 3.3–4.1 s (the 300 test does it under `statement_timeout = 8s`).
- **In the browser** (`IMPORT_TIMING=1 pnpm exec playwright test import-timing` in `apps/app`, skipped otherwise): a 5,000-row `.xlsx` (176 KB) is read and its rows prepared in 0.3 s, 1.6 s with the CPU slowed down 4 times; ticking rows takes under 0.5 s.

### Plans

Phase 3, step 3b, migration `20261024200000_plans.sql`, tests `supabase/tests/320-plans.test.sql`. The rules the screens need are in `packages/core/src/plans.ts`; the page is `apps/app/src/features/plans` (`/plans`, for `plans.manage`). The decisions are in spec §4.2.

- **Four kinds**, the combinations of an end date and a visit count: `time` (a duration in months or days), `visits` (a number of visits, no end date), `hybrid` (both) and `unlimited` (neither). Check constraints keep the columns to the kind; only a plan with an end date can be frozen (`max_freeze_days`).
- **End dates:** `app.plan_end_date()` (and `planEndDate()` in the app): in months, the day before the same date n months later, or that month's last day when it has no such date (31 Mar + 1 month ends 30 Apr); in days, n − 1 days after the start. One list of cases in the 320 test, run by `plans.test.ts` too.
- **Rules** the check-in engine (Phase 4) will apply: gender, branches (`all_branches`, or rows in `plan_branches`), days of the week (ISO 1–7, `app.is_valid_weekdays()`), one time window a day, the most visits a day. Prices are whole dinars.
- **`save_plan()`** adds or changes a plan with its branches, all or nothing (`branch_required`, `branch_not_found`). Everyone in the gym sees plans; changing one needs `plans.manage` and access to every branch it works in, before and after the change (`no_branch_access`; a plan for all branches needs access to all). Plans are never deleted; `is_active` false takes one off sale. A read-only gym changes none.

### Subscriptions, invoices and payments

Phase 3, step 3c, migration `20261024300000_selling.sql`, tests `supabase/tests/330-selling.test.sql`. The price rules the screens need are in `packages/core/src/pricing.ts`. The decisions are in spec §4.2.

- **Only the server writes money.** `subscriptions`, `invoices`, `invoice_items`, `payments` and `installments` have no insert, update or delete grant for staff: security-definer functions write them after making every check RLS would (gym, permissions, branch). `read_only` triggers keep what a document says from ever changing, even for server code; only void and status columns change, in later steps. Nothing is ever deleted.
- **`sell_subscription()`** saves the subscription (with its own copy of the plan, so changing the plan never changes it), the invoice and its item, the first payment and the installments, all or nothing. The same ids again return what was saved (a retry after a lost answer). Its error keys, in order, are in the function's comment; the screen sends the price it showed, and a plan that changed meanwhile gives `price_changed`.
- **Discounts** are whole dinars, at most the share the seller's discount permission allows (`app.max_discount_percent()`, the highest counts; `isDiscountAllowed()` in the app), with a reason.
- **Payments** are in dinars. A payment in dollars keeps the dollars and the rate, and its dinar value is `app.usd_to_iqd()` (half up; `usdToIqd()` works in whole cents so it never differs). Dollars are whole bills: what they are worth beyond what the invoice owes is change given back in dinars (`change_given`, `usdPayment()` in the app). A payment never counts for more than the invoice owes, so nobody has credit. Methods: cash, card, FIB, FastPay, ZainCash, bank transfer, each with an optional reference.
- **Installments** add up to what wasn't paid at the sale, due from today on, each after the one before. `installment_balances` shows how much of each is paid: payments go first to the part without an installment, then to the installments oldest first.
- **Balances** are computed, never stored: `invoice_balances` (paid, due; a voided invoice owes nothing). Both views run as the caller (`security_invoker`).
- **Numbers** come from `app.branch_counters` in the same transaction, so they are in order without gaps: invoices `B1-000457`, receipts `B1-R000123`.
- **Who sees what:** subscriptions with `members.view` (gym-wide, like members); invoices with `payments.view` and access to their branch, and an invoice's items, payments and installments with the invoice.
- **Taking an import back** counts a member who bought something since the import as changed (spec §4.1).

### Selling screens

Phase 3, step 3d: `apps/app/src/features/subscriptions`. The form's rules are `sell-form.ts` (`saleDraft()` works out the sale for the summary and the checks alike; `sell-form.test.ts`), with `packages/core/src/subscriptions.ts` (what a subscription is today, renewals, months) and `pricing.ts`. Tests: `apps/app/e2e/subscriptions.spec.ts`.

- **The member's page** has a subscriptions section: the current and upcoming ones (state as icon and word: چالاک, هێشتا دەستی پێ نەکردووە, بەسەرچووە, …, with the days left), the earlier ones folded away, the invoice number for staff who see money, and what the member owes (`payments.view`). Expired and not started yet come from the dates and are never stored.
- **Selling** (`/members/$memberId/sell`, `subscriptions.sell`, an active member): the plans for the member's gender with their length and price; the start (today, after the current subscription when there is one, or another date; a warning when a current one would overlap); a discount up to the seller's share, with a reason; the payment (all now, part now, or on credit; dinars, or dollars with the rate, showing their value and the change to give back; method and transaction number); installments for what is left (2 to 12, a month apart, split as evenly as whole dinars allow); a summary; and the branch when the staff member has several. Without `payments.create` everything is sold on credit. The sale's ids are made once, so sending it again after a lost answer saves it once.
- **After the sale** the screen shows the invoice and receipt numbers, what was paid and what is owed, and the member's card section, to give a card now if they have none.
- **Seed:** the demo members 1 to 150 who are active have bought a plan (some expired, some unpaid, some in installments), ids `md5('demo-sale-<n>')`.

### Payments and debts

Phase 3, step 3e, migration `20261024400000_payments.sql`, tests `supabase/tests/340-payments.test.sql`; the screens are `apps/app/src/features/payments` (the member's money section, `/payments`), tests `apps/app/e2e/payments.spec.ts`.

- **`pay_invoice()`** takes a payment on an invoice that is owed, in the branch where the money is taken (dinars, or dollars with change, through the same `app.read_payment()` as a sale). `nothing_owed`, `invoice_voided`, `payment_too_large`. The same payment id again returns what was saved.
- **Voids** (`payments.void`, a reason, only on the day it was made in Baghdad, `void_too_late` after that): `void_payment()` for one payment or refund; `void_invoice()` for an invoice with its payments, and its subscription becomes `voided`. A voided row counts for nothing; nothing is deleted.
- **Refunds** (`refund_invoice()`, `payments.refund`, a reason, with a receipt number): money given back, at most what was paid in and not given back yet (`refund_too_large`). A refund lowers the charge by as much, so it never makes the member owe more: `invoice_balances.due` is the total less what was paid in, with `refunded` beside it.
- **Other invoices** (`charge_member()`, `payments.create`): the card replacement fee (`card_replacement`, spec §1) or another charge, with an optional payment. After a lost or damaged card is replaced with a new one, the fee dialog opens for staff who take money.
- **`member_debts`** (a view, as the caller): what each member owes on the invoices the staff member sees, what is owed now (the rest is installments not due yet) and the next installment's date. The payments page lists it, most owed now first, with today's payments and refunds and their total.
- **The member's page** shows their invoices (state as icon and word: paid, partly paid, unpaid, voided), each with its payments (method, dollars and change, refunds, voids and their reasons) and installments (overdue ones marked), and the actions the staff member may take.

### Changing subscriptions

Phase 3, step 3f, migration `20261024500000_subscription_changes.sql`, tests `supabase/tests/350-subscription-changes.test.sql`; the screens are the actions menu of each running subscription on the member's page (`apps/app/src/features/subscriptions/subscription-change-dialogs.tsx`), tests `apps/app/e2e/subscription-changes.spec.ts`.

- **What the unused part is worth** (`app.unused_value()`): its share of what was charged for the subscription (its invoice item after the discount): days left of the days sold (frozen days aren't used), visits left of the visits sold (counted from check-in since Phase 4, `app.subscription_used_visits()`), the smaller for hybrid, in whole dinars. It first clears what is still owed on the invoice (an `invoice_credits` row, a lowering of what is owed with no money moving), and the rest was paid and not used. `subscription_change_preview()` shows both before staff confirm.
- **Freezing** (`freeze_subscription()`, `subscriptions.freeze`): a number of days from today or a later date within the subscription, up to the plan's freeze days in all, one freeze at a time; the end date moves at once. `unfreeze_subscription()` ends it today (or takes a planned one back whole) and moves the end date back by the days not frozen. The `subscription_freezes` rows are the history; a subscription is frozen on a day a freeze covers (`app.is_frozen()`, `isFrozenOn()`).
- **Changing the plan** (`change_plan()`, `subscriptions.change` and `subscriptions.sell`): from today, for a subscription that runs today and isn't frozen. The old one becomes `replaced`; the rest of its unused part comes off the new price as a discount naming the old invoice (`credit_exceeds_price` when it is worth more than the new plan: cancel with a refund and sell instead), and the new one is sold through the same `app.save_sale()` as any sale, with `replaces_id`. Unlimited plans have nothing to share out (`cannot_change_plan`).
- **Transferring** (`transfer_subscription()`, `subscriptions.transfer`, a reason): a new subscription for another active member, from today to the same end, with the freeze days left and `transferred_from_id`; the old one becomes `transferred`, and the invoice stays with the first member.
- **Cancelling** (`cancel_subscription()`, `subscriptions.cancel`, a reason): the unused part clears what is owed, and up to the rest can be given back at once (`payments.refund`), with a receipt.
- **Renewing** is a sale: the menu opens the sell page with the plan chosen and the start after the current subscription.

### Receipts and memberships

Phase 3, step 3g, migration `20261024600000_memberships.sql`, tests `supabase/tests/360-memberships.test.sql` and `apps/app/e2e/receipts.spec.ts`.

- **Receipts** (`apps/app/src/features/payments/receipt-print.tsx`): every invoice on the member's page, and the screen after a sale, has a print button for an 80mm roll or an A4 page. The receipt is drawn into `#print-root`, which the print styles show alone (`apps/app/src/styles.css`), with its `@page` size, in the member's own language and digits; then the print dialog opens, where a PDF can be saved too. `canPrint()` and `printPage()` in `packages/platform/src/printer.ts`: the browser and the Windows app; the Android app has no print dialog, so it shows no button. **Silent printing (step 8f):** in the Windows app, Settings → پرینتەر chooses this PC's receipt printer (an 80mm thermal printer installed in Windows with its driver) and "چاپکردن بێ پرسیار"; receipts and cash register reports then print straight to it (Electron's `webContents.print` with `silent` and the printer's name, `apps/desktop/src/printing.ts`), and the print dialog opens only if that fails. The choice stays on the PC (`gym.receipt-printer` in local storage). Set the roll's paper size (80mm) in the Windows driver.
- **A member's membership** (`public.membership(members)`, a computed column PostgREST can select and filter: `select=…,membership&membership=eq.expired`): frozen, current, upcoming, expired (they had subscriptions, none runs) or none. Voided sales don't count. `membership_ends_on` is the last day of what runs. Both run as the caller, so RLS on subscriptions applies. The member list filters by it, and the list and the member's page show it as a badge when it isn't a current one.

### Check-in

Phase 4, step 4a, migration `20261027100000_check_in.sql`, tests `supabase/tests/370-check-in.test.sql`; the result's shape and codes are in `packages/core/src/checkin.ts`.

- **`check_in(p_id, p_branch_id, p_card_uid | p_member_id, p_device_id, p_override_note)`** decides and stores in one transaction, with the member's row locked so two scans at once never use one visit twice. By card needs `checkin.perform`, by hand `checkin.manual`, in one of the staff member's active branches. `p_id` is the visit's id from the app: the same id again returns the stored visit.
- **The answer:** `allowed`; `warning` (allowed, with `ENDS_SOON`, `FEW_VISITS`, `DEBT`, `BIRTHDAY`); `already` (scanned again within `checkin.cooldown_minutes` of the last visit, nothing counted); `denied` with a reason: `CARD_INVALID`, `CARD_BLOCKED` (`card_status` stolen or blocked), `MEMBER_NOT_ACTIVE`, `NO_SUBSCRIPTION`, the subscription reasons in the order they are checked (`app.checkin_steps()`: `PLAN_EXPIRED`, `NOT_STARTED`, `PLAN_FROZEN`, `NO_VISITS_LEFT`, `WRONG_BRANCH`, `WRONG_DAY`, `WRONG_TIME`, `DAILY_LIMIT`), or `DEBT`. It carries the member (name, number, `photo_updated_at` for the photo) and the subscription (visits left, frozen until), so the screen needs no second request.
- **Which subscription:** of those that may be used now, the one that ends first (visits-only and unlimited ones last); when none may, the reason is the one of the subscription that got furthest through the checks. Visits plans have one visit a day unless the plan sets a daily limit.
- **Visits** (`attendance`) are stored only when someone comes in; refused tries aren't. Visits used are counted from them (`app.subscription_used_visits()`, `used_visits` on subscriptions), so a visits plan with none left is expired and can't be transferred. `void_visit()` (`attendance.void`, a reason) gives a visit back; nothing is deleted. `check_out()` ends a visit; `inside` on a visit and `branch_occupancy()` count who is in (not checked out, within `checkin.visit_hours`).
- **Overrides** (`checkin.override`, a note): a refused member comes in anyway; the visit keeps what was passed over and uses no subscription, except for `DEBT`. A blocked card, an unknown card and a member who isn't active are never passed over.
- **Settings** (per gym, a branch may differ): `checkin.cooldown_minutes` (60), `checkin.visit_hours` (3), `checkin.deny_for_debt` (0: owing money is a warning; 1: refused above `checkin.debt_limit` dinars, 0).

### Check-in screens

Phase 4, step 4b: `apps/app/src/features/checkin/`, tests `apps/app/e2e/checkin.spec.ts`.

- **`/checkin`** (`checkin.perform`): reception holds a member's card to any reader and the result fills the screen (`checkin-result.tsx`): the status color with an icon and a word (green allowed, amber allowed with a note or already in, red refused), the member's photo, the name in large text, the reason or notes, and a ring counting down 5 seconds before it closes by itself (a tap closes it sooner). Each result has its own tone (`checkin-sound.ts`, Web Audio), a vibration on Android, and green or red twice on an ACR122U. Members are found by name, number or phone and checked in by hand with `checkin.manual`. Staff with `checkin.override` let a refused member in with a reason, from the result.
- **Only a newly placed card counts:** the screen takes cards with `useCardScans(…, readLying = false)`, so a card left lying on the reader is never read for it. A card read while the last one is still being checked is left alone (red on the reader).
- **The branch** is this device's when the staff member works there, else their first active branch (`checkin-branch.ts`).
- **The door screen** (`/checkin/door`, "شاشەی دەرگا"): dark and full screen, readable from two meters, for members holding their own card. It has nothing for staff (no search, no overrides). It stands unattended, so the idle lock waits while it is open (`usePauseIdleLock()`); **Exit locks the app**, so nobody walks from the door into the app without a PIN. Overlays render on `<body>` only while the app is unlocked (`screen-overlay.tsx`), so they never cover the lock screen.

### Visits and occupancy

Phase 4, step 4c: `apps/app/src/features/checkin/visits-page.tsx` and `visit-data.ts`, tests in `apps/app/e2e/checkin.spec.ts`.

- **`/checkin/visits`** (`attendance.view`): a day's visits in the working branch (today by default, any day of this year or last), newest first, with the photo, time, card or by hand, the subscription used, when they left, and any override note or void. A chip shows only who is inside. At most 500 visits a day are shown (the page says so).
- **Who is inside** (`branch_occupancy()`, the tile on `/checkin` and on the visits page) is read again every 30 seconds and after every check-in, check-out and void (TanStack Query, no Realtime).
- **A member's own page** (step 4d, `member-visits.tsx`) lists their last 10 visits in every branch, for staff with `attendance.view`: when, where (a branch the staff member can't see is left unnamed), card or by hand, the subscription, and any override or void.
- **Checking out** (`checkin.perform`) and **voiding** (`attendance.void`, a reason: the visit counts for nothing and goes back to its subscription) are buttons on each visit.

### Lockers

Phase 5 (spec §4.4 and the Phase 5 plan in §8), migration `20261028200000_lockers.sql`, tests `supabase/tests/390-lockers.test.sql`, `packages/core/src/lockers.test.ts` and `apps/app/e2e/lockers.spec.ts`; screens in `apps/app/src/features/lockers/`.

- **Tables:** `lockers` (branch, number like `12` or `A12`, zone men / women / mixed, kind daily / rented, out of order with a note, removed = soft delete) and `locker_assignments` (who holds a locker; released when, by whom and why). A unique index allows one open holder per locker and one open daily locker per member, so the second staff member gets `locker_taken` at once. Only the functions write them; `lockers.view` reads them in the staff member's branches.
- **The status is never stored:** `lockerStatus()` in `packages/core` makes it from the open holder and today (Baghdad): out of order, free, reserved (a rental that starts later), overdue (a rental past its last paid day, or a daily locker from an earlier day), occupied.
- **Functions:** `add_lockers()` (a numbered range, at most 300), `update_locker()`, `set_locker_out_of_order()` and `remove_locker()` (`lockers.manage`; the zone, kind, out of order and removal only while free); `give_locker()` (daily, an active member whose gender fits the zone, optionally with today's visit), `release_locker()`, `release_daily_lockers()` (the end-of-day list) (`lockers.assign`); `rent_locker()`, `renew_locker_rental()` and `lost_locker_key()` (also `payments.create`: one invoice, item kind `locker` or `penalty`, with an optional payment, in one transaction).
- **Released by other events:** checking a member out or voiding the visit releases the daily locker given with it; voiding a rent invoice releases its locker (triggers). There is no scheduled job (both editions), so daily lockers left from an earlier day show as overdue in the "not given back" list on `/lockers`, which releases them with one button.
- **Prices** are settings, per gym (the screen) or per branch: `lockers.rent_month_price` (dinars a month; 0 = renting is refused with `locker_price_not_set`) and `lockers.lost_key_fee` (0 = no fee). `settings.edit` sets them on `/lockers` → "نرخەکان".
- **Screens:** `/lockers` is the map by zone with filters by status (each status has an icon and a word, never color alone); a locker opens a dialog with what may be done to it and its last 20 holders. The check-in result offers the first free daily locker of the member's zone (`checkin-locker.tsx`), tied to the visit. A member's page lists the lockers they hold (`member-lockers.tsx`).
- **Not built:** linking a locker to an NFC card for smart locks.

### Messages and reminders

Phase 9 (spec §4.8 and the Phase 9 plan in §8), migration `20261029400000_notifications.sql`, tests `supabase/tests/500-notifications.test.sql`, `packages/core/src/messages.test.ts` and `apps/app/e2e/notifications.spec.ts`; screens in `apps/app/src/features/notifications/`.

- **Nothing is ever sent by the app or the server** (the user's decision of 2026-10-29): staff open WhatsApp's click to chat (`https://wa.me/<number>?text=<message>`, `whatsAppLink()` in `packages/core`) with the message filled in, and press Send in WhatsApp themselves. `openWhatsApp()` in `packages/platform` opens a new tab on the web; the Windows app's main process opens only `https://wa.me/` and `https://api.whatsapp.com/` links with `shell.openExternal` and refuses every other link (`isExternalWebLink()` in `apps/desktop/src/app-protocol.ts`); Android navigates to the link, which Capacitor hands to the WhatsApp app.
- **Templates:** nine fixed ones (membership ending in 7, 3, 1 days, ended, installment due, debt, spa booking, welcome, birthday). The defaults are in `packages/i18n/src/locales/<language>/notifications.json`; `message_templates` holds only what a gym changed (`save_message_template()`, `notifications.templates.manage`, Settings → "نامەکان"). Placeholders like `{name}` are the same in every language (`MESSAGE_PLACEHOLDERS`). A message is filled in the member's language with Latin digits.
- **The number:** the member's phone, or the emergency contact's when they have none (the screens say so); `record_message_opened()` checks it is one of the two.
- **The log:** every "open in WhatsApp" is a `member_messages` row (channel `whatsapp_link`, status `opened`, never `sent`), written after the link opens, because a browser blocks a new tab opened after waiting for the server.
- **Reminders:** `app.collect_reminders()` makes a day's `reminders` (rules in spec §8, Phase 9), one per kind, subject and day, with a copy of what the message needs in `details`. **Online:** pg_cron runs it every 15 minutes (job `collect-reminders`). **Offline:** the migration skips the job; `/notifications` collects its gym's reminders when it opens (`refresh_reminders()`, at most every 5 minutes), and the offline server must call `select app.collect_reminders()` on a timer (offline packaging phase). Gyms that are read-only or locked are skipped. Never the walk-in customer.
- **Screens:** `/notifications` (`notifications.send`, also the built-in Receptionist): a day's reminders with a WhatsApp button and a "done" mark (`set_reminder_done()`). A member's page has "ناردن بە واتسئاپ", which fills a template from `member_message_details()`. The bell in the top bar (`staff_notifications`, read marks in `staff_notification_reads`, `mark_notifications_read()`) shows "today's reminders are ready" (`notifications.send`) and low stock (`inventory.adjust`), read again every minute.
- **A paid provider later** (WhatsApp Business Cloud API, SMS) would implement `MessageProvider` (`packages/core/src/messages.ts`) and write `member_messages` with `queued` / `sent` / `failed`; none is built.

### Support access

MT-4 (spec §2.6), migration `20261028100000_support_access.sql`, tests `supabase/tests/380-support-access.test.sql`.

- **By default Click Group can't read a gym's members.** Business tables have no seller policies. A gym's staff with `support.grant` (the Owner and the built-in Admin role) let Click Group in for 1 hour to 7 days with a reason (`grant_support_access()`), and can end it at any time (`revoke_support_access()`), also while the gym is read-only. One grant runs at a time. Every staff member of the gym sees `support_grants`, so the app shows a notice while it runs. Online gyms only (`support_offline`).
- **The seller reads only through** `seller_support_members(gym, search)` (at most 50) and `seller_support_member(gym, member)` (details, subscriptions, invoices with what is owed, payments, cards, the last 20 visits; never health information or photos). Each call needs an aal2 platform admin and a running grant (`support_not_granted`), and writes a `support_reads` row in the same transaction. `seller_support_gyms()` lists the gyms that let Click Group in now; `seller_support_reads(gym)` lists the reads. Neither holds member data, so neither writes a read row.
- **In the gym app** (MT-4b, `apps/app/src/features/support/`): Settings → "کلیک گرووپ" (`/settings/support`, only for `support.grant`) lets Click Group in for one hour, one day, three or seven days with a reason, ends it, and lists what Click Group read and the earlier grants. While a grant runs, every staff member sees a notice at the top of every page (`support-banner.tsx`), read again every minute so it goes away by itself. The app doesn't know its edition yet; an offline gym's server refuses with `support_offline`, which the page explains.
- **In the seller panel** (MT-4c, `apps/seller/src/support/`): a gym's page has a "دەستپێگەیشتنی کلیک گرووپ" card saying whether the gym lets Click Group in, until when and why. While it does, "بینینی ئەندامان" opens `/seller/gyms/<id>/support`: a search that runs only when sent (every search is a recorded read), one member's page, and the list of reads. These screens never read again by themselves (no refetch on focus or timer, no retry), because every read is written down for the gym.
- **The gym sees every read:** staff with `support.grant` read `support_reads` (when, which platform admin, the member list with its search, or which member). Nobody changes or deletes those rows.

### Adding a table

1. Columns: `id uuid primary key` (generated by the app), `gym_id uuid not null default app.current_gym_id()`, `branch_id` if it belongs to a branch, `created_at`, `created_by`, `updated_at`, `updated_by`, and `deleted_at` (rows are soft-deleted). Money is `numeric(14,2)`, times are `timestamptz`.
2. Links to another gym table name `gym_id` too: `foreign key (branch_id, gym_id) references public.branches (id, gym_id)`, with an index on `(branch_id, gym_id)`. A table that others link to gets `unique (id, gym_id)`.
3. Triggers: `check_writable` (`app.check_gym_writable()`: nothing changes while the gym is read-only), `stamp` (`app.stamp_row()`), `read_only` for columns that never change (always including `gym_id`), and `audit` (`app.audit_row()`).
4. `enable row level security`, `revoke all ... from anon, authenticated`, grant only what is needed, then the policies. Every policy checks `gym_id = (select app.current_gym_id())`. Write the other checks as `(select app.has_permission('...'))` and `branch_id in (select app.accessible_branch_ids())`, so Postgres runs them once per query, not once per row.
5. pgTAP tests in `supabase/tests` for every policy and guard. `001-schema-rules.test.sql` fails when a table has no RLS, no policies, no audit trigger, an unindexed foreign key, any access for anonymous visitors, no `gym_id`, a policy without the gym check, a link without `gym_id`, or no `check_writable` / read-only `gym_id`. Add a case to `120-gym-isolation.test.sql` that tries to add a row to another gym; it fails while a table has none.

## Login, PIN and lock

Code: `apps/app/src/features/auth`, rules in `packages/core` (`gym.ts`, `staff.ts`, `pin.ts`, `settings.ts`, `permissions.ts`), PIN functions in `supabase/migrations/20261009100000_online_only.sql` and `20261010100100_gym_rules.sql`.

- **First login on a device:** the gym code (a web link like `https://…/?gym=demo` fills it in), username and password. Then a new password if a manager set it (`must_change_password`), and a 6-digit PIN if the staff member has none yet. **A device that isn't registered** is registered next, by a staff member with `devices.manage` (تۆمارکردنی ئامێر: a name and its branch); anyone else is refused with `device_not_registered` and asks a manager to log in there once. The registration is kept on the device (secure storage) and read again at every server check, so a device moved, deactivated or removed on the devices screen (or whose branch was deactivated) takes effect there and locks the app. The device reports its version at login and at every check (`device_heartbeat`).
- **The device remembers its gym** (secure storage). From then on, the login and lock screens show the gym's name and ask only for username and password. Everyone logged in on a device belongs to its gym, so "Use another gym" appears only while nobody is logged in. A wrong gym code, username or password gives the same message, so nobody learns which gyms or usernames exist.
- **A gym that isn't active:** the lock screen says when the gym is read-only or locked (from the last server check). In a locked gym, the PIN and the password both refuse with that reason, and the app locks at the next server check.
- **The PIN is checked by the server.** `set_my_pin()` hashes it (bcrypt) and works only within 15 minutes of a password login, so a session left on a device can't replace someone's PIN. `unlock_on_device()` checks it on this device, after checking the device (registered, active, in an active branch the staff member can access), and counts wrong tries for every device. After `security.pin_max_attempts` wrong PINs (default 5) the PIN is locked; only a password login after that moment unlocks it (`clear_my_pin_lockout()` compares the login time in the token). Nobody can read a PIN hash, not even its owner. Easy guesses (`111111`, `123456`, `121212`) are refused on the screen and again by the server.
- **What the device keeps per staff member**, encrypted: their Supabase session, name, role, permissions and whether they have a PIN (`packages/platform/src/secure-storage.ts`). Windows: DPAPI through Electron `safeStorage` (files in `%APPDATA%\gym-spa\secure`). Android: the Keystore. Browser: AES-GCM with a key the browser won't export, which is weaker: someone with the browser profile can still use the key.
- **The lock screen** ("who's working") lists the staff who logged in on this device. The app locks after `security.idle_lock_minutes` without activity (default 10), from the account menu ("Lock"), and on every reload or restart. Locking covers the app instead of closing it, so a half-filled form survives.
- **Server checks** (after each unlock, when the connection comes back, and every 5 minutes) refresh names, roles and permissions. A PIN removed by a manager (`reset_staff_pin`), a PIN lockout or a deactivated account takes effect there, or at once on the next PIN.
- **Permissions in the UI** (`usePermissions()`) come from the last server check. They only hide things: the server checks every request again.

## Staff accounts

Spec §2.5 (design B), step MT-2. Code: `packages/staff-admin`, the Edge Function `supabase/functions/staff-admin`, migration `20261010100400_staff_admin.sql`, and the app's calls in `apps/app/src/features/staff/staff-admin-api.ts`. The screens are below ([The staff and roles screens](#the-staff-and-roles-screens)).

Staff logins live in Supabase Auth, and only the secret key can create or change them. So five operations go through the staff module on the server: **create, reset password, deactivate, reactivate, rename**.

- **One module for both editions.** `packages/staff-admin` is plain TypeScript with a web-standard `Request → Response` handler. Online it runs as the Edge Function `staff-admin` (Deno); offline, the `gym-server` route will run the same handler. The app always calls `<backend>/functions/v1/staff-admin` with the acting staff member's own session.
- **The secret key stays on the server.** Supabase gives the Edge Function `SUPABASE_URL` and its keys itself (`SUPABASE_SECRET_KEYS`, ...): nothing to set by hand, nothing in the repo or the app.
- **The token is checked first** (`packages/staff-admin/src/token.ts`, with `jose`). Before the body is read and before any other call, the bearer token's signature is checked against the project's published keys (`/auth/v1/.well-known/jwks.json`, ES256 locally and in the cloud), along with its expiry. Its role must be `authenticated` (not the anon or service_role key, not an anonymous sign-in). Anything else gets `401 unauthorized`. If the keys can't be read, nothing goes ahead (`unexpected`). This is defense in depth: the gateway's own check is off (`verify_jwt = false`), and the database still makes the real permission checks under the same token. The offline edition's Auth must therefore sign with an asymmetric key too (`GOTRUE_JWT_KEYS`), so that it publishes a key set.
- **Each operation has three steps:**
  1. `staff_admin_prepare_create()` / `staff_admin_prepare_change()` check the request under the manager's own session, before anything changes. The manager needs `staff.manage`. They can never give a role above their own (`cannot_grant_role`) or a branch they can't access. They never reach another gym: the gym code in the login comes from their session, never from the request, and another gym's staff are `cannot_manage_staff`. They never manage themselves (`cannot_edit_own_account`). Only an Owner manages an Owner, so the last Owner can't be removed.
  2. The Auth admin API changes the login.
  3. The staff rows change under the manager's session again, so RLS, the guards and the audit log apply as for any other change. A new account's rows are written by one call, `create_staff_profile()`, all or nothing.
- **Auth and the database can't share a transaction,** so when step 3 fails, step 2 is undone: a new login is deleted, a reactivated login is banned again, a renamed login gets its old address back. Deactivating changes the account first, because that alone ends all data access at once. The ban then stops logins and token refreshes. If the ban fails, the account stays deactivated, and deactivating again finishes it. If an undo fails, the module logs `compensation_failed` (one JSON line on stderr, in the function's logs) and the request fails.
- **Logins left behind.** If deleting a half-made login ever fails, its username stays blocked, because Auth's emails are unique. The next create or rename to that username asks `public.staff_admin_orphan()` (secret key only). It returns the login only if it has a staff login address of an existing gym, the module made it for that gym (`app_metadata.gym_id`), it is not a platform admin, it has no staff account, and it is more than 2 minutes old. The module deletes exactly that login and tries once more.
- **Temporary passwords.** The manager never types a password. For a new account and for a reset, the server makes one: 14 characters, lowercase letters and digits, with no look-alikes such as 0/o or 1/l/i. It is returned once (`Cache-Control: no-store`), and the app shows it once with a copy button (`TemporaryPasswordDialog`). It is never stored or logged. `must_change_password` stays set, so the staff member chooses their own password at the first login. A reset also ends their sessions.
- **A read-only gym** can still deactivate staff and reset passwords, which only take access away. Creating, reactivating and renaming are refused (`gym_read_only`).
- **Renaming** keeps the password, the PIN and the sessions. The login's address changes first; the database refuses a username that doesn't match its login (`staff_login_mismatch`).
- **Errors** are stable keys with an HTTP status (`packages/staff-admin/src/errors.ts`), translated by the app (`staff:errors`).
- **Tests:** `pnpm test` runs the unit cases with fakes, including every undo path. `pnpm test:int` runs the module in Node against the real local Auth and database, including a real database failure after the login was made. `pnpm test:deno` runs the same unit cases in Deno, plus HTTP tests against the served function. `pnpm db:test` covers the database half (`170-staff-admin`).
- **Deno imports.** The packages the function imports (`packages/core`, `packages/db`, `packages/staff-admin`) name every relative import with `.ts`, because Deno resolves no other way; the lint rule `gym/explicit-ts-extensions` checks it. Their bare imports (`@gym/core`, `zod`, `@supabase/supabase-js`) are mapped in `supabase/functions/staff-admin/deno.json` with the same versions as the workspace: change both together.

### The staff and roles screens

Step 1e-2. Code: `apps/app/src/features/staff` and `apps/app/src/features/roles`; the database calls are in [Staff, roles, branches and devices](#staff-roles-branches-and-devices).

- **Staff** (`/staff`, needs `staff.view`): the staff the signed-in staff member may see, with search (look-alike letters match), active / deactivated / all, and their state (deactivated, PIN locked, temporary password), always as icon and text. With `staff.manage`:
  - **New staff member:** full name, username, phone, role and branches; the server makes the login and a temporary password, shown once.
  - **A staff member's page:** name, phone, role and branches, saved in one call; the account actions (new username, new temporary password, remove the PIN, deactivate, reactivate), each after a confirmation.
  - Only the roles the manager may give are offered, and "all branches" only to someone with all branches. Their own account and anyone with more access are shown without any of this, with the reason.
- **Roles** (`/roles`, needs `roles.manage`): every role of the gym with its permission and staff counts. A role's page has its names in Kurdish, English and Arabic and the **permission table** (خشتەی دەسەڵاتەکان), grouped by module, with a switch for a whole module and a search. Only permissions the manager has can be given. The Owner role (all permissions), the manager's own role and the built-in roles (the Owner's to edit) say why they can't change. A new role can start from another role's permissions; a custom role nobody has can be deleted.
- **Permission labels** are in `packages/i18n` (namespace `permissions`). `packages/core/src/permission-catalog.ts` lists the catalog with typed keys; one test keeps it the same as the migrations, another keeps the labels the same as the catalog.
- **Layout:** list and detail side by side from 1024px wide (tablets in landscape, desktops), one at a time below that, with a way back to the list. Forms save from the sticky action bar.
- **Without a connection** nothing can be saved (the buttons are off, with a note). **A read-only gym** can still deactivate staff and give a new password or remove a PIN; everything else is off.
- **Tests:** `apps/app/e2e/staff.spec.ts` and `roles.spec.ts` (they need `pnpm db:functions` for the staff module).

### The branches and devices screens

Step 1e-3. Code: `apps/app/src/features/branches`, `apps/app/src/features/devices`, and the device registration in `apps/app/src/features/auth`.

- **Branches** (`/branches`, needs `branches.manage`): every branch of the gym with its code. Adding one gives it the next code (`B2`, `B3`, ...); a branch's names, phone and address can change, and it can be deactivated (its devices stop working, nothing is deleted) or reactivated. The gym keeps at least one active branch. Adding and changing need access to all branches; without it the page only shows them. With a branch limit, the page shows "Active branches: 3 of 5".
- **Devices** (`/devices`, needs `devices.manage`): the devices of the manager's branches with their branch, kind (web, Android, Windows), last seen time, version and last user (`device_overview()`), and "this device". A device can be renamed, given a language for before login (staff's own language still wins), moved to another active branch (it gets the next code there), and deactivated or reactivated. A read-only gym can still deactivate.
- **Registration happens on the device itself,** at a password login by someone with `devices.manage` (see [Login, PIN and lock](#login-pin-and-lock)). **Every registered device counts toward the gym's `max_devices`, an Owner's or manager's personal phone or laptop too.** The registration screen and the devices page say how many are in use; deactivate a device that is no longer used to free its place.
- **"Use another gym"** gives the device a new id, because a device id belongs to one gym. Its registration in the old gym stays until a manager there deactivates it.
- **Tests:** `apps/app/e2e/devices.spec.ts` and `branches.spec.ts`. The other end-to-end tests register their browser's device the way a manager would (`autoRegisterDevices()` in `apps/app/e2e/support/app.ts`: it catches the password login and registers its `X-Device-Id` in the staff member's branch); the registration tests switch that off.

## Seller panel (Click Group)

Spec §2.6, step MT-3: the database (migrations `20261010100500_platform_admins.sql`, `20261010100600_seller_gyms.sql`, `20261010100700_auth_hook.sql`), the `seller-admin` function with the platform admin scripts, and the panel itself, `apps/seller`, at **`/seller/` of the gym app's domain** (for example `https://gym-spa-ten.vercel.app/seller/`).

### The panel (`apps/seller`)

- **Its own app and build:** React + Vite like the gym app, with the shared UI from `packages/ui`, its texts in the `seller` namespace of `packages/i18n` (Kurdish first, then English and Arabic; a separate entry, `@gym/i18n/seller`, so the gym app's bundle never contains them) and the requests and error keys of `@gym/seller-admin`. Web only: never in the APK, the EXE or the offline edition. It reads the gym app's env files (`envDir: ../app`): same backend.
- **Signing in:** email and password, then the 6-digit code from an authenticator app. On the first login: their own password (at least 12 characters), then two-step setup (QR code, or the key typed in), then 10 recovery codes shown once (copy or download). "I lost my device" takes a recovery code. Gym staff are refused right after the password (`seller_me()` says they are no platform admin).
- **Pages:** gyms (search that matches look-alike letters, state chips, counts), a gym (state with its reason, subscription date, usage, limits, the staff login link `…/?gym=<code>`, suspend, lock with a reason, reactivate, its log), a new gym (the permanent-code warning, then a confirmation with the code in large type, then the login link and the Owner's temporary password once), platform admins (add; deactivate, reactivate, remove a two-step device, new temporary password; never one's own; a warning while fewer than two are active), my account (new recovery codes, password) and the seller log.
- **The session** lives in `sessionStorage` under `gym-seller-auth`: closing the tab or browser signs out, and it never meets the gym app's storage on the same origin. 30 minutes without a key press or click signs out too. Preferences (language, light/dark) are `seller.preferences`.
- **Commands:** `pnpm --filter @gym/seller dev` (http://localhost:5174/seller/, against the backend in `apps/app/.env*`), `pnpm --filter @gym/seller test:e2e` (needs `pnpm db:start` and `pnpm db:functions`).

### Deployed with the gym app at `/seller/`

One Vercel project serves both (decided 2026-10-11): no separate domain, no DNS.

- **Build:** `apps/app/vercel.json` runs `pnpm build:web` (`apps/app/scripts/build-web.mjs`): the gym app's build, the panel's build (Vite `base: '/seller/'`), then a copy of `apps/seller/dist` into `apps/app/dist/seller/`.
- **Routing:** `/seller/*` is rewritten to the panel's `index.html` (before the gym app's catch-all), `/seller` redirects to `/seller/`.
- **Headers for `/seller/*`:** its own Content-Security-Policy header (`frame-ancestors 'none'`, plus the panel's stricter `<meta>` policy: no service worker, no manifest, no server images), `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin` (a gym-app window can't hold a reference to a panel window), and `Cache-Control: no-store` for its pages. `apps/app/test/vercel.test.ts` checks the file.
- **The gym app's service worker leaves it alone:** `/seller/` is in its `navigateFallbackDenylist` and `globIgnores`, so nothing of the panel is precached or answered, and the panel is never available offline. A service worker registered for `/` still technically controls every page of its origin; only a separate domain removes that. `apps/seller/e2e/deployment.spec.ts` proves the rest (no response from the worker, nothing cached, offline refused).
- **Bundles:** `apps/app/e2e/bundle.spec.ts` checks that the gym app contains no panel code or texts; the panel's deployment test checks that its build holds no secret.

### Moving the panel to its own domain later (e.g. `seller.clickgroup.site`)

A separate domain isolates the panel completely from the gym app (its own origin: storage, service worker, cookies). When Click Group wants it:

1. **A second Vercel project** for the same repository, *Root Directory* `apps/seller`, framework Vite, install `pnpm install --frozen-lockfile`, build `pnpm build`, output `dist`. Add the same two variables as the gym app's project (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`).
2. **In the panel:** `base: '/'` instead of `/seller/` in `apps/seller/vite.config.ts`, the router's `basepath: '/'` (`src/router.tsx`), and an `apps/seller/vercel.json` with the SPA rewrite and the headers now under `/seller/*` in `apps/app/vercel.json` (with `frame-ancestors 'none'`). The staff login link it shows (`gymLoginLink`) must then point at the gym app's domain instead of `window.location.origin`.
3. **Domain:** in the new project → Settings → Domains → add `seller.clickgroup.site`. Vercel shows the record to add.
4. **DNS at Namecheap:** Domain List → `clickgroup.site` → Manage → Advanced DNS → Add New Record: type **CNAME Record**, Host **`seller`**, Value: the target Vercel shows (`cname.vercel-dns.com`, or a project-specific `…vercel-dns-0xx.com`), TTL Automatic. Save. If Vercel asks to verify the domain (it is used by another Vercel account), also add the **TXT Record** it shows (Host `_vercel`). If `clickgroup.site` has CAA records, add `CAA 0 issue "letsencrypt.org"`. Vercel issues the certificate by itself once the record resolves (minutes to an hour).
5. **Clean-up in the gym app's project:** remove the `/seller` rewrite, redirect and headers from `apps/app/vercel.json`, the copy step from `build:web` (go back to `pnpm build`), and the service worker's `/seller/` exclusions; or keep a redirect from `/seller/` to the new domain for a while.
6. Supabase needs nothing: the panel talks to it with a bearer token, and the functions answer any origin.

### Platform admins

- Click Group's accounts are **platform admins**: Supabase Auth users with a real email address and a row in `platform.admins`. They have nothing to do with a gym's roles. A trigger on each side keeps one login from ever being both a staff member and a platform admin (`staff_cannot_be_platform_admin`, `platform_admin_cannot_be_staff`), and a platform admin's address is never a staff login address.
- **Everything is in the private schema `platform`** (`admins`, `recovery_codes`, `audit_logs`). The API never exposes it, and no client role (not even the secret key) has any privilege on it. The panel uses only the `public.seller_*` functions.
- **Every seller function checks the caller first** (`app.require_platform_admin()`): an active platform admin (`not_platform_admin`), a session that passed two-step login, `aal2` (`mfa_required`), and a password they chose themself (`password_change_required`). Only `seller_me()` and `seller_use_recovery_code()` work before the second step, for the login flow.
- **Two-step login (TOTP) is required.** It is Supabase Auth's own MFA (`[auth.mfa.totp]` in `config.toml`; on by default in cloud projects).
- **Recovery codes:** `seller_new_recovery_codes()` makes 10 one-time codes (`xxxx-xxxx-xxxx-xxxx`, about 80 random bits each), shown once and stored only as SHA-256. A new set replaces the old one. `seller_use_recovery_code()` accepts one after the password alone (the device is lost); 5 wrong codes in 15 minutes block further tries for 15 minutes. Every try is logged.
- **At least one active platform admin, always:** nobody deactivates or resets themself through the panel, and the last active one can't be deactivated even by server code (`last_platform_admin`). The panel will warn while there is only one.
- Deactivating a platform admin ends their access to every seller function at once.
- **The first platform admin** comes from a script, run on Click Group's own PC: `pnpm bootstrap:platform-admin --email <address> --full-name "<name>"` (`--remote` for the cloud project in `supabase/.env.local`). It prints a temporary password once and stores it nowhere. At the first login in the panel the admin chooses their own password, sets up two-step login with an authenticator app and keeps their recovery codes. Add the second platform admin from the panel. Running it for an address that is already a platform admin changes nothing.

### The seller-admin function

What needs Supabase Auth's admin API goes through the Edge Function `seller-admin` (`packages/seller-admin`, built on the staff module). Everything else the panel does (subscription dates, suspend, lock, usage, the log, new recovery codes) is a `seller_*` database function it calls directly. Online only: the offline edition has no seller panel.

- **Actions:** `issue_license` and `issue_activation` (signed codes for offline gyms, see [Licenses](#licenses)), `create_gym` (the gym with its first Owner, whose temporary password is returned once), `add_admin` (a temporary password once), `deactivate_admin` and `reactivate_admin` (the account, and a ban on the login), `reset_admin_two_step` (removes another admin's lost device and voids their recovery codes), `reset_admin_password` (a temporary password once), and `use_recovery_code` (for the signed-in admin).
- **Checks before anything changes:** the bearer token against the project's published keys (like `staff-admin`, `verify_jwt = false`), then the request (Zod), then **two-step login: the token must be `aal2`** (`mfa_required`), except for `use_recovery_code`, which works after the password alone. Every action then starts with a `seller_*` database call under the same token, which checks for an active platform admin with two-step login again. Nobody changes their own account here (`cannot_change_own_admin`).
- **Undo, like the staff module:** a login whose rows can't be written is deleted again (`writeRowsOrUndo` and `withAddressFreed` in `packages/staff-admin/src/accounts.ts`, shared by both modules). A login left behind when the undo fails too is freed by the next attempt, but only when the database says so (`staff_admin_orphan()` for a gym's Owner, `platform_admin_orphan()` for a platform admin). When a change in Auth worked but its record didn't, the answer is `record_failed`, and doing it again finishes it.
- **Using a recovery code** uses it up and logs it in the database first, then removes the signed-in admin's two-step device; the panel then sets up a new one. If Auth fails after that, the code stays used (logged) and they use another.
- Errors are stable keys with an HTTP status (`packages/seller-admin/src/errors.ts`). Logs (one JSON line on stderr, source `seller-admin`) never hold a password or a recovery code.
- Deploy: `pnpm --filter @gym/supabase exec supabase functions deploy seller-admin --use-api --workdir ..`.

### Recovery procedure

When a platform admin loses their two-step device (or their password), in this order:

1. **Another platform admin resets it** in the panel (reset two-step login; reset the password if needed). At their next login, the admin sets up a new authenticator app. This is why Click Group keeps at least two platform admins.
2. **Otherwise the admin uses a recovery code:** log in with the password, choose "use a recovery code", and type one of the codes saved at setup. The lost device is removed and the panel goes straight to setting up a new one. Then make a new set of codes.
3. **As a last resort,** on Click Group's PC with the project's secret key (`supabase/.env.local`): `pnpm platform-admin:reset-2fa --email <address> --remote`. It removes the admin's two-step devices and voids their recovery codes; add `--password` for a new temporary password too (printed once). It asks to type the address again (`--yes` skips that). Both are recorded in the seller log with no actor.

A lost or stolen laptop with an open panel session: another admin **deactivates** that platform admin at once (all seller access ends, and Auth refuses their logins and refreshes), then resets their password and two-step login, then reactivates them.

### Gyms in the seller panel

- **Creating a gym never leaves it without its Owner:** `seller_prepare_create_gym()` checks the code (format, reserved list, never used) and the Owner's username; the `seller-admin` function makes the Owner's login; then `seller_create_gym()` makes the gym, its roles, branch B1, the Owner (every branch, must choose a password) and the log entry in one transaction. If that fails, the login is deleted again.
- `seller_set_paid_until()` (empty: no end), `seller_suspend_gym()` (reason optional), `seller_lock_gym()` (reason required), `seller_reactivate_gym()` (ends both), `seller_set_limits()`, `seller_rename_gym()` (never the code). Offline gyms follow their license instead (`offline_gym`).
- `seller_gyms()` returns each gym's record, its access state with the reason for a lock or suspension, and usage counts and dates (active branches, staff and devices, last login, last device seen). Never names, members or other business data: a platform admin's own session reads no row of any gym table.
- **Member counts** (step 2h, migration `20261022100000_seller_member_counts.sql`, tests `280-seller-member-counts.test.sql`): `seller_member_counts()` returns each gym's number of members (archived ones left out) and of active members. Numbers only, never a name; the panel shows them with the other usage counts. A separate function, so older panels keep working (expand first).
- The **seller log** (`platform.audit_logs`, read with `seller_audit_log()`) records every seller action: who, when, which gym or admin, what changed, and the reason. Nobody can change or delete it. Changes made by a script have no actor.
- Seller writes to a gym's tables run under the platform admin's own session, so the gym's own audit log names them too.

### Licenses

Offline gyms run on their own server PC and follow a signed license instead of a subscription (spec §2.6, step MT-5). The seller panel issues the codes; activation and enforcement on the offline server come with the offline packaging phase.

- **Codes:** a license is `GSL1.<payload>.<signature>` and a server PC's activation `GSA1.<payload>.<signature>`: base64url JSON signed with Ed25519 (`packages/core/src/license.ts`, WebCrypto, the same code in Deno, Node and Electron). A license names the gym (id, code, Kurdish name), yearly or perpetual, max branches and devices, and its dates; an activation binds the gym to one PC's machine code, so a renewal needs only a new license code. About 350 characters: they are pasted or saved as a `.txt` file, never typed. A machine code is `XXXX-XXXX-XXXX-XXXX-XXXX` with 4 check characters, so a typo read over the phone is caught before anything is signed.
- **In the panel:** new gym → edition **ئۆفلاین** makes the gym's record (code and names only). Its page issues licenses (yearly up to 2 years ahead, perpetual "updates until" up to 5), activates one server PC at a time, and records revoking and deactivating with a reason (records only: an offline PC can't be reached). Every one of them is in the seller log.
- **Database:** `platform.licenses`, `platform.activations`, `platform.license_events` (migration `20261029900000_licenses.sql`, tests `550-licenses.test.sql`). `seller_prepare_license()` / `seller_prepare_activation()` check everything under the platform admin's session before the key is used; `seller_issue_*()` check it again and store a code only when its payload equals the stored fields.
- **Signing** happens only in the `seller-admin` function (`issue_license`, `issue_activation`), with the private key in its secret **`LICENSE_SIGNING_KEY`** (a JWK with its `kid`). It refuses a revoked kid, and a key whose public half isn't in `LICENSE_PUBLIC_KEYS`, and checks every code it signs. Without the secret, issuing answers `license_key_missing` and everything else works.
- **Public keys** live in `packages/core/src/license-keys.ts` (`LICENSE_PUBLIC_KEYS`, by kid; `REVOKED_LICENSE_KIDS`). Only public keys ever go there.
- **Locally,** `pnpm db:functions` puts a throwaway `test-…` key into `supabase/functions/.env` (git-ignored) when there is none. A `test-` kid is never in `LICENSE_PUBLIC_KEYS` (a test checks), so nothing it signs works on a real server; the panel marks such licenses. Never put a real key in that file: the script refuses to run if one is there.

#### The real key

Made once, by Click Group, on Click Group's own PC, in a terminal (not in CI, not through Claude):

```
pnpm license:new-key --kid 2026-1 [--backup-dir <folder>]
```

It asks for a Supabase personal access token (hidden; or `SUPABASE_ACCESS_TOKEN`), shows the linked project (`supabase/.temp/project-ref`, or `--project-ref`) and asks to type `yes`. Then it asks for a backup password twice (hidden, at least 12 characters; four or more random words), makes the key pair **in memory**, and:

1. writes **one** encrypted backup file, `gym-spa-license-key-<kid>.gskey` (scrypt + AES-256-GCM), to the Desktop or `--backup-dir` (never inside the repository), and opens it again to check it;
2. writes the **public** key into `packages/core/src/license-keys.ts`;
3. sends the private key to the project's secret `LICENSE_SIGNING_KEY` through Supabase's Management API, straight from memory over HTTPS (`supabase secrets set` takes secrets only as command-line arguments or from a file on disk), then checks Supabase lists it with a matching digest;
4. prints the backup file's path and the public key, and nothing else of the key.

Then: move the backup file to the USB stick and delete it from the PC (and the Recycle Bin); keep the password in Click Group's password manager, never with the stick; commit `license-keys.ts` and release. Until the release, the function refuses to sign with the new key (its public half isn't shipped yet). After the release, issue one test license to a test offline gym and check it.

`pnpm license:restore-key --file <backup> [--replace]` puts a backup's key back into the secret (a new Supabase project, or the secret removed by mistake). Its public key must already be in `license-keys.ts`.

#### If the key is lost or leaked

- **The secret is gone, the backup isn't** (a new project, a deleted secret): `pnpm license:restore-key --file <backup>`. Nothing else changes.
- **Lost** (the secret and the backup are both gone, or the backup's password is forgotten): make a new key with a new kid, `pnpm license:new-key --kid <new> --replace`, and release. Keep the old kid's public key in `LICENSE_PUBLIC_KEYS`: licenses and activations it signed keep working. New licenses and renewals are signed with the new key.
- **Leaked** (the private key may be known to someone else):
  1. At once: `pnpm license:new-key --kid <new> --replace`, which takes the old key out of the secret, and release `license-keys.ts` right away (a release with only that change). Until then issuing pauses: the function refuses a key whose public half isn't shipped.
  2. Issue every offline gym's license and activation again with the new key (the panel: issue a license; deactivate and activate its PC again), and give them the new codes.
  3. In the next release, move the old kid from `LICENSE_PUBLIC_KEYS` to `REVOKED_LICENSE_KIDS`: servers that install it refuse every code the old key signed. A server that never installs that release still accepts the old key; that is a limit we accept.
  4. Record what happened and when in the seller log's reasons (revoke the old licenses with the reason "key leaked").

### The Auth hook

Supabase Auth calls `auth_hooks.custom_access_token` (its "Customize Access Token" hook) before every token it issues: at a password login, at every token refresh, and after the second login step. It refuses the token to a staff member of a **locked** gym (HTTP 403, message `gym_locked`, which the app shows as the "gym locked" text). Everything else gets the token unchanged: staff of active, grace, read-only and suspended gyms, other gyms' staff, platform admins, users without a staff account, and any odd input. It never raises an error: anything unexpected lets the login through, and the database still keeps a locked gym's data closed. Reactivating the gym lets the same sessions refresh again. Only Supabase Auth's role can call it.

- **Locally** it is turned on in `supabase/config.toml` (`[auth.hook.custom_access_token]`). Changing that file needs `pnpm db:stop` and `pnpm db:start`.
- **In the cloud project** it must be added by hand in the dashboard, and checked: see step 4 of [A cloud project](#a-cloud-project). Never use `supabase config push` for it: that would also push the local auth settings. Pushing the migration only creates the function; nothing calls it until the hook is added.
- **Tests:** `supabase/tests/210-auth-hook.test.sql` (who is refused, malformed input), and `pnpm test:int` with the real local Auth server: a locked gym's Owner gets `403 gym_locked` at login and at a token refresh, an older token sees nothing, and after reactivating the same refresh token works again.

#### Emergency: nobody can log in

The hook runs for every login of every gym and of Click Group. If logins fail everywhere after a change (the login screen says something went wrong, and Supabase's Auth logs mention the hook):

1. Supabase dashboard → the project → **Authentication → Auth Hooks** → "Customize Access Token (JWT) Claims" → ⋮ → turn it **off** (or delete it) and save. Logins work again at once.
2. Locked gyms stay safe meanwhile: their staff can log in, but the database still shows them nothing and refuses every change (`app.current_gym_id()`).
3. Find the cause in **Logs → Auth** (the hook's error) and reproduce it locally with `pnpm db:test`. Fix it with a new migration, push it, then turn the hook on again and check that a login works.
4. Locally: set `enabled = false` under `[auth.hook.custom_access_token]` in `supabase/config.toml`, then `pnpm db:stop` and `pnpm db:start`.

### Tests

- **Database:** `supabase/tests/180-platform-admins.test.sql` (accounts, both-ways rule, recovery codes, scripts' functions, the log), `190-seller-gyms.test.sql` (creating a gym with its Owner all or nothing, subscription end, suspend, lock, reactivate, limits, usage), `200-platform-isolation.test.sql` (built from the catalog: every seller function refuses gym staff, even an Owner with two-step login, and refuses platform admins before the second step; platform admins see and change no row of any gym table) and `210-auth-hook.test.sql`.
- **The module:** `pnpm test` runs its unit cases with fakes (every undo path, the `aal2` gate); `pnpm test:deno` runs the same cases in Deno plus HTTP tests against the served function; `pnpm test:int` runs it in Node against the real local Auth (with TOTP and the hook) and database: a gym and its Owner, the undo after a real database refusal, a left-behind login freed, suspend and lock, new admins, deactivate, both resets, recovery codes. The tests set up real two-step login with a small TOTP helper (`packages/seller-admin/test/platform.ts`) and remove their platform admins with SQL in the local database (no API may delete one).

## Connection

The app always needs its server. `apps/app/src/lib/connection.ts` checks `GET /auth/v1/health` every 30 seconds (every 10 while disconnected) and whenever the network changes. The top bar shows Connected / No connection / Server not responding, with the time of the last check and a "Check again" button. While the server can't be reached, TanStack Query pauses its requests and runs them again when it is back; the PIN and the password login say that the server is needed.

## NFC cards and readers

Decided with the user on 2026-10-19 (spec §1). Card reading is built in Phase 2, steps 2e (keyboard-type readers, done), 2f (PC/SC readers in the Windows app, done) and 2g (Android phones and tablets, postponed until it can be tested on a real NFC Android device); this section grows with them. **Until 2g, card reading at the desk uses the Windows app with an ACR122U, or a keyboard-type reader (Windows app or browser).** Phones and tablets can't read cards yet. Every reader is an `NfcReader` in `packages/platform/src/nfc.ts`; the screens get normalized UIDs through `useCardScans()` (`apps/app/src/features/cards/card-reader.ts`) and never know which reader read a card.

- **Cards:** a card is known by its UID, stored as uppercase hex with no separators. 7-byte UIDs (NTAG cards) and 4-byte UIDs both work. For a real gym, buy **genuine NXP NTAG213 or NTAG215** cards: NFC Tools (Android or iPhone) shows their NXP signature as "Valid". Cheaper compatible clones read the same, but their UID may be changeable, so such a card can be copied. The app never relies on the NXP signature. The check-in screen (Phase 4) shows the member's photo on every scan, so staff can spot a copied card.
- **Readers at the desk:**
  - **PC/SC readers** such as the ACR122U (they don't type anything): only in the **Windows app**, which reads them directly.
  - **Keyboard-type readers** (they type the UID and Enter): in the Windows app, in the browser, and on Android with a USB reader. Step 2e, `packages/platform/src/keyboard-card-reader.ts`.
  - **The web app in a browser can't use PC/SC readers.** It says so, and points to the Windows app, a keyboard-type reader, or an NFC phone.
  - **What readers type differs.** Some keyboard-type readers type the UID's bytes in reverse order, or a 4-byte UID as a 10-digit number; the app reads both as the same card ([NFC cards](#nfc-cards)). A reader that types 10 digits gives only 4 bytes of a 7-byte card, though, so use the same kind of reader for giving cards and for check-in.
- **How a keyboard-type reader is told from typing:** a burst of at least 8 hex keys less than 50 ms apart, ended by Enter, is a card. People never type that fast, so their typing is left alone. The keys are read by their place on the keyboard (`KeyboardEvent.code`), so a Kurdish or Arabic keyboard layout doesn't matter. The app listens only while a screen waits for a card (a card dialog, the reader test), and the newest such screen gets the card. Keys typed in other text fields (a search box) are never a card; the card number fields are marked `data-card-input`, so a reader typing into them still counts as a scan. The Enter that ends a card is kept from the page, so it presses no button.
- **PC/SC readers in the Windows app** (step 2f): the main process reads them with [`smartcard`](https://github.com/tomkp/smartcard) 3.7.2 (MIT, Node-API, so it keeps working across Electron upgrades) and our own watcher, `apps/desktop/src/pcsc-watcher.ts`. It reads a card with Get UID (`FF CA 00 00 00`).
  - **The page gets only UIDs and reader names** (`gymDesktop.listenForCards`, `gymDesktop.watchCardReaders`). It sends back only whether it listens, "read a card already lying on a reader" when a card screen opens (`gymDesktop.readLyingCards`), and "ok" or "error" for a reader (`gymDesktop.signalCard`). The main process checks every argument (`apps/desktop/src/card-readers.ts`).
  - **When a card counts** (decided 2026-10-22, spec §1):
    - A card placed on the reader while a screen waits for one (a card dialog, the reader test) is read once. Holding it there sends nothing more.
    - A card already on the reader after the app starts, the PC wakes, the reader is plugged in again or Windows' smart card service recovers is **not** a new scan; staff lift it and place it again. A reader just plugged in reports itself empty at first and finds a card lying on it about half a second later (seen with the ACR122U), so a card it finds within 2 seconds of appearing counts as already lying there.
    - Opening a card dialog or the reader test reads a card already on the reader once, because staff opened it for that card.
    - On any other screen (step 2h), a newly placed card opens its member, the same as with a keyboard-type reader. A card left lying on the reader never does, not even after unlocking.
    - Phase 4 check-in counts only a newly placed card.
  - **Light and beep** (ACR122U only): green with one beep when the app accepts the card, red twice with two beeps when it refuses it (not a card number, someone else's card, a blocked card). The reader's own beep when a card arrives stays. The signal goes through the card while it is on the reader, and straight to the reader otherwise; the second way needs ACS's driver. If the reader refuses either, nothing else is affected.
  - **What it survives:**
    - The reader unplugged and plugged in again. Windows stops its smart card service when the last reader goes; the watcher connects again by itself.
    - Two readers: each is watched and read on its own.
    - Sleep: on waking, the reader finds a card lying on it again, before Windows tells the app the PC woke. So from Windows' sleep notice until the new connection after waking, no card counts as new.
    - A card pulled away mid-read: the read is dropped and logged.
    - Problems are logged as `[card readers] …` in the main process's console, which is visible when the app is run from source.
  - **Setting up an ACR122U:** install ACS's **Unified PC/SC Driver** (acs.com.hk → ACR122U → Downloads), plug the reader in (straight into the PC rather than through a hub), and open Settings → خوێنەری کارت. Under «خوێنەرە بەستراوەکان» it shows the reader as connected; then test it with a card.
  - **"Device driver software was not successfully installed" for a card:** Windows looks for a smart card driver for each NFC card placed on the reader. The message is harmless. To turn it off, set the policy *Computer Configuration → Administrative Templates → Windows Components → Smart Card → Turn on Smart Card Plug and Play service* to Disabled (registry: `HKLM\SOFTWARE\Policies\Microsoft\Windows\ScPnP`, DWORD `EnableScPnP` = 0).
  - **Tests:** `apps/desktop/src/pcsc-watcher.test.ts` runs the watcher against a fake PC/SC service (`pcsc-fake.ts`). The desktop e2e tests start the app with that fake (`GYM_FAKE_PCSC=1`, only when run from source, never in the installed app), so a reader plugged into the test PC doesn't get in the way.
- **A card on any other screen opens its member** (step 2h, `apps/app/src/features/cards/use-open-member-on-scan.ts`), for staff with `members.view`.
  - Screens that wait for a card (a card dialog, the reader test) get it first: `CardScanDispatcher` in `card-reader.ts` gives every card to the newest such screen, and only the rest to the "open its member" handler.
  - Someone else's card shows whose it is; a blocked card or nobody's card says so, with the error signal on an ACR122U. Anything that isn't a card number (a barcode, say) is ignored.
  - **Unsaved work is never thrown away:** forms report unsaved changes (`useUnsavedChanges()` in `apps/app/src/lib/unsaved-changes.ts`). While a form has any, a card shows whose it is with an "open" button, instead of leaving the page.
  - A keyboard-type reader typing into the search box (Ctrl+K) is a scan too. In any other text field it is typing, as before.
  - While the app is locked, nothing gets cards.
- **Setting up a reader** (Settings → خوێنەری کارت, this device only): plug it in, open the page and hold a card that someone already has to the reader. The page shows the number it read and whose card it is. If a card's number differs from the one another reader (or NFC Tools) shows, with the bytes the other way round, choose «پێچەوانە» (reversed). Only staff with `devices.manage` change that, because a wrong byte order would give members cards under the wrong UID. It applies to keyboard-type readers only.
- **Phones and tablets** (step 2g, postponed): the Android app will read cards with the device's own NFC, and Chrome on Android with Web NFC. It needs a real NFC Android device to test, and must be done before the first gym uses phones for cards. Later, the iOS app will use Core NFC.

## A cloud project

The production setup of the online edition: Supabase and the web app on Vercel. Put Supabase close to Iraq (ours is in Frankfurt, `eu-central-1`).

Settings live in three places. Never mix them:

| Where | What | Used by |
|---|---|---|
| `supabase/.env.local` (git ignores it) | `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_URL` | Scripts on your PC: `db push`, `bootstrap:admin --remote`, `staff-logins:move --remote`. Secret: never in Vercel or the app |
| `apps/app/.env.local` (git ignores it) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (both public) | Local builds: `pnpm build`, `pnpm android:apk`, `pnpm desktop:exe` |
| Vercel → Settings → Environment Variables | The same two `VITE_*` values, and `ENABLE_EXPERIMENTAL_COREPACK` | The web build |

1. **Supabase project.** Create one on supabase.com. In **Authentication → Sign In / Providers**: turn off "Allow new users to sign up", set the minimum password length to 8, and keep the **Email** provider on. Staff log in through it with their username, so turning it off breaks every login. (`config.toml` sets the same, but only for the local setup.)
2. **Server settings.** Copy `supabase/.env.example` to `supabase/.env.local` and fill it in:
   - `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (`sb_secret_…`): Project Settings → API Keys. The secret key bypasses every security rule; keep it in this file only.
   - `SUPABASE_DB_URL`: the **Session pooler** URI from **Connect** (port 5432), with the database password in it. Encode special characters in the password: `@` → `%40`, `:` → `%3A`, `/` → `%2F`, `#` → `%23`, `?` → `%3F`, `%` → `%25`. Don't use the transaction pooler (port 6543), which can't run migrations, or the direct `db.<project-ref>.supabase.co` host, which needs IPv6.
3. **Push the migrations.** The dry run only lists what it would apply; check the list, then push. In PowerShell, from the repository root:
   ```powershell
   $db = ((Get-Content supabase/.env.local | Where-Object { $_ -match '^SUPABASE_DB_URL=' }) -replace '^SUPABASE_DB_URL=', '').Trim('"')
   pnpm --filter @gym/supabase exec supabase db push --db-url "$db" --dry-run --workdir ..
   pnpm --filter @gym/supabase exec supabase db push --db-url "$db" --workdir ..
   ```
4. **The Auth hook** (needs the migrations of step 3; it is what makes Lock refuse a locked gym's staff at login, see [The Auth hook](#the-auth-hook)). It is never set up by a migration or by `supabase config push`: add it by hand.
   1. Dashboard → **Authentication → Auth Hooks** → **Add hook** → "Customize Access Token (JWT) Claims hook".
   2. Hook type **Postgres**, schema `auth_hooks`, function `custom_access_token`. Create it. The card must say **ENABLED**.
   3. Check that Auth really calls it. In the SQL Editor:
      ```sql
      select coalesce(sum(s.calls), 0) as hook_calls
        from pg_stat_statements s join pg_roles r on r.oid = s.userid
       where r.rolname = 'supabase_auth_admin' and s.query ilike '%custom_access_token%';
      ```
      Log in once (the gym app or the seller panel), then run it again: the number must go up with every login and every token refresh. If it stays the same after logins, the hook isn't running. (These statistics start again from 0 when they are reset.)

   In our project the hook was missing from MT-3 (2026-10-11) until 2026-10-19: Lock closed a locked gym's data, but its staff could still log in. It was added and checked on 2026-10-19.
5. **First gym and its Owner:** `pnpm bootstrap:admin --gym <code> --remote`. Its first line shows which Supabase project it is talking to; check it. For a gym that doesn't exist yet it asks you to confirm, then for the gym's Kurdish name and its first branch's name (`B1`; press Enter to keep the default name). The gym code can never change later. Type the password yourself; it never goes into a file.
6. **App settings.** Copy `apps/app/.env.example` to `apps/app/.env.local` and fill in:
   - `VITE_SUPABASE_URL`: `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: the **publishable** key (`sb_publishable_…`), never the secret key
7. **Vercel.**
   1. Add New → Project → import `miraann/gym-spa`. The repository is private: if it isn't listed, give Vercel's GitHub app access to it.
   2. **Root Directory** = `apps/app`. Leave "Include files outside the root directory" on, because the app uses the workspace packages. Leave the build settings alone: `apps/app/vercel.json` sets them.
   3. **Environment Variables**, for Production and Preview: the two `VITE_*` values (you can import `apps/app/.env.local`, but **never** `supabase/.env.local`), and `ENABLE_EXPERIMENTAL_COREPACK` = `1`, so Vercel uses the pnpm version pinned in `package.json`.
   4. **Settings → Build and Deployment → Node.js Version: 24.x.** The repository requires Node 24.
   5. Deploy. A build only picks up changed variables when it runs again: after changing one, use Deployments → ⋯ → Redeploy.
8. **Check it works.** Open the site and log in as the admin. The connection indicator should say Connected. In DevTools → Network, switch to Offline: the indicator says No connection. If the login screen says the app isn't connected to a server, the build had no `VITE_*` values (the page's Content-Security-Policy then allows `connect-src 'self'` only). A tab that was already open may keep the old version until you accept the update prompt or reopen it.

**Later changes:**

#### Moving a cloud project to many gyms (MT-1)

For a project set up before MT-1 (ours). Do the steps in this order, one right after the other:

1. Push the migrations `20261010100000_gyms.sql` and `20261010100100_gym_rules.sql` (dry run first). The existing data becomes the gym `demo`, and Super Admin becomes Owner. Until step 3 the deployed app still logs in, but shows the Owner without permissions (it looks for the old role key).
2. `pnpm staff-logins:move --remote` lists the logins it would move; `pnpm staff-logins:move --remote --apply` moves them. From here the old app's password login stops working; PIN unlock keeps working.
3. Push the code: Vercel deploys it. Rebuild the APK and EXE. Devices where staff are logged in keep their sessions and learn their gym at the next server check; a new login on a device asks for the gym code `demo` once.

Other changes:

- **New migrations:** the same `db push`, dry run first. Push them before the app that needs them.
- **The staff-admin Edge Function** (once, then after every change to it or to a package it imports). Push migration `20261010100400_staff_admin.sql` first, then deploy:
  ```powershell
  pnpm --filter @gym/supabase exec supabase functions deploy staff-admin --use-api --project-ref <project-ref> --workdir ..
  ```
  `--use-api` bundles on Supabase's side, including the `packages/` files the function imports, so Docker isn't needed. The deploy takes `verify_jwt = false` from `config.toml`: the gateway's own token check only knows the legacy JWT secret, and the function checks every token itself against the project's published keys. Check it: a request without a token, `curl -s -X POST https://<project-ref>.supabase.co/functions/v1/staff-admin -d "{}"`, answers `{"error":"unauthorized"}`. Then run `pnpm smoke:staff-admin --remote` and type the gym code and its Owner's username and password (hidden). `smoke.test` stays in the gym, deactivated; next time pass `--staff <another username>`. The deploy needs `supabase login` with the Supabase account that owns the project (`supabase projects list` must show it); another account gets 403.
- **Changed `VITE_*` values:** redeploy on Vercel and rebuild the APK and EXE. The address is part of each build's Content-Security-Policy.
- **Projects set up with PowerSync (before 1d-R)**, in this order:
  1. Delete the instance on powersync.com, then wait until its connection is gone: `select count(*) from pg_stat_activity where usename = 'powersync_role'` returns 0. The replication stream can take a few minutes to close.
  2. Push migration `20261009100000_online_only.sql`. It removes the `powersync` publication and `powersync_role`, and every staff member sets a new PIN at their next password login.
  3. Remove PowerSync's replication slot. Left alone, it makes Postgres keep its change log (WAL) forever and the disk fills up: `select pg_drop_replication_slot(slot_name) from pg_replication_slots where slot_name like 'powersync%' and not active;`
  4. Push the code right away: Vercel deploys it, and the old app can't log in after step 2. Then remove `VITE_POWERSYNC_URL` on Vercel.

## Android app

- `pnpm android:apk` builds `apps/app/android/app/build/outputs/apk/debug/app-debug.apk`. Install it with `adb install -r <apk>`, or copy it to the device and allow installing unknown apps. It is signed with the debug key; release signing comes in Phase 11.
- The APK carries the production web build and serves it from `https://localhost`. Its secure storage belongs to that origin: never change Capacitor's scheme or hostname.
- After changing web code, run `pnpm android:apk` again. To build or debug in Android Studio instead, run `pnpm --filter @gym/app android:sync` first, then `pnpm android:open`.
- **Against the local backend** (emulator or USB device): build with the local addresses, then forward the port so `127.0.0.1` on the device reaches your PC:
  ```sh
  pnpm --filter @gym/app exec vite build --mode e2e
  pnpm --filter @gym/app exec cap sync android
  node apps/app/scripts/gradle.mjs assembleDebug
  adb reverse tcp:54321 tcp:54321   # Supabase
  ```
  Debug builds allow plain HTTP to `localhost` only (`android/app/src/debug`); release builds are HTTPS-only.
- App ID: `site.clickgroup.gymspa`. It becomes permanent once the app is published (Phase 11). The version comes from `apps/app/package.json`.
- The app draws behind the status and navigation bars (Android 15+ requires it); the layout keeps content clear of them with `env(safe-area-inset-*)`.
- Cloud backup is turned off: a restored backup would clone this device's identity onto another device.
- Icons: run `pnpm --filter @gym/app generate:icons` after changing `public/logo.svg`. The adaptive icon (Android 8+) is a vector, `android/app/src/main/res/drawable/ic_launcher_foreground.xml`, which has to be updated by hand.

## Windows app

- `pnpm desktop:exe` builds `apps/desktop/release/gym-spa-setup-<version>.exe`. It installs for the current user without admin rights, and keeps its data in `%APPDATA%\gym-spa`.
- If the installer step stops with NSIS's "Can't open output file", something (usually the antivirus scanning the previous file) still holds `release/gym-spa-setup-<version>.exe`: run `pnpm desktop:exe` again.
- App ID: `site.clickgroup.gymspa` (the same as Android). Publisher: Click Group.
- The installer is not signed until Phase 11, so Windows SmartScreen warns about an unknown publisher: click **More info → Run anyway**.
- The app serves the same production web build from `app://gym-spa`. Browser storage and workers work there (the e2e tests check this). Its stored data belongs to that origin: never change it.
- No menu bar. Shortcuts: Ctrl and `=` / `-` / `0` zoom (by key position, so they also work with a Kurdish or Arabic keyboard layout), F11 full screen. When run from source (`pnpm desktop:dev`, `pnpm desktop:start`) there are also Ctrl+R (reload) and F12 or Ctrl+Shift+I (DevTools).
- Security: the page has no Node or Electron access, only `window.gymDesktop`; the window can't navigate away from the app (https links open in the default browser); permissions such as camera or location are refused; Electron's security fuses are burned into the installed exe.
- The secure store (`gymDesktop.secureGet/secureSet/secureDelete`) accepts calls only from the app's own pages, checks every key and value, and refuses to write when Windows encryption isn't available.
- **PC/SC card readers** ([NFC cards and readers](#nfc-cards-and-readers)):
  - `smartcard` is an optional dependency of `apps/desktop`, compiled by node-gyp during `pnpm install` (allowed in `pnpm-workspace.yaml`). That needs Visual Studio 2022 Build Tools ("Desktop development with C++") and Python 3.12.
  - Where it can't be compiled (Vercel's Linux build, a PC without the tools), `pnpm install` skips it with a warning, and the Windows app is built without PC/SC readers: `pnpm --filter @gym/desktop build` prints "No PC/SC card readers in this build".
  - The build copies the compiled `smartcard_napi.node` into `apps/desktop/dist/native/`, and the installer keeps it outside `app.asar` (in `app.asar.unpacked`), because Windows can't load it from inside the archive.
  - It uses Node-API, so an Electron upgrade needs no rebuild. The machine that builds the release installer (Phase 11) needs the same tools.
- Kiosk mode, start with Windows and auto-update are built in later phases. Silent receipt printing is built (step 8f, Receipts above). The offline edition (server PC on the gym's network) is planned for the offline packaging phase (spec §8, before Phase 11), which starts with step 1f.

## Deploying the web app (Vercel)

Setting up the Vercel project: [A cloud project](#a-cloud-project), step 7. `apps/app/vercel.json` sets the install and build commands (`pnpm build:web`: the gym app plus the seller panel under `/seller/`, see [Deployed with the gym app at `/seller/`](#deployed-with-the-gym-app-at-seller)), the SPA rewrites and the headers. Every push to `main` deploys to production and other branches get preview deploys; Vercel skips the build when a push changes nothing the app uses (for example only `supabase/`).

**Content-Security-Policy:** every production build (web, Windows and Android) carries a CSP `<meta>` tag made by `vite.config.ts`. The app may only connect to itself and the Supabase address in the build's `VITE_*` variables, and only run its own scripts (the inline start-up script by its hash). Changing the address needs a new build. `pnpm dev` has no CSP, because Vite injects inline scripts there.

**Updates:** the build carries its commit (`<meta name="gym-build">`). An open web app looks for a new version every hour, and when it comes back to the front or back online. When the service worker has downloaded one, a notice stays at the top of every screen, the login and lock screens too, until staff press «نوێکردنەوە». The page then reloads into the new version, which locks the app (the PIN opens it again); a form with changes not saved asks first. It never reloads on its own.

## Releasing

Every release follows the working rules in `CLAUDE.md`: one release per phase, its sub-steps on stacked feature branches; the full suite once; cloud migrations before the merge; then one pull request from the phase's last branch, merged with `gh pr merge` (never a push to `main`).

**On every push**, GitHub Actions runs `pnpm check`, `pnpm db:test` and `pnpm db:lint` (`.github/workflows/checks.yml`; the database jobs start a local Supabase in the runner with only Postgres, Auth and the API). The end-to-end tests run on the PC. Between releases each sub-step runs only the tests its change touches.

1. Push the phase's last branch: `git push origin <branch>`.
2. Checks: `pnpm check`, `pnpm db:test`, `pnpm db:lint`, and the full `pnpm test:e2e` with `pnpm db:functions` running (for staff- or seller-module changes also `pnpm test:int` and `pnpm test:deno`).
3. Cloud migrations (needs `SUPABASE_DB_URL` in `supabase/.env.local` and Docker): `pnpm release:migrations --push`. It stops without pushing anything when the cloud has a migration this branch doesn't, when a pending one is older than the cloud's last, or when one isn't purely additive (any `drop`, `rename`, `delete`, `truncate`, `update`, changed column type, or `revoke` on something older; `supabase/scripts/migration-safety.ts`). Otherwise it rehearses them on a local copy of the cloud's schema (the local database reset to the cloud's last migration, with a gym and its Owner), resets the local database again, runs the cloud dry run, and pushes only when the dry run lists exactly the pending migrations. Destructive migrations wait for the user.
4. `gh pr create --base main --head <branch>`, then `gh pr merge <number> --merge`.
5. `pnpm release:check-live`: Vercel serves the merged commit, and the gym app and the seller panel load, reach Auth (health 200) and log no errors. Read-only.
