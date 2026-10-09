# Build Prompt: Gym & Spa Management System (NFC-based)

## Your role
You are a senior full-stack engineer and database architect. Build a production-grade, secure, multi-branch **Gym & Spa Management System**. Work in phases (listed at the end). Before writing code for each phase, briefly state your plan, the tables/files you will touch, and any assumptions. Never skip migrations, RLS policies, or validation. Ask me only when a decision is truly blocking; otherwise pick a sensible default and note it.

## Tech stack (do not change without asking)
The system is sold in **two editions** (decided 2026-10-09, see §2.5): an **online edition** that always talks to Supabase in the cloud, and an **offline edition** for gyms without internet, where several Windows PCs talk to a server PC on the gym's local network. Both editions always need their server; neither keeps a local copy of the data.

- **Frontend app:** React + TypeScript + Vite (SPA, no SSR), TanStack Router, TanStack Query, Tailwind CSS, shadcn/ui, React Hook Form + Zod, TanStack Table, Recharts
- **One codebase, three targets now (iOS later):**
  - **Web / PWA** → deployed on **Vercel** as a static site, with a service worker (vite-plugin-pwa) caching the whole app so it opens fast (data always comes from the server). Add a `vercel.json` SPA rewrite so all routes serve `index.html`.
  - **Android (APK/AAB)** → **Capacitor 8+** wrapping the same Vite build
  - **iOS → NOT in scope now.** Do not create the `ios/` project yet, but keep all code iOS-ready (use Capacitor plugins that support iOS, no Android-only APIs in shared code) so iOS can be added later with `npx cap add ios`.
  - **Windows (EXE installer)** → **Electron** (via the Capacitor Electron platform or a minimal Electron shell) wrapping the same Vite build, with auto-update, kiosk/full-screen mode, auto-start on boot, and silent printing to 80mm thermal printers
  - Keep all platform-specific code behind small adapters in `/packages/platform` (`nfc`, `printer`, `camera`, `storage`, `updater`) so the React app never imports Capacitor/Electron directly
- **Data access:** supabase-js (PostgREST) + TanStack Query, directly against the server. No local database and no sync service.
- **Backend:** Supabase (Postgres, Auth, Row Level Security) for the online edition; the same migrations on the offline edition's server PC (Postgres for Windows + PostgREST + Supabase-compatible Auth). Supabase-only features (Storage, Edge Functions, pg_cron, Realtime) may be used only if the offline edition gets its own version of them.
- **Database logic:** business rules (check-in, pricing, locker assignment) are Postgres functions and triggers, the same in both editions and the final source of truth. A shared TypeScript package (`/packages/core`) holds what the screens need: validation, previews (e.g. prices), formatting.
- **Note:** newer Supabase projects do not expose `public` tables to the Data API by default — grant access explicitly in migrations where needed.
- **Languages (very important):** **Kurdish Sorani is the default language** of the whole system, with **English** and **Arabic** as additional languages. See section 0 for full rules.
- **Currency:** IQD default, optional USD with exchange rate stored per transaction
- **Timezone:** Asia/Baghdad; store all timestamps as `timestamptz` (UTC)

## Core concept
Every member gets an **NFC card** (MIFARE / NTAG). At the entrance, staff or a kiosk scans the card → the system identifies the member, checks the active plan, applies the rules, records the visit, and shows a clear result screen (green = allowed, red = denied with reason, yellow = warning such as "expires in 3 days").

---

## 0. Language & localization (applies everywhere)
- **Default language: Kurdish Sorani** (locale code `ckb`, RTL). The app opens in Kurdish on first launch on every platform (web, APK, EXE), before login and after.
- **Other languages:** English (`en`, LTR) and Arabic (`ar`, RTL).
- **Library:** `i18next` + `react-i18next`, translation files in `/packages/i18n/locales/{ckb,en,ar}/*.json`, split by feature (`common.json`, `members.json`, `checkin.json`, ...). Use typed translation keys so a missing key is a TypeScript error.
- **Never hardcode text** in components, error messages, toasts, Zod validation messages, PDF receipts, or notifications — everything goes through translation keys. Write the Kurdish text first; it is the source language.
- **Kurdish quality:** use simple, natural, everyday Sorani (not formal or machine-translated wording). Use correct Sorani letters (ە، ێ، ۆ، ڕ، ڵ، ڤ، ک، گ، ی) — never Arabic substitutes like ه or ي/ك.
- **Language switcher:** in the top bar and on the login screen. Each staff user's choice is saved in their profile and also cached on the device. Each device can also have a default language (e.g. kiosk screen always Kurdish).
- **RTL/LTR:** set `<html dir lang>` dynamically. Use only logical Tailwind classes (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`); mirror icons that show direction (arrows, chevrons); charts, tables, calendars, and date pickers must render correctly in RTL.
- **Fonts:** a clear Kurdish/Arabic font (e.g. Vazirmatn or Noto Sans Arabic, bundled locally — never loaded from the internet) + Inter for English. Test that all Sorani letters render correctly.
- **Numbers:** setting to show Latin digits (123) or Eastern Arabic digits (١٢٣); default Latin digits for clarity. Phone numbers, card UIDs, and invoice numbers always stay Latin and LTR.
- **Currency formatting:** IQD with thousands separators and no decimals (e.g. `25,000 د.ع`); USD with 2 decimals.
- **Dates:** Gregorian calendar, format per language, Asia/Baghdad time; Kurdish month names in Sorani.
- **Member data:** members choose a preferred language; SMS/WhatsApp reminders and printed/shared receipts use the member's language. Notification templates exist in all 3 languages.
- **Search:** member search must work with Kurdish, Arabic, and English input, and normalize similar letters (e.g. ي/ی، ك/ک، ه/ە) so the receptionist finds the member regardless of keyboard layout.
- **Database:** store user-entered text as-is (UTF-8); settings like plan names, service names, and product names have translations (`name_ckb`, `name_en`, `name_ar`, with Kurdish required and others optional, falling back to Kurdish).
- **Seed data:** demo data in Kurdish by default.

---

## 1. NFC integration
Support every platform behind one `NfcReader` interface (in `/packages/platform/nfc`):
1. **USB desktop reader (Windows EXE + web)** — e.g. ACR122U or any reader in keyboard-wedge (HID) mode that types the card UID + Enter. Build a focused, always-listening input on the check-in screen that captures fast keystroke bursts (< 50 ms between chars) and ignores normal typing. In Electron, optionally read the reader directly via PC/SC (`nfc-pcsc`) for more reliable scans.
2. **Android (APK)** — native NFC through a Capacitor NFC plugin (read tag UID in foreground). Android tablets can be used as a check-in kiosk.
3. **iOS (later phase)** — choose a Capacitor NFC plugin that also supports Core NFC, so iOS works later without rewriting.
4. **Web NFC API** — fallback for Android Chrome when running as a PWA (`NDEFReader`). Feature-detect and fall back to manual search.

Rules:
- Store the card UID **normalized** (uppercase hex, no separators) in `nfc_cards.uid` with a unique index.
- A member can have multiple cards over time, but only **one active** card. Support: assign, replace (lost/damaged, with optional fee), deactivate, blacklist.
- Never trust the UID alone for sensitive actions (payments, refunds) — require staff login.
- Manual fallback: search member by name/phone/member code if the card is forgotten (log it as `method = 'manual'`).

## 2. Check-in engine (most important part)
Implement as one Postgres function `check_in(card_uid, branch_id, method, device_id)`, called with `rpc()` and running in a single transaction (result in < 300 ms). It checks the rules and inserts the attendance row together, so two devices scanning at once can't both use the last visit. It returns a typed result object (parsed with Zod in the app). The staff member comes from the session (`auth.uid()`), never from the request.

**Important:** do NOT store "remaining visits" as a counter that gets decremented. Store attendance as append-only rows and compute `remaining_visits = plan_visits + adjustments - count(valid attendance)`.

Logic order:
1. Card exists, is active, not blacklisted → else deny `CARD_INVALID`
2. Member status is active (not suspended / banned) → else deny
3. Find the active subscription valid for this branch and today
4. Subscription frozen? → deny `PLAN_FROZEN`
5. Expired by date? → deny `PLAN_EXPIRED`
6. **Plan type rules:**
   - `time_based` (monthly, 3/6/12 months): allowed while `today <= end_date`
   - `visit_based` (e.g. 12 sessions): allowed if computed `remaining_visits > 0` (the new attendance row reduces it — no counter)
   - `hybrid` (e.g. 20 visits within 2 months): both rules
   - `unlimited` / `vip`
7. **Time window rules:** plan may restrict hours (e.g. morning-only, women-only hours) and days of week
8. **Anti-passback / cooldown:** if the same member checked in within the last N minutes (configurable, default 60), do NOT deduct another visit — return `ALREADY_CHECKED_IN`
9. **Daily limit:** max visits per day per plan (default 1 for visit-based)
10. **Outstanding debt:** if member owes more than a configurable amount → warn or deny (setting)
11. Insert `attendance` row (check-in time, branch, method, staff, plan snapshot)
12. Return: member photo URL, name, plan name, remaining visits / days, expiry date, warnings, assigned locker (if any), unpaid balance, birthday flag

Also implement `check_out(...)` (optional, for occupancy tracking and locker release) and a **live occupancy counter** (per branch, with cross-branch totals for managers).

## 2.5 Two editions & the server (applies to every module)
- **Online edition:** Web/PWA, Android and Windows, against Supabase in the cloud. **Always needs internet.**
- **Offline edition:** **Windows EXE only**, never uses the internet. Several PCs (reception, kiosk, cashier) share one **server PC on the gym's local network**, which runs Postgres + PostgREST + Supabase-compatible Auth as Windows services behind a small `gym-server` proxy. One installer with two modes ("This PC is the server" / "Connect to the server"), a pairing code per PC, encrypted LAN traffic (a certificate the server makes for itself), LAN discovery with a manual address fallback, daily automatic backups + restore, updates by installer on USB (server and PCs must run the same version).
- **One app, one set of migrations:** the app only knows one server address. The same end-to-end tests run against both servers.
- **No local data:** every screen reads and saves through the server under the acting staff member's own session. Without a connection the app shows a clear message (always-visible connection indicator: Connected / No connection / Server not responding, last check time, "Check again") and saves nothing.
- **IDs:** generate UUIDs on the client (never rely on server sequences for primary keys).
- **Invoice / receipt numbers:** given by the server per branch, e.g. `B1-000457`.
- **Multi-row operations** (payment + invoice + items + subscription, locker assignment, spa booking) are one Postgres function each, all-or-nothing.
- **Concurrency rules:**
  - Attendance, payments, stock movements, audit logs: append-only
  - Member profile edits: last write wins, with `updated_at` + `updated_by`
  - Locker assignment and spa room/therapist booking: constraints in Postgres; the second booking of the same slot/locker gets an error at once
  - Visit limits: checked and recorded in one transaction (`check_in`), so no double use
- **PIN switching on shared PCs:** a staff member logs in with their password once per device; others switch to them with a PIN. The server checks the PIN, counts wrong tries and locks it (a password login unlocks it); PIN hashes never leave the server.
- **Internet-only features** (online edition only; hidden in the offline edition): SMS/WhatsApp, online payment gateways, cross-branch cloud reports.
- **Photos:** Supabase Storage in the online edition, files on the server PC in the offline edition, behind one storage adapter.

## 3. Roles & permissions (RBAC)
Do not hardcode role checks in the UI only. Use a permission-based model:
- Tables: `roles`, `permissions`, `role_permissions`, `staff_users` (links to `auth.users`; **one role per staff member**; `all_branches` flag), `staff_branches` (join table — a staff member can be given access to several branches)
- Default roles: **Super Admin** (owner, all branches), **Admin**, **Branch Manager**, **Receptionist**, **Trainer**, **Spa Therapist**, **Accountant**, **Cashier**
- Permissions are granular strings, e.g. `members.create`, `members.delete`, `payments.refund`, `reports.financial.view`, `settings.edit`, `staff.manage`, `lockers.assign`, `discount.apply.max_10`
- Admin can create custom roles and toggle permissions from a matrix UI
- Enforce permissions in **three layers**: RLS policies (via a `has_permission(perm text)` SQL function), server-side validation (guards, Postgres functions), and UI (hide/disable, using the permissions from the last server check)
- Data is scoped by branch: a staff member only sees the branches they have access to — every branch if `all_branches` is true, otherwise the branches listed for them in `staff_branches`. One SQL function, `has_branch_access(branch_id)`, implements this rule for RLS
- Staff features: PIN quick-login for shared reception PCs, session timeout, force password change, deactivate account (never hard delete)

## 4. Modules

### 4.1 Members
- Profile: member code (auto, e.g. `GYM-000123`), full name, phone (unique, Iraqi format validation), gender, birth date, photo (captured from webcam or upload → Supabase Storage), address, emergency contact, blood type, medical notes / injuries, goals, body measurements history (weight, height, body fat, BMI auto-calc, with chart), referral source, notes, tags
- Waiver / terms acceptance with signature capture (canvas) and timestamp
- Tabs: Overview, Subscriptions, Attendance, Payments & Invoices, Spa Bookings, Locker, Measurements, Documents, Activity Log
- Family / group memberships (one payer, several members)
- Member statuses: active, expired, frozen, suspended, banned, archived
- Duplicate detection on create (same phone / similar name)
- Bulk import from Excel/CSV with validation preview

### 4.2 Plans & Subscriptions
- Plans: name, type (time / visit / hybrid / unlimited), duration, visit count, price, gender restriction, allowed hours/days, allowed branches, included services (e.g. 2 free spa sessions, sauna access, locker included), max freeze days, is_active
- Subscribe flow: select plan → start date → discount (respect role limit) → payment (full / partial / installments) → assign/confirm NFC card → print or WhatsApp receipt
- Renew, upgrade/downgrade (pro-rata calculation), **freeze/unfreeze** (extends end date automatically), transfer to another member (with permission), cancel with refund rules
- Plan snapshot stored on each subscription so later price changes don't affect old records

### 4.3 Payments & POS
- Payments linked to subscriptions, spa bookings, products, locker rent, card replacement, penalties
- Methods: cash, card, FIB / FastPay / ZainCash (manual reference field), bank transfer
- Partial payments, installments with due dates, member balance / debt tracking
- Invoices with sequential numbering per branch, printable (80mm thermal + A4) and shareable as PDF
- Refunds and voids require permission and a reason; never delete financial rows
- **Cash register / shift closing:** opening float, expected vs actual cash, difference report
- Small product shop: supplements, water, towels — with inventory, low-stock alerts

### 4.4 Lockers
- Locker map per branch (zones: men/women, numbered grid UI showing status by color)
- Types: **daily** (assigned at check-in, auto-released at check-out or closing time) and **rented** (monthly, paid, with expiry)
- Statuses: free, occupied, reserved, out of order, overdue
- Optional: link locker to NFC card (for smart locks later)
- Lost key fee, history per locker, report of lockers not released at end of day

### 4.5 Spa
- Services catalog: massage, sauna, steam, jacuzzi, facial, Moroccan bath, etc. — duration, price, gender, required room type, required staff skill
- Rooms/resources with capacity
- Therapists with skills and working schedule
- **Booking calendar** (day/week view, drag & drop) preventing double-booking of room AND therapist (enforce with Postgres exclusion constraint on `tstzrange`)
- Packages (e.g. 5 massages), and spa sessions included in gym plans (deduct from balance)
- Booking statuses: booked, confirmed, checked-in, completed, no-show, cancelled
- Walk-ins and bookings for non-members (guest profile)
- Therapist commission tracking

### 4.6 Classes & Trainers
- Group classes (yoga, zumba, CrossFit, etc.): schedule, capacity, trainer, room; members book a spot; waitlist
- Personal training packages: sessions, trainer, session log, remaining sessions
- Trainer commission and session reports

### 4.7 Staff & HR (basic) — built in Phase 7
- Staff profiles, roles, branch, salary type (fixed / commission / hourly)
- Staff attendance via their own NFC card (same reader)
- Shifts schedule

### 4.8 Notifications
- Expiry reminders (7 days, 3 days, expired), birthday messages, debt reminders, booking reminders
- Channels: in-app, SMS, WhatsApp (abstract behind a `NotificationProvider` interface; implement a log/mock provider first)
- Scheduled via Supabase cron (`pg_cron`) or Edge Functions
- Message templates editable in Kurdish/Arabic/English

### 4.9 Dashboard & Reports
- Dashboard: today's check-ins, live occupancy, today's revenue, active members, expiring this week, new members, debts, spa bookings today, hourly attendance chart
- Reports (filter by date range + branch, export to Excel/PDF): revenue by source, payments by method, attendance trends, peak hours heatmap, member retention / churn, plan popularity, staff performance, therapist/trainer commissions, outstanding debts, inventory, cash register differences, discount usage by staff

### 4.10 Settings
- Gym info, logo, branches, working hours, holidays
- Check-in rules (cooldown minutes, debt limit, deny/warn behaviour)
- Tax, currency, exchange rate, invoice footer, receipt layout
- Backup/export of all data

### 4.11 Audit log
- Every create/update/delete on important tables is recorded by a Postgres trigger: who, when, table, row id, old values, new values, IP/device
- Viewable by Admin only, filterable

---

## 5. Database design requirements
- Primary keys: `uuid` (`gen_random_uuid()`)
- Every business table has: `id`, `branch_id` (where relevant), `created_at`, `updated_at`, `created_by`, `deleted_at` (soft delete)
- Use Postgres enums or check constraints for statuses
- Money stored as `numeric(14,2)` — never float
- Indexes on: `nfc_cards.uid`, `members.phone`, `members.member_code`, `attendance(member_id, checked_in_at)`, `subscriptions(member_id, status, end_date)`, all foreign keys
- RLS **enabled on every table**, no table left open
- Views / materialized views for heavy reports
- Write all schema changes as numbered SQL migration files in `supabase/migrations`
- Provide a seed script with realistic demo data (Kurdish names, IQD prices, 2 branches, 200 members, 3 months of attendance)
- Generate TypeScript types from the database (`supabase gen types`)

Core tables (expand as needed):
`branches, staff_users, staff_branches, roles, permissions, role_permissions, members, member_measurements, member_documents, nfc_cards, plans, subscriptions, subscription_freezes, attendance, payments, invoices, invoice_items, installments, cash_registers, products, stock_movements, lockers, locker_assignments, spa_services, spa_rooms, spa_bookings, packages, member_packages, classes, class_sessions, class_bookings, trainers, pt_sessions, notifications, notification_templates, settings, audit_logs`

## 6. UI/UX requirements
- Clean, modern admin dashboard; sidebar navigation grouped by module; dark/light mode
- **Check-in screen**: full-screen, large text, member photo, big colored status, sound feedback (success/fail beep), auto-reset after 5 seconds, works on a tablet in kiosk mode
- Fast reception workflow: global search (Ctrl+K) by name, phone, code, or card scan from anywhere
- Every table: search, filters, sorting, pagination (server-side, through PostgREST), column visibility, export
- Forms: Zod validation, clear error messages in the user's language (Kurdish by default), confirmation dialogs for destructive actions
- Loading skeletons, empty states, toast notifications, optimistic updates where safe
- Fully responsive; reception works on desktop, managers check dashboard on phone
- Accessible (keyboard navigation, focus states, labels)

## 7. Code quality rules
- Strict TypeScript, no `any`
- Monorepo (pnpm workspaces): `/apps/app` (React + Vite app, with `android/` from Capacitor), `/apps/desktop` (Electron shell for the Windows EXE), `/packages/platform` (NFC, printer, camera, updater adapters per platform), `/packages/core` (validation and screen rules, pure TS, fully tested), `/packages/db` (generated types), `/supabase` (migrations, functions). Inside the app use feature folders (`/features/members`, `/features/checkin`, ...) with shared `/components/ui`, `/lib`
- Server-only Supabase service key never reaches the client
- All inputs validated with Zod in the app, and re-validated on the server (never trust client data)
- Reusable hooks and components; no duplicated logic
- Error handling with user-friendly messages + logged details
- Unit tests for the check-in engine and pricing calculations (pro-rata, freeze, installments); test edge cases: expired today, last visit, frozen, double scan, wrong branch, wrong hours
- Write a README with setup steps, env variables, NFC reader setup guide, and build steps for each target (Vercel deploy, signed `.apk`/`.aab`, Windows `.exe` installer)
- CI (GitHub Actions): build and deploy web on every push; produce the signed APK and Windows EXE as release artifacts

## 8. Build phases (do them in order, stop for my review after each)
1. **Foundation:** monorepo + Vite PWA + Vercel deploy + Capacitor (Android) + Electron (Windows) projects — debug APK and EXE build from day one, Supabase connection, connection indicator, PIN switching (checked by the server), i18n + RTL, auth, branches, RBAC tables + RLS + permission matrix UI, staff management, audit log trigger, layout & navigation
2. **Members & NFC:** member CRUD, photo capture, NFC card assign/replace, NFC reader abstraction, global search
3. **Plans, subscriptions & payments:** plans, subscribe/renew/freeze/upgrade, payments, invoices, receipts, debts, installments
4. **Check-in engine:** `check_in` function + tests, check-in kiosk screen, attendance list, live occupancy
5. **Lockers**
6. **Spa:** services, rooms, therapists, booking calendar, packages
7. **Classes, personal training & Staff HR:** group classes, personal training packages, trainer commissions, plus §4.7 Staff & HR (staff profiles with salary type, staff attendance via their own NFC card, shifts schedule)
8. **POS shop, inventory, cash register**
9. **Notifications & scheduled jobs**
10. **Dashboard, reports, exports, settings, backups**
11. **Release:** production Vercel deploy, signed Android APK/AAB, signed Windows EXE installer with auto-update
12. **Polish:** test on all 3 targets (web, Android, Windows), offline-edition tests (server PC + several PCs on a LAN, lost connection, concurrent bookings), performance, security review of every RLS policy, accessibility, final tests, README

13. **Later (separate request):** iOS build — `npx cap add ios`, Core NFC, TestFlight/App Store

At the end of each phase, give me: what was built, migrations added, how to test it manually, and known limitations.
