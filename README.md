# StudyMed

A local-first Windows desktop app: a unified calendar, a personal life organiser, and a relational academic workspace. Everything is stored on this PC in SQLite — no account, no cloud.

## Install

Download `StudyMed_<version>_x64-setup.exe` from the [latest release](../../releases/latest). It's a per-user install, so it needs no admin rights. An `.msi` is attached too, if you prefer Windows Installer.

The installers aren't code-signed, so Windows SmartScreen warns the first time. Choose *More info → Run anyway*.

## Updates

Installed copies check GitHub for a new release 15 seconds after launch and every 3 hours after that, including while StudyMed sits in the tray. A new version downloads in the background. A banner then counts down 20 seconds and restarts StudyMed to install it. *Not now* puts it off until the window is next closed to the tray. Settings → Updates has a manual check.

Each update is signed with the project's updater key, and the app refuses one with a bad signature. Your data folder isn't touched by updates. If an update changes the database structure, a copy is saved to `backups\` first.

**To publish a release:**

```bash
npm run release
```

This bumps the patch version (`npm run release -- minor` or `-- 1.2.0` for others) in `tauri.conf.json`, `package.json` and `Cargo.toml`, then commits and pushes. [`.github/workflows/release.yml`](.github/workflows/release.yml) builds, tests, signs and publishes it as a GitHub Release with `latest.json`, which is what the app's updater reads. Pushing to `main` by any other route works the same way: CI releases whenever `main` has a version that hasn't been released yet. Changes pushed without a version bump are kept but not released.

The private signing key lives only at `%USERPROFILE%\.tauri\studymed.key` (its password is next to it) and in the repository's Actions secrets. **Back it up.** Without it, installed copies can't accept future updates.

## Make it yours

- **Themes:** Settings → Appearance. Six pastel palettes (Cotton Candy, Blossom, Lavender, Sky, Butter, Mint) and three "old money" palettes (Heritage, Estate, Bordeaux), each in light and dark.
- **Sidebar:** drag its right edge to resize, click the panel icon (or Ctrl+\\) to collapse it to icons, and switch between the **Personal** and **Academics** groups with the pills at the top.
- **Fonts:** Settings → Appearance. Headings default to EB Garamond (bundled). Other heading fonts and old-money pairs are there too. SF Pro Display and Cooper Black are used when they are installed on the PC.
- **Background:** Settings → Appearance → Background picks the scene: *Neurons* (firing cells), *DNA* (a to-scale B-DNA model in 3D), *Bloodstream* (3D red cells tumbling down a vessel), *X-ray* (a real chest radiograph on drafting paper, with a scan line and an ECG strip) or *Plain*. **Motion** switches any of them between animated and still. Animation pauses while the window is hidden, 3D scenes are capped at 40 fps, and Windows' "reduce animations" setting is respected.
- **Pages have fixed layouts.** List pages are sorted by the pages their records link to (All, Events, Relationships, Homework, Exams and so on).
- **Connect to a page** on a record links it to a record on another page, and the link shows from both sides. Choosing a module on homework, an exam, a note or a recall topic files it on that module's page.

## Study tools

- **Timetable:** add each class once and it repeats weekly, on the Timetable page and as the "Classes" layer on the calendar (which you can hide).
- **Goals:** daily or weekly tick goals with optional steps, such as "By Tuesday, revise HBS and INP". Ticks belong to their day or week, so each new period starts empty and nothing is deleted.

- **Grades:** official NP grade points and semester GPA ([source](https://www.np.edu.sg/admissions-enrolment/academic-matters)). NP does not publish mark ranges, so the cut-offs are editable estimates.
- **Study Routine:** 45 minutes per credit unit each week, scaled by target grade, difficulty, distance behind target and exam proximity. It is a rule of thumb, not NP guidance. The working is shown, and nothing is saved until you press Save.
- **Spaced Repetition:** recall on days 1, 3, 5, 7, 14, 21 and 28 after first learning, ticked by hand. Older flashcard decks stay reachable from that page when any exist.

## Where your data lives

`%APPDATA%\com.studymed.app\`

- `studymed.db` — the SQLite database (all records)
- `backups\` — an automatic copy of the database, made before an app update changes its structure
- `files\` — attachments, pasted note images, photos, wishlist thumbnails

**Settings → Data & backup** shows these paths and creates a consistent database snapshot. Copy the `files` folder too for a complete backup.

## Security model

- **Master password / PIN** → Argon2id (19 MiB, 2 passes) → 256-bit key → **AES-256-GCM**.
- The password is never stored; only an encrypted verifier is. The key lives in Rust memory while unlocked and is wiped on lock or after the auto-lock timeout (configurable in Settings → Security).
- **Encrypted at rest:** every Password-vault entry (all fields), and the body of any Important Note you lock. Locked note bodies are never added to the search index.
- **Private Wishlists:** a locked list's items are refused by the backend until the vault is unlocked. "Lock whole Wishlist" locks every list and gates the page.
- If you forget the master password, encrypted data cannot be recovered.

## Background activity

Per the spec, StudyMed never changes your data on its own. Apart from the update check above (the only network access), the only background activity is the reminder scheduler (`src-tauri/src/scheduler.rs`), which every 20 s:

1. keeps the next reminder for recurring sources up to date (bills, birthdays, and a daily "active recall due" digest), and
2. shows native Windows notifications for reminders whose time has come.

Reminders fire whenever StudyMed is running — including when its window is closed, because closing the window hides it to the **system tray** (Settings → Background & startup; on by default). Click the tray icon to reopen; right-click it → *Quit* to exit fully. Turn on **Start StudyMed when Windows starts** and it launches quietly in the tray at sign-in. Only one copy runs at a time: launching it again just reopens the window. Reminders that came due while it was fully quit fire on the next launch.

## Develop

Requirements: Node.js LTS, Rust (MSVC), Visual Studio 2022 Build Tools with "Desktop development with C++". WebView2 ships with Windows 11.

```bash
npm install
```

```bash
npm run app
```

`npm run app` runs the app with hot reload as **StudyMed TEST** (`com.studymed.test`), with its own data folder.

**Never test against `%APPDATA%\com.studymed.app`: it is real data.** Debug builds refuse that identifier. A release build does not, so don't launch one to test unless it was built with a test config. Stop test processes by PID, never by name.

Other scripts:

| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript check |
| `npm run package` | Local release build + NSIS/MSI installers (needs `TAURI_SIGNING_PRIVATE_KEY` set, because updater artifacts are signed) |
| `npm run release` | Bump version, commit, push; GitHub builds and publishes the release |
| `cd src-tauri && cargo test` | Rust unit tests (schema, cascades, search, SM-2, recurrence, crypto, scheduler) |

On this PC, Rust build output goes to `%LOCALAPPDATA%\StudyMed-build\target` (set in `.cargo/config.toml`, which isn't committed because it holds a local path) so OneDrive doesn't sync gigabytes of build files. `node_modules` still lives in the project folder; if OneDrive struggles with it, right-click the folder → *Always keep on this device*.

## Credits

- Chest radiograph in the X-ray background: "Chest Xray PA 3-8-2010" by Stillwaterising, Wikimedia Commons, released under CC0 (public domain).
- 3D scenes use [three.js](https://threejs.org) (MIT).

## Structure

See [ARCHITECTURE.md](ARCHITECTURE.md) for the schema, folder layout and design decisions.
