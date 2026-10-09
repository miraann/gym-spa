# Gym & Spa Management System

Offline-first, multi-branch gym & spa system with NFC check-in. One codebase for Web/PWA, Android and Windows. Kurdish Sorani is the default language; English and Arabic are also available.

- Repository: https://github.com/miraann/gym-spa
- Full spec: [gym-spa-system-prompt.md](gym-spa-system-prompt.md)
- Working rules for contributors and Claude: [CLAUDE.md](CLAUDE.md)

> **Status:** Phase 1d done: every device has its own local database (PowerSync) and syncs its branch. Staff log in with their password once per device, then unlock with a PIN, also offline; each change uploads under its author's own session. The cloud setup (Supabase, PowerSync Cloud, Vercel) is live. The admin screens (staff, roles, branches, devices, sync) come in 1e. This README grows with each step.

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
pnpm sync:start        # local PowerSync in Docker (after db:start; again after every db:reset)
pnpm bootstrap:admin   # create your Super Admin login
cp apps/app/.env.e2e apps/app/.env.development.local   # pnpm dev talks to the local Supabase and PowerSync
pnpm dev               # http://localhost:5173, log in with the Super Admin you just created
```

## Commands

Run from the repository root:

| Command | What it does |
|---|---|
| `pnpm dev` | Start the app in development mode (no service worker) |
| `pnpm build` | Production build into `apps/app/dist` |
| `pnpm preview` | Serve the production build at http://localhost:4173. Use this to try offline mode. |
| `pnpm test` | Unit tests (Vitest): formatting, translations, Sorani spelling, fonts, lint rules |
| `pnpm test:e2e` | Build against the local backend (`--mode e2e`, `apps/app/.env.e2e`), then run Playwright tests for the web app (login, PIN, lock, offline, two devices syncing, RTL) and the Windows app (encrypted sessions, storage, workers and WebAssembly on `app://`, security rules). Needs `pnpm db:start` and `pnpm sync:start` |
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
| `pnpm db:test` | Database tests (pgTAP in `supabase/tests`): row level security and the access rules |
| `pnpm db:lint` | Check the SQL functions for errors (plpgsql_check) |
| `pnpm db:types` | Regenerate the TypeScript types of the database (`packages/db`). Run after changing migrations |
| `pnpm sync:start` / `pnpm sync:stop` | Start or stop local PowerSync (Docker), at http://localhost:54380. Start it again after `pnpm db:reset` |
| `pnpm sync:logs` | PowerSync's log (sync config errors show up here) |
| `pnpm test:sync` | End-to-end sync tests: Node devices go offline, edit and reconnect against local Supabase and PowerSync |
| `pnpm bootstrap:admin` | Create the first Super Admin. Add `--remote` for a cloud project (see [A cloud project](#a-cloud-project)) |

First-time setup for the browser tests: `pnpm --filter @gym/app exec playwright install chromium`.

The database, sync and end-to-end commands need Docker running, so `pnpm check` includes none of `pnpm db:test`, `pnpm test:sync` and `pnpm test:e2e`. The end-to-end tests create their own branches and staff and remove them afterwards.

## Project layout

```
apps/app             React + Vite app (PWA)
  src/app            app-level wiring: providers, navigation, service worker
  src/components     shared components; ui/ holds the shadcn/ui components
  src/features       one folder per module (auth, home, settings, members, ...)
  src/lib            preferences, formatting, logging, Supabase clients, the sync connection
  src/routes         TanStack Router file routes (thin; pages live in features/)
  e2e                Playwright tests
  android            Android project (Capacitor); its build output is not committed
  scripts            Android build and icon scripts
apps/desktop         Windows app: an Electron shell around the same web build
  src/main.ts        window, app:// protocol, security rules
  src/preload.ts     the small bridge the web app gets (window.gymDesktop)
  e2e                Playwright tests that launch the real Electron app
packages/core        business rules in plain TypeScript, shared by the app and server scripts
packages/db          the local database: PowerSync schema, upload connector, generated Supabase types
  test               end-to-end sync tests (pnpm test:sync)
packages/platform    platform detection and native adapters; the only code that touches Capacitor or Electron
packages/i18n        translations (ckb, en, ar), typed keys, number/money/date formatting
supabase             the database
  migrations         schema changes, in order (tables, RLS policies, triggers, built-in roles)
  tests              pgTAP tests, run with pnpm db:test
  seed.sql           demo data for local development (Kurdish)
  powersync          local PowerSync (Docker) and sync-config.yaml: what each device downloads
  scripts            bootstrap-admin.ts, powersync.mjs
tools/eslint-plugin-gym  project lint rules
```

## Languages

- **Kurdish (`ckb`) is the source language.** Add every new text to `packages/i18n/src/locales/ckb/*.json` first, then `en` and `ar`. A key missing from English or Arabic is a TypeScript error, and a test checks that all languages have the same keys and `{{placeholders}}`.
- A spelling test rejects Arabic letters in Kurdish texts (ي ك ى ة) and Kurdish letters in Arabic texts (ی ک ە).
- Lint rules:
  - `gym/no-hardcoded-ui-text`: text in JSX, labels, placeholders and toasts must come from `t('...')`.
  - `gym/no-physical-direction-classes`: use `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`/`text-start`, never `ml-`/`mr-`/`left-`/`text-left`, so layouts mirror in RTL.
- Fonts (all bundled, so they work offline): **UniSalar_F_007** for Kurdish (`apps/app/src/assets/fonts`), Vazirmatn for Arabic, Inter for English. UniSalar is limited to Arabic-script characters with `unicode-range`, because it draws ASCII digits as Eastern Arabic. Digits and Latin text in Kurdish screens use Vazirmatn.
- Dates are shown in Baghdad time. Kurdish uses Sorani month names (`4ی تشرینی یەکەمی 2026`). Digits are Western by default, with Eastern Arabic (`٢٥٬٠٠٠ د.ع`) as a setting.

## Database (Supabase)

Supabase runs locally in Docker for development (`supabase/config.toml` is the local setup). Devices keep their own copy of the data and sync it through PowerSync; the app never waits for the database. For the cloud project, see [A cloud project](#a-cloud-project).

### Migrations

- Every schema change is a new file in `supabase/migrations`. Create one with `pnpm --filter @gym/supabase exec supabase migration new <name> --workdir ..`. Never change a migration that has already run on a shared database.
- After changing migrations or tests: `pnpm db:reset`, `pnpm db:test`, then `pnpm db:types`.
- Nothing is reachable through the API by default (`auto_expose_new_tables = false`, like new cloud projects): each migration grants exactly what it needs.

### How access works

- Staff log in with a username. Supabase Auth gets `<username>@staff.gym-spa.invalid` behind the scenes (`packages/core/src/staff.ts`); `.invalid` is a reserved domain, so no mail can go there.
- Every table has row level security. Policies use helpers in the private `app` schema, which the API doesn't expose:
  - `app.has_permission('members.create')`: the signed-in staff member's role has that permission. Super Admin has all of them.
  - `app.accessible_branch_ids()` and `app.has_branch_access(id)`: every branch for staff with `all_branches`, otherwise their rows in `staff_branches`. This is the only place the rule is written.
- Guard triggers stop privilege escalation. Nobody can give a permission (or a role with a permission) they don't have, change their own role or access, or manage someone with access they lack. Only Super Admin can give the Super Admin role or edit the built-in roles.
- Changes made without a staff session (migrations, server code using the secret key) skip the per-user checks. The secret key never goes into the app.
- These rules reject a change with a stable key as the error message (`cannot_grant_role`, `read_only_column`, ...) for the app to translate, and an English detail for the logs.
- Every change to the important tables goes into `audit_logs`: who, when, the old and new values, IP and device. Nobody can change or delete it, and secrets such as PIN hashes are logged as `redacted`.
- The permission catalog and the 8 built-in roles are in `supabase/migrations/20261005100300_permission_catalog.sql`.

### Adding a table

1. Columns: `id uuid primary key` (generated by the device), `branch_id` if it belongs to a branch, `created_at`, `created_by`, `updated_at`, `updated_by`, and `deleted_at` (rows are soft-deleted). Money is `numeric(14,2)`, times are `timestamptz`.
2. Triggers: `stamp` (`app.stamp_row()`), `read_only` for columns that never change, and `audit` (`app.audit_row()`).
3. `enable row level security`, `revoke all ... from anon, authenticated`, grant only what is needed, then the policies. Write checks as `(select app.has_permission('...'))` and `branch_id in (select app.accessible_branch_ids())` so Postgres runs them once per query, not once per row.
4. pgTAP tests in `supabase/tests` for every policy and guard. `001-schema-rules.test.sql` fails when a table has no RLS, no policies, no audit trigger, an unindexed foreign key, or any access for anonymous visitors.
5. If devices need the table: add it to the `powersync` publication and the sync rules.

## Login, PIN and lock

Code: `apps/app/src/features/auth`, rules in `packages/core` (`pin.ts`, `settings.ts`, `permissions.ts`).

- **First login on a device** (online): username and password, then a new password if a manager set it (`must_change_password`), then a 6-digit PIN if the staff member has none yet, then the device's branch if they have more than one. The branch is kept on the device (`local_kv`); changing it comes with the devices screen in 1e.
- **The PIN** is hashed on the device (PBKDF2-SHA256, 600,000 rounds, random salt) and saved in `staff_pins`, so it also works on the staff member's other devices. Easy guesses (`111111`, `123456`, `121212`) are refused. PIN hashes never sync to other staff.
- **What the device keeps per staff member**, encrypted: their Supabase session, PIN hash, permissions and wrong-PIN count (`packages/platform/src/secure-storage.ts`). Windows: DPAPI through Electron `safeStorage` (files in `%APPDATA%\gym-spa\secure`). Android: the Keystore. Browser: AES-GCM with a key the browser won't export, which is weaker: someone with the browser profile can still use the key.
- **The lock screen** ("who's working") lists the staff who logged in on this device. The PIN unlocks offline. After `security.pin_max_attempts` wrong PINs (default 5) that staff member needs their password again. The app locks after `security.idle_lock_minutes` without activity (default 10), from the account menu ("Lock"), and on every reload or restart. Locking covers the app instead of closing it, so a half-filled form survives.
- **Online checks** (after each unlock, when the network comes back, and every 5 minutes) refresh names, roles and permissions. A PIN removed by a manager (`reset_staff_pin`) or a deactivated account takes effect there.
- **Uploads** use each change's author's own session. If that session has ended, their changes wait (the sync popover says who must log in) and are never dropped. "Log out of this device" is refused while the staff member has unsent changes.
- **Sync** connects with the token of the staff member who unlocked last; switching staff reconnects but never clears or downloads the local data again.
- **Permissions in the UI** (`usePermissions()`) come from the synced role permissions, with the copy from the last online check as a fallback. They only hide things: the server checks every change again.

## Sync (PowerSync)

Every device works on its own SQLite database: the app reads and writes locally and never waits for the network. PowerSync downloads what the device needs and sends local changes to Supabase when it can.

- **Where the local database lives:** Android uses native SQLite (`@powersync/capacitor`). The browser and the Windows app use SQLite compiled to WebAssembly, stored in the Origin Private File System (`@powersync/web`). `packages/platform/src/database.ts` picks one.
- **What a device downloads:** `supabase/powersync/sync-config.yaml` (Sync Streams). Every signed-in device gets the role and permission catalog. It gets only its own branch's data, and only if the staff member can access that branch. Staff PINs and the audit log are never synced.
- **Branch access:** sync streams can't call SQL functions, so the branch rule is also kept as rows in `staff_branch_access`, maintained by triggers from `app.refresh_branch_access()`. RLS and the sync streams both read it, so the rule is still written once.
- **Uploads:** `packages/db/src/upload.ts`. Each change records its author in `_metadata` (`writeMetadata()`) and is sent with that staff member's own session. Network problems and server errors are retried with backoff. Changes the server refuses are recorded in the local `rejected_changes` table with a key the app translates, and the row goes back to the server's version.
- **Schema changes:** add the table or column to the migration, to `sync-config.yaml` (and the `powersync` publication, with `grant select ... to powersync_role`), and to `packages/db/src/schema.ts`. After `pnpm db:types`, `pnpm typecheck` fails if the local schema doesn't match Postgres.
- **Local development:** `pnpm sync:start` runs PowerSync in Docker next to local Supabase. It checks logins with Supabase's public keys, and its own storage starts empty each time. Production uses PowerSync Cloud with the same `sync-config.yaml` (see [A cloud project](#a-cloud-project)).

## A cloud project

The production setup: Supabase, PowerSync Cloud and the web app on Vercel. Do the steps in this order: PowerSync can only connect once the migrations are in, and the app needs both addresses when it is built. Put Supabase and PowerSync in the same region, close to Iraq (ours are both in Frankfurt, `eu-central-1`).

Settings live in three places. Never mix them:

| Where | What | Used by |
|---|---|---|
| `supabase/.env.local` (git ignores it) | `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_URL` | Scripts on your PC: `db push`, `bootstrap:admin --remote`. Secret: never in Vercel or the app |
| `apps/app/.env.local` (git ignores it) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_POWERSYNC_URL` (all public) | Local builds: `pnpm build`, `pnpm android:apk`, `pnpm desktop:exe` |
| Vercel → Settings → Environment Variables | The same three `VITE_*` values, and `ENABLE_EXPERIMENTAL_COREPACK` | The web build |

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
4. **A password for PowerSync.** The migrations create `powersync_role`, which can replicate and read only the synced tables, but can't log in. Give it a strong password in the SQL Editor and keep it for the next step:
   ```sql
   alter role powersync_role with login password '<strong password>';
   ```
   (Locally, `seed.sql` sets a development-only password.)
5. **PowerSync Cloud.** On powersync.com, create a project and an instance in the same region:
   - **Database connection:** host `db.<project-ref>.supabase.co`, port `5432`, database `postgres`, user `powersync_role` with the password from step 4, SSL mode `verify-full`. Use this direct host, not a pooler: replication doesn't work through the pooler. "Test connection" should pass.
   - **Client auth:** turn on Supabase Auth. JWKS URI `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`, audience `authenticated`.
   - **Sync config:** paste `supabase/powersync/sync-config.yaml` and deploy it. It should show as Active.
   - Copy the instance URL (`https://<id>.powersync.journeyapps.com`).
6. **First Super Admin:** `pnpm bootstrap:admin --remote`. Its first line shows which Supabase project it is talking to; check it. In a new project it also creates the first branch (`B1`; press Enter to keep the default name), so the admin can log in. Type the password yourself; it never goes into a file.
7. **App settings.** Copy `apps/app/.env.example` to `apps/app/.env.local` and fill in:
   - `VITE_SUPABASE_URL`: `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: the **publishable** key (`sb_publishable_…`), never the secret key
   - `VITE_POWERSYNC_URL`: the instance URL from step 5
8. **Vercel.**
   1. Add New → Project → import `miraann/gym-spa`. The repository is private: if it isn't listed, give Vercel's GitHub app access to it.
   2. **Root Directory** = `apps/app`. Leave "Include files outside the root directory" on, because the app uses the workspace packages. Leave the build settings alone: `apps/app/vercel.json` sets them.
   3. **Environment Variables**, for Production and Preview: the three `VITE_*` values (you can import `apps/app/.env.local`, but **never** `supabase/.env.local`), and `ENABLE_EXPERIMENTAL_COREPACK` = `1`, so Vercel uses the pnpm version pinned in `package.json`.
   4. **Settings → Build and Deployment → Node.js Version: 24.x.** The repository requires Node 24.
   5. Deploy. A build only picks up changed variables when it runs again: after changing one, use Deployments → ⋯ → Redeploy.
9. **Check it works.** Open the site and log in as the admin. The sync indicator should say Online; open it to see the last sync time and 0 pending changes. In DevTools → Network, switch to Offline: the indicator says Offline and the app still loads after a reload. If the login screen says the app isn't connected to a server, the build had no `VITE_*` values (the page's Content-Security-Policy then allows `connect-src 'self'` only). A tab that was already open may keep the old version until you accept the update prompt or reopen it.

**Later changes:**

- **New migrations:** the same `db push`, dry run first. Push them before the app or sync config that needs them.
- **Changed `sync-config.yaml`:** paste and deploy it in the PowerSync dashboard again; it doesn't follow the repository by itself.
- **Changed `VITE_*` values:** redeploy on Vercel and rebuild the APK and EXE. The addresses are part of each build's Content-Security-Policy.

## Android app

- `pnpm android:apk` builds `apps/app/android/app/build/outputs/apk/debug/app-debug.apk`. Install it with `adb install -r <apk>`, or copy it to the device and allow installing unknown apps. It is signed with the debug key; release signing comes in Phase 11.
- The APK carries the production web build and serves it from `https://localhost`, so it works offline from the first launch. The local database will belong to that origin: never change Capacitor's scheme or hostname.
- After changing web code, run `pnpm android:apk` again. To build or debug in Android Studio instead, run `pnpm --filter @gym/app android:sync` first, then `pnpm android:open`.
- **Against the local backend** (emulator or USB device): build with the local addresses, then forward the two ports so `127.0.0.1` on the device reaches your PC:
  ```sh
  pnpm --filter @gym/app exec vite build --mode e2e
  pnpm --filter @gym/app exec cap sync android
  node apps/app/scripts/gradle.mjs assembleDebug
  adb reverse tcp:54321 tcp:54321   # Supabase
  adb reverse tcp:54380 tcp:54380   # PowerSync
  ```
  Debug builds allow plain HTTP to `localhost` only (`android/app/src/debug`); release builds are HTTPS-only.
- App ID: `site.clickgroup.gymspa`. It becomes permanent once the app is published (Phase 11). The version comes from `apps/app/package.json`.
- The app draws behind the status and navigation bars (Android 15+ requires it); the layout keeps content clear of them with `env(safe-area-inset-*)`.
- Cloud backup is turned off: a restored backup would clone this device's identity (its receipt-number prefix) onto another device.
- Icons: run `pnpm --filter @gym/app generate:icons` after changing `public/logo.svg`. The adaptive icon (Android 8+) is a vector, `android/app/src/main/res/drawable/ic_launcher_foreground.xml`, which has to be updated by hand.

## Windows app

- `pnpm desktop:exe` builds `apps/desktop/release/gym-spa-setup-<version>.exe`. It installs for the current user without admin rights, and keeps its data in `%APPDATA%\gym-spa`.
- App ID: `site.clickgroup.gymspa` (the same as Android). Publisher: Click Group.
- The installer is not signed until Phase 11, so Windows SmartScreen warns about an unknown publisher: click **More info → Run anyway**.
- The app serves the same production web build from `app://gym-spa`. IndexedDB, OPFS, workers and WebAssembly work there (the e2e tests check this). The local database will belong to that origin: never change it.
- No menu bar. Shortcuts: Ctrl and `=` / `-` / `0` zoom (by key position, so they also work with a Kurdish or Arabic keyboard layout), F11 full screen. When run from source (`pnpm desktop:dev`, `pnpm desktop:start`) there are also Ctrl+R (reload) and F12 or Ctrl+Shift+I (DevTools).
- Security: the page has no Node or Electron access, only `window.gymDesktop`; the window can't navigate away from the app (https links open in the default browser); permissions such as camera or location are refused; Electron's security fuses are burned into the installed exe.
- The secure store (`gymDesktop.secureGet/secureSet/secureDelete`) accepts calls only from the app's own pages, checks every key and value, and refuses to write when Windows encryption isn't available.
- Kiosk mode, start with Windows, silent receipt printing and auto-update are built in later phases.

## Deploying the web app (Vercel)

Setting up the Vercel project: [A cloud project](#a-cloud-project), step 8. `apps/app/vercel.json` sets the install and build commands, the SPA rewrite and cache headers. Every push to `main` deploys to production and other branches get preview deploys; Vercel skips the build when a push changes nothing the app uses (for example only `supabase/`).

**Content-Security-Policy:** every production build (web, Windows and Android) carries a CSP `<meta>` tag made by `vite.config.ts`. The app may only connect to itself and the Supabase and PowerSync addresses in the build's `VITE_*` variables, and only run its own scripts (the inline start-up script by its hash). Changing those addresses needs a new build. `pnpm dev` has no CSP, because Vite injects inline scripts there.
