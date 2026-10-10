# Auth spike: Supabase Auth on the offline edition's Windows server PC

Throwaway code from 2026-10-09/10. It answers three questions before the design step and 1e:

1. Can the real Supabase Auth run natively on the gym's Windows server PC, with Postgres 17 and
   PostgREST, so the app and our migrations work unchanged?
2. How should staff creation, password reset and deactivation work in **both** editions, so the 1e
   staff screens are built once?
3. Are the web e2e tests still flaky now that PowerSync is gone?

Nothing here is used by the app. The tools live in `F:\spikes-tools` (portable, no services, nothing
in startup, Postgres on port 55432). See "Removing everything" at the end.

## Answers

### 1. Supabase Auth on Windows: yes, with one small patch and one setting

| Check | Result |
|---|---|
| Postgres 17.11 (EDB zip, same version as the local Supabase image) | runs as a plain process on 127.0.0.1:55432 |
| Supabase Auth **v2.197.0** (same version the CLI runs) built for Windows | **does not compile as published**: `cmd/serve_cmd.go` sets `SO_REUSEPORT` (Linux only). `auth-windows.patch` moves that into `listen_unix.go` and adds a plain `listen_windows.go`; 3 files, Linux/macOS unchanged. Upstream builds only Linux and macOS. |
| Auth's own 75 migrations | apply cleanly |
| PostgREST v16.4 (same version as local) | official Windows build; needs `libpq.dll` etc. from Postgres's `bin` folder on `PATH` |
| Our 7 migrations + `seed.sql` | apply unchanged |
| pgTAP, `supabase/tests` | **13/13 files, 203/203 tests** (same count as `pnpm db:test` on Docker) |
| `pnpm bootstrap:admin --remote` against it | works (Auth admin API through the proxy) |
| Web e2e suite (`apps/app/e2e`, 20 tests, 12 workers) against it | **20/20 in 8 runs out of 8** after the pool fix below; about 9-10 s per run (Docker: 13-15 s) |

What it needs that Supabase's Docker image gives for free (all in `compat.sql`): the `supabase_admin`
superuser, `postgres` as a non-superuser that owns the database, `anon` / `authenticated` /
`service_role` / `authenticator`, `supabase_auth_admin` owning its objects in `auth`, default
privileges that let `postgres` use Auth's tables, the `extensions` schema with `pgcrypto` and
`uuid-ossp`, and the `public` defaults of a new Supabase project.

Problems found, and what the offline installer must do about them:

- **Auth must keep idle database connections on Windows:** set `GOTRUE_DB_MAX_IDLE_POOL_SIZE`
  (here 10, with `GOTRUE_DB_MAX_POOL_SIZE` 20). The default is 0, so every Auth request opened a new
  connection, and on Windows each one is a new Postgres process plus a SCRAM login. Under 12
  parallel browsers `/token` took up to 4.5 s and `/user` 1.5-2 s, and 2-10 of the 20 e2e tests
  timed out per run. With the pool: 0 failures in 8 runs.
- **The Auth patch has to be re-applied for every Auth upgrade** (or upstreamed: it is a small,
  clean change). The offline edition pins the Auth version; the cloud upgrades by itself, so the
  e2e suite should run against both (planned for 1f).
- **The EDB zip's `postgres.exe` is not Authenticode-signed** (the EDB installer is). The installer
  phase should ship signed binaries or check a known checksum.
- **Signing keys:** the spike uses one HS256 secret (Auth signs, PostgREST verifies). Local and cloud
  Supabase use ES256 keys plus `sb_publishable_` keys that their gateway turns into JWTs. The app does
  not care: with an anon JWT as its "publishable key" everything works. `gym-server` can keep it
  that simple.
- **Starting Postgres from Node:** `pg_ctl start` must get `stdio: 'ignore'`; otherwise the server
  inherits the pipes and `spawnSync` waits until Postgres stops.

### 2. Staff admin in both editions: recommended design A; **the user chose design B**

> **Decision (2026-10-10): design B**, the official Auth admin API from one shared TypeScript
> module (Edge Function online, `gym-server` route offline), with compensation if the staff row
> fails. The design A analysis below stays for reference.

Both designs were built and run against **both** backends: the Windows stack (offline edition) and
the local Supabase in Docker (same image and Auth version as the cloud). `staff-admin-test.mjs`
checks each one through real logins: create, log in, see own profile, `must_change_password` set,
refused for a receptionist, duplicate and invalid usernames, reset (old password and old session
stop working, new one works), deactivate (login and refresh refused with `user_banned`),
reactivate. **All checks pass for both designs on both backends.**

**Design A: Postgres functions** (`staff-admin-a.sql`). The manager calls an RPC with their own
session. The function writes `auth.users` / `auth.identities` (password hashed with `pgcrypto`
bcrypt, which Auth reads), removes `auth.sessions` on reset or deactivation, sets `banned_until`,
and inserts the staff rows, **all in one transaction**.

- One implementation for both editions, in SQL, tested with pgTAP like every other rule.
- All or nothing: an invalid username left no Auth user behind.
- The existing guards run unchanged (`is_system_context()` reads the JWT role, not the database
  role), so `cannot_grant_role`, branch limits and so on still apply.
- No secret key on any server, no Edge Function, no `gym-server` endpoint to build first.
- Fits the project rules: server logic in Postgres functions; multi-row operations are one
  function.
- Risk: it writes Supabase Auth's own tables, which Supabase treats as internal. Auth upgrades on
  the cloud could change them. Kept small: only `users`, `identities` and `sessions`, and the few
  columns listed in the file. Guard it with a pgTAP test that checks those columns, and the e2e
  suite against both backends in CI.
- Gotchas found: `banned_until = 'infinity'` breaks Auth ("Database error querying schema"), so use
  a finite date (100 years, as the admin API does). Token columns must be `''`, not null.
- On the Supabase image `postgres` (not a superuser) has insert/update/delete on these tables;
  checked locally. **Confirm on the cloud project before 1e** with a read-only query:
  `select has_table_privilege('postgres','auth.users','INSERT'), has_table_privilege('postgres','auth.identities','INSERT'), has_table_privilege('postgres','auth.sessions','DELETE');`

**Design B: the Auth admin API with the secret key.** An Edge Function online, a `gym-server`
endpoint offline (`admin.createUser`, `updateUserById({ password })`,
`updateUserById({ ban_duration })`).

- Uses Supabase's public API, so it is safe from changes inside Auth.
- Two runtimes to build and deploy (Deno online, Node in `gym-server`), and the secret key on both
  servers.
- Not atomic: the Auth user and the staff row are separate requests, so a failed second step
  needs clean-up code.
- The offline `gym-server` would have to exist before the 1e screens.

**Recommendation: A.** It gives one tested implementation, true all-or-nothing behaviour and no
secrets on the servers, and the spike showed it working on both editions. B stays the fallback if
the cloud check above fails or Supabase starts blocking writes to `auth`. Moving to B later only
changes the server side: the screens call the same three operations either way. The username
change ("the staff service also changes the login") fits the same pattern: update `auth.users.email`
and the identity in the same function. The planned multi-tenant step can use these functions too
(the gym scope becomes one more check).

### 3. Flaky web e2e tests: not flaky any more

Against the local Supabase in Docker (`pnpm --filter @gym/app test:e2e`, 20 tests, 12 workers,
retries off): **8 runs, 160 test runs, 0 failures**. 6 runs were on a quiet machine and 2 while Go
was compiling Auth. The only failures seen in the whole spike were on the Windows stack before the
pool fix, and that cause is understood and fixed.

## Files

| File | What it is |
|---|---|
| `build-auth.ps1` | builds Supabase Auth for Windows (applies `auth-windows.patch`); Go caches stay in `F:\spikes-tools` |
| `auth-windows.patch` | the `SO_REUSEPORT` patch for Auth v2.197.0 |
| `compat.sql` | the Supabase roles, schemas and privileges, copied from the supabase/postgres image |
| `spike.mjs` | `init` / `start` / `stop` / `keys` / `pgtap` / `psql` for the stack (ports 55432, 55499, 55430, proxy 55421) |
| `e2e-windows-stack.mjs` | copies `apps/app/e2e` to `F:\spikes-tools\e2e`, points it at the stack, builds, runs Playwright |
| `staff-admin-a.sql` | design A functions (loaded and dropped again by the test) |
| `staff-admin-test.mjs` | runs designs A and B against `windows` or `docker` |

To run it again (after the tools are unpacked as described below):

```
powershell -File spikes\windows-auth\build-auth.ps1
node spikes/windows-auth/spike.mjs init
node spikes/windows-auth/spike.mjs start          (leave running; Ctrl+C stops it)
node spikes/windows-auth/spike.mjs pgtap
node spikes/windows-auth/e2e-windows-stack.mjs
node spikes/windows-auth/staff-admin-test.mjs windows
node spikes/windows-auth/staff-admin-test.mjs docker   (needs pnpm db:start)
```

## What was installed, and removing everything

Everything is in **`F:\spikes-tools`** (about 2.5 GB): `go\` (Go 1.27.2), `pgsql-17\` (Postgres
17.11), `postgrest\` (v16.4), `src\auth\` (Auth source), `auth\auth.exe`, `gopath\`, `gocache\`,
`goenv`/`appdata\`/`localappdata\` (Go's settings and telemetry, redirected there), `pgdata\` (the
test database), `logs\`, `dist\` and `e2e\` (the e2e copy), `downloads\` (the three zips),
`spike-secrets.json` (random local passwords and the JWT secret; local only).

No Windows services, no startup entries, no PATH or environment changes, nothing in
`%USERPROFILE%`. The one stray folder, Go telemetry in `%APPDATA%\go` from a first `go version`,
was removed again.

To remove it all:

1. Stop the stack: `node spikes/windows-auth/spike.mjs stop` (or Ctrl+C in its window).
2. Delete the e2e junction first if it exists, because it points at `apps\app\node_modules`:
   `cmd /c rmdir F:\spikes-tools\e2e\node_modules` (removes only the link).
3. Delete the folder: `cmd /c rd /s /q F:\spikes-tools`
4. In the repo: delete `spikes\windows-auth\` if you don't want to keep it.
5. Optional: the staff-admin test left audit-log rows in the local Docker database (audit logs are
   append-only); `pnpm db:reset` clears them along with everything else.
