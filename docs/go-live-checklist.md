# Before the first real gym

Everything that must be done before a real gym gets the app (online or offline). **No build goes to a real gym without the user's explicit OK** (decided 2026-10-30), even when every item here is ticked.

"You" is the user (Click Group). "Claude" is Claude Code in this repository. Claude never sees passwords, keys or tokens: whatever needs one is done by you, in a terminal or a dashboard, and never pasted into the chat.

| # | Item | Who | Costs money |
|---|---|---|---|
| 1 | [Supabase Pro](#1-supabase-pro) | You | Yes, $25/month |
| 2 | [Vercel Pro](#2-vercel-pro) | You | Yes, $20/month |
| 3 | [Make the repository private](#3-make-the-repository-private) | You, then Claude | No |
| 4 | [Rotate every secret that was ever exposed](#4-rotate-every-secret-that-was-ever-exposed) | You | No |
| 5 | [A narrower GitHub token](#5-a-narrower-github-token) | You | No |
| 6 | [A custom domain](#6-a-custom-domain) | You, then Claude | Yes (the domain, if not owned yet) |
| 7 | [Check the cloud project's settings](#7-check-the-cloud-projects-settings) | You, with Claude | No |
| 8 | [The Android signing key and the release APK](#8-the-android-signing-key-and-the-release-apk) | You, then Claude | No |
| 9 | [Where Windows updates are published](#9-where-windows-updates-are-published) | You decide, Claude builds | No |
| 10 | [The offline installer test](#10-the-offline-installer-test) | You, then Claude | No |
| 11 | [A real 80mm printer and ACR122U with the final EXE](#11-a-real-80mm-printer-and-acr122u-with-the-final-exe) | You, then Claude | Only if you don't have them |
| 12 | [The Kurdish review](#12-the-kurdish-review) | You, then Claude | No |
| 13 | [The license smoke test](#13-the-license-smoke-test) | You | No |
| 14 | [Android NFC (step 2g)](#14-android-nfc-step-2g) | Claude, tested by you | Only if you have no NFC phone |
| 15 | [Clean up test gyms on the cloud](#15-clean-up-test-gyms-on-the-cloud) | You decide, Claude helps | No |
| 16 | [The final release and the first gym](#16-the-final-release-and-the-first-gym) | Claude builds, you approve and hand over | No |

---

## 1. Supabase Pro

**Who:** you. **Why:** a free project is paused after a week without use and has no daily backups. A gym's members, payments and cash register live there.

**How:** Supabase dashboard → your organization → **Billing** → upgrade to **Pro**. Then Project Settings → **Database → Backups**: daily backups should be listed from the next day. (Point-in-time recovery is a paid add-on; not needed for the first gym.)

**Done when:** the plan shows Pro and the first daily backup exists.

## 2. Vercel Pro

**Who:** you. **Why:** Vercel's free Hobby plan is for non-commercial use only; selling the app to gyms is commercial. Pro also raises the bandwidth limit.

**How:** Vercel dashboard → the gym app's project → **Settings → Billing** (or create a Pro team and move the project into it: Project → Settings → General → Transfer). After a transfer, check the Git integration still deploys `main` (push nothing; look at the last deployment) and that the environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) came along.

**Done when:** the project is on Pro and `pnpm release:check-live` passes.

## 3. Make the repository private

**Who:** you, then Claude. **Why:** `miraann/gym-spa` is **public** today (checked 2026-10-30), although `CLAUDE.md` said private. Claude checked the whole git history on 2026-10-30: no secret key, database password, GitHub token or private key was ever committed, so nothing needs rotating because of the repository itself. But the code shows how the security works, and competitors can copy it.

**How:** GitHub → the repository → **Settings → General → Danger Zone → Change visibility → Make private**.

**Then Claude:** checks that Vercel still deploys, that GitHub Actions still runs (private repositories get 2,000 free Actions minutes a month on GitHub Free: the checks run on the release pull request and on `main`, about 10 minutes each, so a few releases a month fit easily), and fixes `CLAUDE.md`.

**Done when:** the repository page shows "Private" and the next release's checks ran.

## 4. Rotate every secret that was ever exposed

**Who:** you (`CLAUDE.md`: rotating secrets and keys always needs you). Claude only checks afterwards that everything still works. Do these one at a time and check each before the next.

| Secret | Where to rotate it | Then update | Check |
|---|---|---|---|
| **Database password** | Supabase → Project Settings → **Database → Reset database password** | `SUPABASE_DB_URL` in `supabase/.env.local` (on your PC only) | `pnpm release:migrations` (a dry run) connects |
| **Secret key** (`sb_secret_…`) | Supabase → Project Settings → **API Keys** → create a new secret key, then **delete the old one** | `SUPABASE_SECRET_KEY` in `supabase/.env.local`. The Edge Functions get their keys from Supabase itself: nothing to set | `pnpm smoke:staff-admin --remote` |
| **Legacy keys** (`anon`, `service_role`) | Supabase → API Keys → **Legacy API keys** → disable them, if they are still on | Nothing: the app uses only the publishable key | The live site logs in |
| **Platform admin password(s)** | Seller panel: the other platform admin resets your password («reset password»), you choose a new one at the next login. With only one admin: `pnpm platform-admin:reset-2fa --email <address> --password --remote` (prints a temporary password once) | Your password manager | You log in to the seller panel with two-step login |
| **Two-step login and recovery codes** (if the authenticator's QR code or a recovery code was ever shown to anyone) | Seller panel: reset two-step login and set it up again; make a new set of recovery codes | Store the codes offline | Log in again |
| **GitHub token** | See item 5 | | |
| **Supabase personal access token** (used by `license:new-key` and the CLI), only if it was ever pasted anywhere | supabase.com → Account → **Access Tokens** → revoke, make a new one | Type it only when a script asks (hidden) | `pnpm --filter @gym/supabase exec supabase projects list` |
| **The demo gym's Owner password on the cloud**, if it was ever shown in a chat | Gym app → Staff → reset password | | |

Never rotated, because they were never exposed: the license signing key (only on your USB stick and in the project's secret), and the Android signing key (made in item 8).

**Done when:** each row is done and its check passed.

## 5. A narrower GitHub token

**Who:** you. **Why:** `gh` uses a classic token today, which can delete repositories and manage organizations. Releases need much less.

**How:**
1. github.com → Settings → Developer settings → **Fine-grained tokens → Generate new token**. Name `gym-spa claude`, expiry 90 days, **Only select repositories: miraann/gym-spa**. Repository permissions:
   - **Contents: Read and write** (push branches)
   - **Pull requests: Read and write** (open and merge the release pull request)
   - **Workflows: Read and write** (only needed when `.github/workflows` changes; leave it out and add it when needed if you prefer)
   - **Actions: Read**, **Commit statuses: Read** (see whether the checks passed)
   - Metadata: Read (added by itself)
2. In a terminal: `gh auth login --hostname github.com --git-protocol https --with-token`, paste the token, Enter. Never paste it into the chat.
3. `gh api repos/miraann/gym-spa --jq .permissions.push` prints `true`.
4. github.com → Settings → Developer settings → **Tokens (classic)** → delete the old token.

**Done when:** the classic token is gone and Claude can push a branch (Claude tries with `--dry-run`).

## 6. A custom domain

**Who:** you buy and connect it, then Claude updates the code. **Why:** gyms should open `app.<your domain>`, not a `vercel.app` address, and the address must not change after the first gym starts.

**Do it before the first gym:** each web address keeps its own storage. When the address changes, every browser and installed web app must log in again and every device must be registered again. (The Windows and Android apps carry the app inside them and are not affected; only the Windows update address is, item 9.)

**How (you):**
1. A domain you own (the app ID `site.clickgroup.gymspa` suggests `clickgroup.site`).
2. Vercel → the project → **Settings → Domains → Add** `app.clickgroup.site` (for example). Add the DNS record Vercel shows (a CNAME) at your domain registrar. Wait until Vercel shows "Valid Configuration".
3. Make it the production domain; keep the `vercel.app` address redirecting to it.
4. Supabase → **Authentication → URL Configuration → Site URL**: the new address.

**Then Claude:** changes the address in `release:check-live` and the README, checks the `?gym=` login links and the seller panel at `/seller/` on the new domain, and checks the security headers.

**Done when:** `https://app.<domain>` and `https://app.<domain>/seller/` load with a valid certificate and `pnpm release:check-live` passes against it.

## 7. Check the cloud project's settings

**Who:** you look in the dashboard; Claude tells you what to expect.
- **Authentication → Auth Hooks:** "Customize Access Token" points to `auth_hooks.custom_access_token` and is on (README → The Auth hook). Test: lock a test gym in the seller panel, its Owner's login is refused with the "gym locked" message; reactivate it.
- **Authentication → Multi-Factor:** TOTP on.
- **At least two platform admins**, both with two-step login and their recovery codes stored offline (README → Platform admins). The panel warns while there is only one.
- **Edge Functions:** `staff-admin` and `seller-admin` deployed from the latest release; the secret `LICENSE_SIGNING_KEY` is listed.
- **pg_cron jobs** (Database → Cron): the night locker release and `collect_reminders` are listed and their last runs succeeded.

## 8. The Android signing key and the release APK

**Who:** you make the key and build; Claude built the scripts (Phase 11, step 11b). **Why:** every update of the Android app must be signed with the same key forever. A lost key means the app can't be updated on the gyms' tablets (they would have to uninstall it, which deletes the device's login). A leaked key lets anyone make an "update" of the app.

**How (you, on your own PC, in a terminal):**
1. Put your USB stick in (say it is `E:`).
2. `pnpm android:new-key --backup-dir E:\`. It asks for a password twice (hidden, at least 12 characters), makes the key in `%USERPROFILE%\.gym-spa\android\` (outside the repository), writes one encrypted backup to the USB stick, checks the backup opens again, and writes only the key's **public** fingerprint into the repository. Keep the password in your password manager, never next to the USB stick.
3. `pnpm android:release`: asks the password (hidden), builds the signed APK and AAB into `apps/app/release/`, and checks they are signed with that key.
4. Tell Claude: Claude commits the fingerprint file.
5. On a real Android tablet or phone: install the APK (allow "install unknown apps" for your file manager), log in, unlock with the PIN, check in a member. While doing that, with the device on USB: `adb logcat | findstr /i "token refresh_token access_token"` must print nothing (spec §8, Phase 11 release checklist).

If the PC is lost: `pnpm android:restore-key --file E:\gym-spa-android-key-….gsakey` on the new PC.

**Done when:** the signed APK runs on a real device and logcat shows no tokens.

## 9. Where Windows updates are published

**Who:** you decide; Claude sets it up. **Why:** the online edition's Windows app updates itself (Phase 11, step 11c): it downloads new versions from one fixed HTTPS address. It must be free, reliable and reachable from Iraq, and nobody but you may be able to put files there. The offline edition never updates itself (USB only).

**Options** (Claude's recommendation first):
1. **GitHub Releases of a separate public repository** (e.g. `miraann/gym-spa-releases`, holding only installers, no code): free, fast, and the token in item 5 would also need that repository. The app gets a fixed address like `https://github.com/miraann/gym-spa-releases/releases/latest/download/`.
2. A folder on your Vercel domain (`https://app.<domain>/downloads/windows/`): simple, but each installer (about 110 MB) counts against Vercel's bandwidth.

Updates are checked against the SHA-512 in the update file, over HTTPS. Without a code-signing certificate, Windows doesn't check the publisher, so whoever can upload to that address can ship an update: protect that account with two-step login.

Each version uploads three files there: `latest.yml`, the installer and its `.blockmap` (README → Windows app → Updates).

**Done when:** you chose one; Claude builds the release with that address and an update from version N to N+1 is tried on a test PC (install N, publish N+1, the notice appears within an hour or at the next start, pressing it installs and reopens the app).

## 10. The offline installer test

**Who:** you, with [installer-test.md](installer-test.md); then Claude fixes what you report. **Done when:** every step there is `OK` on a real or virtual PC pair.

## 11. A real 80mm printer and ACR122U with the final EXE

**Who:** you, with the final Windows installer from item 16 (online, and offline if a gym will use it); Claude fixes what you report.

1. **Printer:** install the printer's Windows driver, then in the app: Settings → this device → receipt printer, "print without asking". Sell a subscription with a payment: the receipt prints at once, no dialog, 80mm wide, Kurdish text right-to-left and readable (not boxes), logo, numbers, invoice number like `B1-000123`, the receipt footer. Print a cash register shift report. Try the same in English.
2. **ACR122U:** plug it in: the reader test (cards screen) says it is connected. Give a card to a member; check in with it (green light and one beep, the member's photo), an unknown card (red twice). Leave a card lying on the reader and restart the app: it does **not** check in by itself. Unplug and plug the reader while the app runs; put the PC to sleep and wake it: it keeps reading.
3. **Kiosk:** the door screen in full screen (F11) from 2 meters away.

**Done when:** all of this works, and you sent Claude a photo of a printed receipt.

## 12. The Kurdish review

**Who:** you fill in [kurdish-review.md](kurdish-review.md) (one table, an `OK` or your wording per row); Claude applies it everywhere, updates the glossary, and releases. **Done when:** every row has an answer and the release with the changes is live.

## 13. The license smoke test

**Who:** you: `pnpm smoke:license --remote` (you said you'd run it), and tell Claude the result. **Done when:** it passes.

## 14. Android NFC (step 2g)

**Who:** Claude builds it; you test it. Needed only **before a gym uses phones or tablets to read cards** (spec: postponed 2026-10-22 because it needs a real NFC Android device). A gym that reads cards only on Windows (ACR122U) can start without it. **Done when:** a card is read on a real Android device at check-in and on the cards screen.

## 15. Clean up test gyms on the cloud

**Who:** you decide; deleting real data always needs you. The cloud project has the `demo` gym and any test gyms (smoke tests, the installer test). They don't hurt other gyms (each gym only ever sees its own data), but they count in the seller panel. Options: lock them (keeps the data, nobody can log in), or leave them. Revoke the installer test's license (installer-test.md, step 12).

## 16. The final release and the first gym

**Who:** Claude builds; you approve and hand it over.
1. Claude releases Phase 11 with the release flow (`CLAUDE.md`), after items 1–13 (and 14 if the gym uses phones for cards): the web app on the custom domain, the release-signed APK (you run `pnpm android:release`, item 8), the Windows installer (`pnpm desktop:exe` with the update address from item 9), and the offline installer if needed.
2. You create the gym in the seller panel (code, Owner, limits, paid until; or for an offline gym its license), and give the build to the gym **only after you say so explicitly**.
3. The install guide for the gym's PCs and tablets: [install-guide.md](install-guide.md) (step 11d), including Windows' SmartScreen warning (**More info → Run anyway**). On Windows 11 PCs with **Smart App Control** on, unsigned apps can't be installed at all: check the gym's PCs before the visit (install guide → Troubleshooting); if that is common, a code-signing certificate becomes worth buying.
