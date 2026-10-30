# Testing the offline installer on clean Windows PCs

The offline installer (`gym-spa-offline-setup-<version>.exe`) was built and its contents checked, but it has never been installed on a real Windows PC. This test does that before any gym gets it: one PC in **server** mode and one in **client** mode, on the same network.

It takes about 2–3 hours the first time (most of it installing Windows). Write down the result of every step (`OK`, or what you saw instead, with a screenshot) and send the list to Claude.

## What you need

- **Either** two spare Windows 10 or 11 PCs on the same network (wired or the same Wi-Fi), **or** one PC with at least 16 GB of memory and 100 GB free disk for two virtual machines.
- The installer, `apps/desktop/release/gym-spa-offline-setup-0.1.0.exe` (about 210 MB). To build it fresh: `pnpm desktop:exe:offline` on the build PC.
- The seller panel on the cloud (`/seller/`) with your platform admin login: you issue a license for a **test** gym there. Revoke it when the test is done (step 12).
- A notebook for the Owner's temporary password and the codes.

## 1. Prepare two virtual machines (skip if you use real PCs)

1. Install **VirtualBox** 7.1 or newer (free, virtualbox.org) and download the **Windows 11 ISO** from microsoft.com/software-download/windows11. Windows works without activation for this test; it only shows a watermark.
2. VirtualBox → **Tools → Network → NAT Networks → Create**. Name it `GymLan`, keep "Enable DHCP" on. Both machines go on this network: they see each other, and they have internet for Windows' own setup.
3. **New** machine `gym-server`: the ISO, type Windows 11, 4 GB memory, 2 CPUs, 64 GB disk. Leave "Skip unattended installation" unticked and type a user name and password: VirtualBox then installs Windows by itself with that local account. Before starting it: **Settings → Network → Adapter 1 → Attached to: NAT Network → GymLan**.
4. Start it and let Windows install. Then **Devices → Insert Guest Additions CD image**, run `VBoxWindowsAdditions.exe` from that CD, restart. Turn on **Devices → Shared Clipboard → Bidirectional** (to copy the codes in and out).
5. Make the second machine: shut `gym-server` down, right-click it → **Clone** → name `gym-reception`, "Full clone", MAC address policy "Generate new MAC addresses for all network adapters". Start the clone and rename it (Settings → System → About → **Rename this PC** → `RECEPTION`), restart.
6. Put the installer into each machine: **Settings → Shared Folders** → add the folder that holds the installer, read-only, auto-mount; it shows up in File Explorer as a network drive. Copy the installer to the Desktop.

## 2. Both PCs: make the network "Private"

On **both** PCs: Settings → Network & internet → Ethernet (or Wi-Fi) → **Network profile type: Private network**.

The server's firewall rules allow only private networks, so on a "Public" network the reception PC can't find or reach the server. That is intended. If you want to see it, do step 5 first with the server's network still Public: the server is not found. Then switch it to Private.

## 3. Server PC: install in server mode

| Step | Do | You should see |
|---|---|---|
| 3.1 | Double-click the installer. | Possibly the blue **"Windows protected your PC"** (SmartScreen: the installer isn't code-signed). Click **More info → Run anyway**. Files copied from a shared folder often skip this warning: also fine. |
| 3.2 | | The User Account Control prompt, publisher **"Unknown"**. Click **Yes**. |
| 3.3 | Go through the first page. | A page with **«ئەم کۆمپیوتەرە چۆن بەکاردێت؟»** and two choices, each with one Kurdish line under it. On a new PC **«بەستنەوە بە سێرڤەرەوە»** is chosen already. The buttons (Next, Install) are English: expected. Check the Kurdish is readable, not boxes or question marks. |
| 3.4 | Choose **«ئەم کۆمپیوتەرە سێرڤەرەکەیە»**, then Install. | Progress for 1–3 minutes, then the Finish page. **No** message box. If «سێرڤەرەکە دەستی پێ نەکرد…» appears, the service didn't start: go on with 3.5 and send the logs (step 13). |
| 3.5 | Open **Services** (Win+R → `services.msc`). | **Gym and Spa server** (GymSpaServer): Status **Running**, Startup type **Automatic (Delayed Start)**, Log On As **NT SERVICE\GymSpaServer**. |
| 3.6 | Open **Windows Defender Firewall with Advanced Security** (Win+R → `wf.msc`) → Inbound Rules. | **Gym and Spa server (HTTPS)** (TCP 47200) and **Gym and Spa server (discovery)** (UDP 47201), both Profile **Private**, Program `…\resources\server\node.exe`. |
| 3.7 | In File Explorer open `C:\ProgramData\gym-spa\server` (type it in the address bar). | Windows asks for administrator permission (only SYSTEM, Administrators and the service may open it). With permission: folders `pgdata`, `logs`, and files such as `tls-cert.pem`, `server-secrets.json`. |
| 3.8 | In Edge open `http://127.0.0.1:47213/server/v1/health`. | A short JSON text where every program (postgres, auth, postgrest) is running. |
| 3.9 | Open Command Prompt, run `ipconfig`. Write down the **IPv4 Address** (e.g. `10.0.2.4`). | |

## 4. Server PC: the first setup

| Step | Do | You should see |
|---|---|---|
| 4.1 | Start **جیم و سپا** from the Start menu (or the Finish page). | The screen **«بەستنەوە بە سێرڤەرەوە»**. |
| 4.2 | Choose **«ئەم کۆمپیوتەرە سێرڤەرەکەیە»**. | **«ڕێکخستنی سێرڤەر»** with **«مۆڵەتی جیم»** and the **machine code** (`XXXX-XXXX-XXXX-XXXX-XXXX`). Copy it. |
| 4.3 | On your own PC, in the seller panel: make a new **offline** gym for the test (code e.g. `vm-test`, a clear name like "تاقیکردنەوەی ئامێر"). | The gym is created ("جیمی ئۆفلاین دروست کرا…"). |
| 4.4 | In that gym: **«دەرکردنی مۆڵەت»**, yearly, last day about two months from today. | The license code, with "copy" and "download as file". |
| 4.5 | In the gym's **«کۆمپیوتەری سێرڤەر»** part: paste the machine code from 4.2. | "کۆدەکە دروستە" and an **activation code**. |
| 4.6 | Back on the server PC: paste the license code and the activation code (or open the downloaded files with «کردنەوە لە فایل»), then **«دانان»**. | **«مۆڵەتەکە دانرا.»**, then **«خاوەنی جیم»**. |
| 4.7 | Type a username (e.g. `owner`) and a full name, **«دروستکردن»**. | **«وشەی نهێنیی کاتی»**: the temporary password, shown only now. Write it down. |
| 4.8 | **«بڕۆ بۆ چوونەژوورەوە»**, log in as `owner` with that password. | **No gym code** is asked (the offline edition never asks). You choose a new password, register this PC as a device, and see the dashboard in Kurdish. No license warning (the license runs for two months). |
| 4.9 | **Settings → سێرڤەر**. | **«ناسنامەی سێرڤەر»** (`XXXX-XXXX`), **«کۆدی نوێی بەستنەوە»**, **«کۆمپیوتەرە بەستراوەکان»** (empty), and **«کۆپی یەدەگ»**. |

## 5. Reception PC: install in client mode and connect

| Step | Do | You should see |
|---|---|---|
| 5.1 | Run the installer as in 3.1–3.3, keep **«بەستنەوە بە سێرڤەرەوە»**, Install. | Finish, no message box. In `services.msc` there is **no** Gym and Spa server, and `wf.msc` has no Gym and Spa rules. |
| 5.2 | Start **جیم و سپا**. | **«بەستنەوە بە سێرڤەرەوە»**, and within a few seconds the server under **«سێرڤەرە دۆزراوەکان»** with the gym's name and **وەشانی 0.1.0**. If it never appears: is the server's network Private (step 2)? Then try 5.6. |
| 5.3 | Choose the server. | Its **identity** `XXXX-XXXX`. Compare it with the server's Settings → سێرڤەر: **they must be the same**. |
| 5.4 | On the server: **«کۆدی نوێی بەستنەوە»**. On the reception PC: name `Reception`, type a **wrong** code first. | **«کۆدەکە هەڵەیە.»** |
| 5.5 | Type the right code. | The login screen (no gym code). On the server, **«کۆمپیوتەرە بەستراوەکان»** now lists `Reception` (refresh the page). |
| 5.6 | (Only if 5.2 found nothing.) Type the server's address from 3.9 and **«پشکنین»**. | The same server card as in 5.2. Then 5.3–5.5. |
| 5.7 | Log in as `owner` with your new password; register this PC as a device. | The dashboard. |

## 6. Work on both PCs

| Step | Do | You should see |
|---|---|---|
| 6.1 | Reception: add a member, check them in by hand (**تۆمارکردنی هاتن**). | Saved, the check-in result. |
| 6.2 | Server: open the members list and the visits list. | The same member and the visit (refresh or wait for the timer). |
| 6.3 | Reception: open a cash register shift and sell a subscription with a cash payment; print or preview the receipt. | Saved; a receipt number like `B1-000001`. |
| 6.4 | Both: Settings → Display, switch to English and back. | Texts change; nothing breaks. |

## 7. Lost connection

| Step | Do | You should see |
|---|---|---|
| 7.1 | Reception VM: **Devices → Network → Connect Network Adapter** (untick). Real PC: unplug the cable or turn Wi-Fi off. | Within seconds the connection indicator says the server doesn't answer. Saving is disabled with a clear Kurdish message; nothing is queued. |
| 7.2 | Connect the network again. | Back to connected in a few seconds; saving works again without restarting the app. |

## 8. Backups and restore (server PC)

| Step | Do | You should see |
|---|---|---|
| 8.1 | Settings → سێرڤەر → **«ئێستا کۆپی یەدەگ بکە»**. | **«کۆپی یەدەگ دروست کرا.»** and a row in the list with its date and size. |
| 8.2 | Create the folder `C:\gym-backups-copy` in File Explorer. Put it into **«فۆڵدەری دووەم»**, save, and back up again. | Saved; after the backup, the same `.dump` file is in `C:\gym-backups-copy`. If saving or the copy fails, send the exact message: the service runs under its own account, and a normal folder may not let it write. (A USB stick, formatted FAT32/exFAT, has no such limits: try one too if you can.) |
| 8.3 | Add a member called `بۆ گەڕاندنەوە`. Then restore the backup from 8.1: **«گەڕاندنەوە»**, type the gym code. | **«کۆپییەکە گەڕێنرایەوە.»**; both PCs' apps start again locked. After logging in, `بۆ گەڕاندنەوە` is gone, the member from 6.1 is still there, and the list has a new **before-restore** backup. |
| 8.4 | Type a wrong gym code in a restore. | **«کۆدی جیم هەڵەیە.»**, nothing changes. |

## 9. Restart the server PC

| Step | Do | You should see |
|---|---|---|
| 9.1 | Restart the server PC and **don't** log in to Windows. Wait 3 minutes (the service starts "delayed"). | On the reception PC, the app works again by itself (indicator connected, data loads). |

## 10. Update (run the same installer again)

| Step | Do | You should see |
|---|---|---|
| 10.1 | Server PC: run the same installer again. | The mode page has **server** chosen already. After Finish: the service is running, the backups list has a **before-update** backup, your data and login still work. |
| 10.2 | Reception PC: run it again. | Client chosen already; it is still connected (no new pairing), data loads. |

(Refusing an update after a perpetual license's "updates until" is covered by the automatic tests; it can't be tried here because the seller panel only allows future dates.)

## 11. Remove a PC, uninstall, reinstall

| Step | Do | You should see |
|---|---|---|
| 11.1 | Server: Settings → سێرڤەر → remove `Reception`. | Reception can't load anything any more (it says it can't reach the server, or asks to connect again). Pair it again as in 5.3–5.5: works. |
| 11.2 | Server: Settings → Apps → Installed apps → **جیم و سپا → Uninstall**. | Uninstalled. `services.msc` has no Gym and Spa server, `wf.msc` no Gym and Spa rules, but `C:\ProgramData\gym-spa` **is still there**. |
| 11.3 | Install again in server mode. | No first setup: the license, the Owner and the data are all still there, and Reception works **without pairing again** (the server kept its certificate). |

## 12. Clean up

In the seller panel, **revoke** the test license («هەڵوەشاندنەوەی مۆڵەت», reason "test"). Keep or delete the virtual machines as you like.

## 13. What to send to Claude

- Your list of steps with `OK` or what you saw (screenshots for anything unexpected).
- If something failed on the server PC: the folder `C:\ProgramData\gym-spa\server\logs` and `C:\ProgramData\gym-spa\service-logs` (copy them out as an administrator, zip them). They contain no passwords; check before sending that no file is named `server-secrets.json` or `license.json` (those stay on the PC).
- Windows version (Win+R → `winver`) of each PC.
