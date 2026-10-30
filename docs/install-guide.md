# Installing the app at a gym

For whoever sets up a gym's PCs, tablets and phones (Click Group). Every build that goes to a real gym needs the user's explicit OK first (`docs/go-live-checklist.md`).

| The gym uses | Install | Section |
|---|---|---|
| A browser on any PC, tablet or phone | nothing: the web address | [1](#1-the-web-app) |
| Windows PCs (reception, kiosk, cash register) with internet | `gym-spa-setup-<version>.exe` | [2](#2-windows-online-edition) |
| Android tablets or phones | `gym-spa-<version>.apk` | [3](#3-android) |
| No internet: one server PC and other PCs on the gym's network | `gym-spa-offline-setup-<version>.exe` | [4](#4-offline-edition-no-internet) |

## 0. Before the visit

1. **The gym exists** in the seller panel (`/seller/`): its code (3–20 of `a-z 0-9 -`, permanent), its name, its Owner (the username; the temporary password is shown once: write it down), its limits (branches, devices) and "paid until". For an offline gym: its license instead (section 4).
2. **Bring:** the installers on a USB stick (the Windows one, the APK, and the offline one if needed), the gym code, the Owner's temporary password, and for card readers the ACS driver (below).
3. **Check what the gym has:** Windows 10 or 11, 64-bit; Android 7 or newer for tablets and phones; a working internet connection for the online edition.

## 1. The web app

1. Open `https://<the app's address>/?gym=<gym code>` in Chrome or Edge. The `?gym=` part fills in the gym code, so staff only type their username and password.
2. The first login on a device must be done by someone who may register devices (the Owner or a manager): the app asks to register the device, with a name (e.g. "Reception 1") and its branch. Every device counts toward the gym's device limit.
3. To use it like an app: Chrome or Edge → the install icon in the address bar (PC), or ⋮ → **Add to Home screen / Install app** (Android).

The web app can't read ACR122U-type card readers (only keyboard-type ones). PCs with an ACR122U use the Windows app.

## 2. Windows (online edition)

1. Copy `gym-spa-setup-<version>.exe` to the PC and double-click it.
2. **Windows SmartScreen** shows a blue window, **"Windows protected your PC"**, because the installer isn't code-signed yet. Click **More info**, check that the app name is `gym-spa-setup-<version>.exe`, then click **Run anyway**. (No "Run anyway" button: see [Troubleshooting](#troubleshooting).)
3. It installs for the current Windows user, without asking for an administrator, and opens. A shortcut «جیم و سپا» is on the desktop and in the Start menu.
4. First login: the gym code, the username and the password; then register the device (as in section 1). The Owner's first login asks for a new password.
5. **Receipt printer (80mm):** install the printer's Windows driver first. Then in the app, on this PC: Settings → the device's printer, choose it, and turn on printing without asking. Print a test receipt.
6. **Card reader (ACR122U):** install ACS's **Unified PC/SC Driver** (acs.com.hk → ACR122U → Downloads), plug the reader straight into the PC (not through a hub), and open Settings → خوێنەری کارت: it shows the reader as connected. Hold a card to it to check. (README → NFC cards and readers has the details, including the harmless "driver was not installed" message Windows may show for each card.)
7. **Updates come by themselves:** when a new version is downloaded, a notice appears at the top of the app; staff press «نوێکردنەوە» when it suits them (the app closes, updates and opens again, locked). A version already downloaded also installs when the app is closed.

## 3. Android

Gyms get the APK directly; the app isn't in the Play Store yet.

1. Copy `gym-spa-<version>.apk` to the tablet or phone (USB cable, or a shared folder), and open it in the **Files** app.
2. Android asks to allow installing apps from this source: **Settings → Allow from this source** (on some devices: Settings → Apps → Special app access → **Install unknown apps** → Files → Allow). Go back and tap **Install**.
3. **Google Play Protect** may say the app is unknown or "not scanned": tap **More details → Install anyway** (never "Send for scanning" with a real gym's build).
4. Open «جیم و سپا», log in with the gym code, and register the device (as in section 1).
5. Afterwards, turn "Install unknown apps" off again for the Files app.
6. **Updates:** install the newer APK over the old one in the same way; logins and the device's registration stay. **Never uninstall** the app to update it: that removes this device's login and it must be registered again. A device that had a test (debug) build must uninstall that once before the first real install.

Card reading with the tablet's or phone's own NFC isn't available yet (step 2g). Until then, use a USB keyboard-type reader on Android, or read cards on a Windows PC.

## 4. Offline edition (no internet)

One PC is the **server** (it keeps all the gym's data); every other PC connects to it over the gym's network. All PCs must run the same version.

1. **Before the visit:** in the seller panel make the gym as an offline gym and issue its license (yearly, or perpetual with "updates until").
2. **On the server PC** (a PC that is always on, with a fixed place on the network): run `gym-spa-offline-setup-<version>.exe` (SmartScreen as in section 2; it asks for an administrator), and choose **«ئەم کۆمپیوتەرە سێرڤەرەکەیە»**. Set the network as **Private** (Settings → Network & internet → the connection → Network profile type), or the other PCs can't reach it.
3. Open the app on the server PC → **«ئەم کۆمپیوتەرە سێرڤەرەکەیە»** → it shows its **machine code**. Send it to Click Group (or enter it yourself in the seller panel's «کۆمپیوتەری سێرڤەر» part): you get the **activation code**. Put the license and the activation code in, then make the Owner (their temporary password is shown once).
4. **On every other PC:** run the same installer, choose **«بەستنەوە بە سێرڤەرەوە»**, open the app, choose the server it finds, check that the **server identity** matches the one on the server's Settings → سێرڤەر, and type the 6-digit **connection code** made there.
5. **Backups:** on the server, Settings → سێرڤەر: set a second folder on a USB stick that stays in the server PC, and press «ئێستا کۆپی یەدەگ بکە» once to check.
6. **Updates come on a USB stick:** run the newer installer on the server PC first, then on every other PC.

README → Offline edition has the details (restoring a backup, moving to a new server PC), and [installer-test.md](installer-test.md) walks through every step with what each screen shows.

## After installing: a 5-minute check

On each device: log in, check in a test member (by card if the device has a reader), sell something small with a cash payment and print the receipt, then void that sale. Lock the app and unlock it with the PIN.

## Troubleshooting

- **SmartScreen shows no "Run anyway" button:** the PC's organisation blocks unknown apps, or **Smart App Control** is on (Windows 11: Settings → Privacy & security → Windows Security → App & browser control → Smart App Control). Smart App Control blocks unsigned apps completely; it can be turned off there, but then it can't be turned on again without reinstalling Windows. Ask the gym before changing it; a code-signed build (not bought yet) would avoid this.
- **The antivirus removes or blocks the installer:** add an exception for the installer and for the app's folder (right-click the «جیم و سپا» shortcut → Open file location), and report the antivirus' name to Click Group.
- **"No connection" in the online edition:** the PC has no internet; nothing is saved until it comes back.
- **Offline: a PC doesn't find the server:** is the server's network Private, and is the server PC on? Type the server's address (its IPv4 address from `ipconfig`) instead.
- **Offline: "this PC's version differs from the server's":** install the same installer on that PC as on the server.
