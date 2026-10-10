# Gym & Spa Management System

Multi-branch gym & spa system with NFC check-in. One codebase for Web/PWA, Android and Windows. Kurdish Sorani is the default language; English and Arabic are also available.

- Repository: https://github.com/miraann/gym-spa
- Full spec: [gym-spa-system-prompt.md](gym-spa-system-prompt.md)
- Working rules for contributors and Claude: [CLAUDE.md](CLAUDE.md)

> **Status:** Phase 1d done, then reworked for two editions (1d-R). The app always talks to its server: Supabase in the cloud for the **online edition** (web, Android, Windows), and later a server PC on the gym's local network for the **offline edition** (Windows only, see [CLAUDE.md](CLAUDE.md) → Two editions). Staff log in with their password once per device, then switch with a PIN that the server checks. The cloud setup (Supabase, Vercel) is live. The auth spike is done: Supabase Auth runs on the offline edition's Windows server PC ([spikes/windows-auth/README.md](spikes/windows-auth/README.md)). This README grows with each step.
>
> **Many gyms (spec §2.6).** Click Group sells the system to many gyms. **MT-1 is done:** every row belongs to a gym, staff log in with their gym's code, and the gym's top role is the **Owner** (خاوەن, formerly Super Admin); see [Gyms](#gyms). Older projects move with [Moving a cloud project to many gyms](#moving-a-cloud-project-to-many-gyms-mt-1). A separate **seller panel** (`apps/seller`, step MT-3) will create and manage gyms, subscriptions and offline licenses; until then `pnpm bootstrap:admin --gym <code>` creates gyms. MT-1 and the design step are live. **MT-2, the staff module, is built and waiting for review:** staff logins are created and changed through Supabase Auth's admin API by a server-side module (the Edge Function `staff-admin`, not deployed to the cloud yet); see [Staff accounts](#staff-accounts). Next, in order (spec §8): MT-3 to MT-5 (seller panel, support access, licenses), 1e (admin screens: staff, roles, branches, devices), 1f (offline-edition server test).

## Requirements

- **Node.js 24** (see `.node-version`)
- **pnpm 12**, through Corepack. If `corepack enable` fails with a permissions error on Windows, install the shim in your user folder instead:
  ```sh
  corepack enable --install-directory "%APPDATA%\npm" pnpm
  ```
- The project folder path must not contain `&`. Windows batch scripts (like Gradle's `gradlew.bat`, used for Android builds) break on it.
- **Android builds:** JDK 21 and the Android SDK (install Android Studio). The build finds the SDK through `ANDROID_HOME`, or in Android Studio's default folder (`%LOCALAPPDATA%\Android\Sdk` on Windows).
- **Windows builds:** nothing extra. Electron and the installer tools download on first use.
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
| `pnpm test:e2e` | Build against the local backend (`--mode e2e`, `apps/app/.env.e2e`), then run Playwright tests for the web app (login, PIN, lock, lost connection, RTL) and the Windows app (encrypted sessions, storage and workers on `app://`, security rules). Needs `pnpm db:start` |
| `pnpm test:int` | Integration tests of the staff module (`packages/staff-admin`) against the local Supabase: the real Auth admin API and database. Needs `pnpm db:start` |
| `pnpm db:functions` | Serve the Edge Functions locally at http://127.0.0.1:54321/functions/v1/staff-admin (`supabase functions serve`). Leave it running in its own terminal |
| `pnpm test:deno` | The staff module in Deno, the Edge Function's runtime: type-checks the function, runs the unit cases, then HTTP tests against the served function. Needs `pnpm db:start` and `pnpm db:functions` |
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
| `pnpm db:lint` | Check the SQL functions for errors (plpgsql_check) |
| `pnpm db:types` | Regenerate the TypeScript types of the database (`packages/db`). Run after changing migrations |
| `pnpm bootstrap:admin` | Create a gym's first Owner: `--gym <code>`, and the gym itself if it doesn't exist yet (its code can never change). Add `--remote` for a cloud project (see [A cloud project](#a-cloud-project)) |
| `pnpm staff-logins:move` | Once, after the MT-1 migrations, on a project that already had staff: moves their logins to their gym's address. Only shows what it would change; `--apply` changes it. `--remote` for a cloud project |

First-time setup for the browser tests: `pnpm --filter @gym/app exec playwright install chromium`.

The database, integration, Deno and end-to-end commands need Docker running, so `pnpm check` includes none of `pnpm db:test`, `pnpm test:int`, `pnpm test:deno` and `pnpm test:e2e`. The first `pnpm test:deno` downloads the function's npm packages into Deno's cache. The end-to-end tests create their own branches and staff and remove them afterwards.

## Project layout

```
apps/app             React + Vite app (PWA)
  src/app            app-level wiring: providers, navigation, service worker
  src/components     shared components; ui/ holds the shadcn/ui components
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
packages/staff-admin the staff module: staff logins through Supabase Auth's admin API (server side;
                     the app imports only its request types and error keys)
supabase             the database
  functions          Edge Functions (Deno): staff-admin
  migrations         schema changes, in order (tables, RLS policies, triggers, functions, built-in roles)
  tests              pgTAP tests, run with pnpm db:test
  seed.sql           demo data for local development (Kurdish)
  scripts            bootstrap-admin.ts, move-staff-logins.ts, test-deno.ts
tools/eslint-plugin-gym  project lint rules
```

## Languages

- **Kurdish (`ckb`) is the source language.** Add every new text to `packages/i18n/src/locales/ckb/*.json` first, then `en` and `ar`. A key missing from English or Arabic is a TypeScript error, and a test checks that all languages have the same keys and `{{placeholders}}`.
- A spelling test rejects Arabic letters in Kurdish texts (ي ك ى ة) and Kurdish letters in Arabic texts (ی ک ە).
- Lint rules:
  - `gym/no-hardcoded-ui-text`: text in JSX, labels, placeholders and toasts must come from `t('...')`.
  - `gym/no-physical-direction-classes`: use `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`/`text-start`, never `ml-`/`mr-`/`left-`/`text-left`, so layouts mirror in RTL.
- Fonts (all bundled, never loaded from the internet): **UniSalar_F_007** for Kurdish (`apps/app/src/assets/fonts`), Vazirmatn for Arabic, Inter for English. UniSalar is limited to Arabic-script characters with `unicode-range`, because it draws ASCII digits as Eastern Arabic. Digits and Latin text in Kurdish screens use Vazirmatn.
- Dates are shown in Baghdad time. Kurdish uses Sorani month names (`4ی تشرینی یەکەمی 2026`). Digits are Western by default, with Eastern Arabic (`٢٥٬٠٠٠ د.ع`) as a setting.

## Database (Supabase)

Supabase runs locally in Docker for development (`supabase/config.toml` is the local setup). The app has no local copy of the data: every screen reads and saves through the server (supabase-js + TanStack Query), under the signed-in staff member's own session. For the cloud project, see [A cloud project](#a-cloud-project).

Both editions use the same migrations, so server logic goes into Postgres (functions, triggers, RLS). Supabase-only features (Edge Functions, pg_cron, Realtime, Storage) need an offline-edition version too before a module may use them. The one Edge Function, `staff-admin`, is a plain `Request → Response` handler that the offline edition's `gym-server` will run as well ([Staff accounts](#staff-accounts)).

### Migrations

- Every schema change is a new file in `supabase/migrations`. Create one with `pnpm --filter @gym/supabase exec supabase migration new <name> --workdir ..`. Never change a migration that has already run on a shared database.
- After changing migrations or tests: `pnpm db:reset`, `pnpm db:test`, then `pnpm db:types`.
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
  - **locked** (`locked_at`): all access ends at once; staff see nothing (`gym_locked`).
  - Until the seller panel exists (MT-3), these columns are set in SQL.
- **Limits:** `max_branches` and `max_devices` (empty: no limit) are checked whenever a branch or device is added or made active again (`gym_branch_limit`, `gym_device_limit`).

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

### Adding a table

1. Columns: `id uuid primary key` (generated by the app), `gym_id uuid not null default app.current_gym_id()`, `branch_id` if it belongs to a branch, `created_at`, `created_by`, `updated_at`, `updated_by`, and `deleted_at` (rows are soft-deleted). Money is `numeric(14,2)`, times are `timestamptz`.
2. Links to another gym table name `gym_id` too: `foreign key (branch_id, gym_id) references public.branches (id, gym_id)`, with an index on `(branch_id, gym_id)`. A table that others link to gets `unique (id, gym_id)`.
3. Triggers: `check_writable` (`app.check_gym_writable()`: nothing changes while the gym is read-only), `stamp` (`app.stamp_row()`), `read_only` for columns that never change (always including `gym_id`), and `audit` (`app.audit_row()`).
4. `enable row level security`, `revoke all ... from anon, authenticated`, grant only what is needed, then the policies. Every policy checks `gym_id = (select app.current_gym_id())`. Write the other checks as `(select app.has_permission('...'))` and `branch_id in (select app.accessible_branch_ids())`, so Postgres runs them once per query, not once per row.
5. pgTAP tests in `supabase/tests` for every policy and guard. `001-schema-rules.test.sql` fails when a table has no RLS, no policies, no audit trigger, an unindexed foreign key, any access for anonymous visitors, no `gym_id`, a policy without the gym check, a link without `gym_id`, or no `check_writable` / read-only `gym_id`. Add a case to `120-gym-isolation.test.sql` that tries to add a row to another gym; it fails while a table has none.

## Login, PIN and lock

Code: `apps/app/src/features/auth`, rules in `packages/core` (`gym.ts`, `staff.ts`, `pin.ts`, `settings.ts`, `permissions.ts`), PIN functions in `supabase/migrations/20261009100000_online_only.sql` and `20261010100100_gym_rules.sql`.

- **First login on a device:** the gym code (a web link like `https://…/?gym=demo` fills it in), username and password. Then a new password if a manager set it (`must_change_password`), a 6-digit PIN if the staff member has none yet, and the device's branch if they have more than one. The branch is kept on the device (secure storage); changing it comes with the devices screen in 1e.
- **The device remembers its gym** (secure storage). From then on, the login and lock screens show the gym's name and ask only for username and password. Everyone logged in on a device belongs to its gym, so "Use another gym" appears only while nobody is logged in. A wrong gym code, username or password gives the same message, so nobody learns which gyms or usernames exist.
- **A gym that isn't active:** the lock screen says when the gym is read-only or locked (from the last server check). In a locked gym, the PIN and the password both refuse with that reason, and the app locks at the next server check.
- **The PIN is checked by the server.** `set_my_pin()` hashes it (bcrypt) and works only within 15 minutes of a password login, so a session left on a device can't replace someone's PIN. `unlock_with_pin()` checks it, refuses a branch the staff member can't access, and counts wrong tries for every device. After `security.pin_max_attempts` wrong PINs (default 5) the PIN is locked; only a password login after that moment unlocks it (`clear_my_pin_lockout()` compares the login time in the token). Nobody can read a PIN hash, not even its owner. Easy guesses (`111111`, `123456`, `121212`) are refused on the screen and again by the server.
- **What the device keeps per staff member**, encrypted: their Supabase session, name, role, permissions and whether they have a PIN (`packages/platform/src/secure-storage.ts`). Windows: DPAPI through Electron `safeStorage` (files in `%APPDATA%\gym-spa\secure`). Android: the Keystore. Browser: AES-GCM with a key the browser won't export, which is weaker: someone with the browser profile can still use the key.
- **The lock screen** ("who's working") lists the staff who logged in on this device. The app locks after `security.idle_lock_minutes` without activity (default 10), from the account menu ("Lock"), and on every reload or restart. Locking covers the app instead of closing it, so a half-filled form survives.
- **Server checks** (after each unlock, when the connection comes back, and every 5 minutes) refresh names, roles and permissions. A PIN removed by a manager (`reset_staff_pin`), a PIN lockout or a deactivated account takes effect there, or at once on the next PIN.
- **Permissions in the UI** (`usePermissions()`) come from the last server check. They only hide things: the server checks every request again.

## Staff accounts

Spec §2.5 (design B), step MT-2. Code: `packages/staff-admin`, the Edge Function `supabase/functions/staff-admin`, migration `20261010100400_staff_admin.sql`, and the app's calls in `apps/app/src/features/staff/staff-admin-api.ts`. The screens come in 1e.

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

## Connection

The app always needs its server. `apps/app/src/lib/connection.ts` checks `GET /auth/v1/health` every 30 seconds (every 10 while disconnected) and whenever the network changes. The top bar shows Connected / No connection / Server not responding, with the time of the last check and a "Check again" button. While the server can't be reached, TanStack Query pauses its requests and runs them again when it is back; the PIN and the password login say that the server is needed.

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
4. **First gym and its Owner:** `pnpm bootstrap:admin --gym <code> --remote`. Its first line shows which Supabase project it is talking to; check it. For a gym that doesn't exist yet it asks you to confirm, then for the gym's Kurdish name and its first branch's name (`B1`; press Enter to keep the default name). The gym code can never change later. Type the password yourself; it never goes into a file.
5. **App settings.** Copy `apps/app/.env.example` to `apps/app/.env.local` and fill in:
   - `VITE_SUPABASE_URL`: `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: the **publishable** key (`sb_publishable_…`), never the secret key
6. **Vercel.**
   1. Add New → Project → import `miraann/gym-spa`. The repository is private: if it isn't listed, give Vercel's GitHub app access to it.
   2. **Root Directory** = `apps/app`. Leave "Include files outside the root directory" on, because the app uses the workspace packages. Leave the build settings alone: `apps/app/vercel.json` sets them.
   3. **Environment Variables**, for Production and Preview: the two `VITE_*` values (you can import `apps/app/.env.local`, but **never** `supabase/.env.local`), and `ENABLE_EXPERIMENTAL_COREPACK` = `1`, so Vercel uses the pnpm version pinned in `package.json`.
   4. **Settings → Build and Deployment → Node.js Version: 24.x.** The repository requires Node 24.
   5. Deploy. A build only picks up changed variables when it runs again: after changing one, use Deployments → ⋯ → Redeploy.
7. **Check it works.** Open the site and log in as the admin. The connection indicator should say Connected. In DevTools → Network, switch to Offline: the indicator says No connection. If the login screen says the app isn't connected to a server, the build had no `VITE_*` values (the page's Content-Security-Policy then allows `connect-src 'self'` only). A tab that was already open may keep the old version until you accept the update prompt or reopen it.

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
  `--use-api` bundles on Supabase's side, including the `packages/` files the function imports, so Docker isn't needed. The deploy takes `verify_jwt = false` from `config.toml`: the gateway's own token check only knows the legacy JWT secret, and the function checks every token itself against the project's published keys. Check it: a request without a token, `curl -s -X POST https://<project-ref>.supabase.co/functions/v1/staff-admin -d "{}"`, answers `{"error":"unauthorized"}`.
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
- App ID: `site.clickgroup.gymspa` (the same as Android). Publisher: Click Group.
- The installer is not signed until Phase 11, so Windows SmartScreen warns about an unknown publisher: click **More info → Run anyway**.
- The app serves the same production web build from `app://gym-spa`. Browser storage and workers work there (the e2e tests check this). Its stored data belongs to that origin: never change it.
- No menu bar. Shortcuts: Ctrl and `=` / `-` / `0` zoom (by key position, so they also work with a Kurdish or Arabic keyboard layout), F11 full screen. When run from source (`pnpm desktop:dev`, `pnpm desktop:start`) there are also Ctrl+R (reload) and F12 or Ctrl+Shift+I (DevTools).
- Security: the page has no Node or Electron access, only `window.gymDesktop`; the window can't navigate away from the app (https links open in the default browser); permissions such as camera or location are refused; Electron's security fuses are burned into the installed exe.
- The secure store (`gymDesktop.secureGet/secureSet/secureDelete`) accepts calls only from the app's own pages, checks every key and value, and refuses to write when Windows encryption isn't available.
- Kiosk mode, start with Windows, silent receipt printing and auto-update are built in later phases. The offline edition (server PC on the gym's network) is planned for step 1f and a later phase.

## Deploying the web app (Vercel)

Setting up the Vercel project: [A cloud project](#a-cloud-project), step 6. `apps/app/vercel.json` sets the install and build commands, the SPA rewrite and cache headers. Every push to `main` deploys to production and other branches get preview deploys; Vercel skips the build when a push changes nothing the app uses (for example only `supabase/`).

**Content-Security-Policy:** every production build (web, Windows and Android) carries a CSP `<meta>` tag made by `vite.config.ts`. The app may only connect to itself and the Supabase address in the build's `VITE_*` variables, and only run its own scripts (the inline start-up script by its hash). Changing the address needs a new build. `pnpm dev` has no CSP, because Vite injects inline scripts there.
