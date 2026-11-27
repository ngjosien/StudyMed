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
- **Background:** Settings → Appearance → Background picks a one-colour scene in your palette: *Neurons* (cells that fire and pass pulses along), *Cells* (a fine-line microscope field, with the odd cell dividing), *Heartbeat* (ECG traces on monitor paper), *X-ray* (a real chest radiograph on drafting paper) or *Plain*. **Motion** switches any of them between animated and still. Animation pauses while the window is hidden, and Windows' "reduce animations" setting is respected.
- **Pages have fixed layouts.** List pages are sorted by what their records are for (All, Events, Relationships, Homework, Exams and so on).
- **"What's it for?"** on a to-do or event picks an existing record it belongs to. For homework, exams and notes, choose the module first. A to-do for a piece of HBS homework then also shows on the HBS module page, and so does a rescheduled HBS class.
- **Everyday pages** (Routine, Calendar, To-Dos, Events) sit at the top of the sidebar, above the Personal and Academics groups.

## Study tools

- **Timetable:** add each class once and it repeats weekly, on the Timetable page and as the "Classes" layer on the calendar (which you can hide). Lesson kinds are general (lecture, tutorial, skills lab, practical, communication, PE, clinical, online) so they fit future modules too.
- **Routine:** *Week plan* sets activities for each day (every day, weekdays, weekends, chosen days, or once). *Today* shows the day's routine as a timeline (tick each activity off), beside homework due in the next 3 days, exams in the next 30 days and to-dos left unfinished from the past week. *Study* shows your study stats and sets hours per module per week with no fixed time; log sessions and watch the bar fill by Sunday.
- **Focus:** set how long you plan to study, choose Academic (pick the module) or Non-academic, and start. The clock counts down your plan, then keeps counting past it until you press Break or Stop, so extra effort is never lost. It keeps running if you change page or close the window, shows in the sidebar, and sends a notification when the plan is up. Academic minutes count toward that module's weekly study target.
- **Rewards (laurels):** earn 1 laurel per focused minute and 5 per finished to-do (un-ticking takes them back). Spend them on treats you price yourself, such as bubble tea for 120 laurels; your balance sits at the bottom of the sidebar.
- **Exam countdown planner:** Exams shows a countdown for each upcoming exam. *Plan my revision* spreads sessions from your start date to the exam: topics you are least sure of first, a spaced recap of each, past-paper questions when there is time, and the last days kept for practice papers and a final review. It works around revision already planned for other exams. Each session becomes a to-do on its day; *Re-plan* replaces only the unfinished ones.
- **Study garden:** a 3D flower garden in an original cozy style (puffy round trees, a terrace with a waterfall, a stream and bridge, soft cartoon shading), grown by study time. Every month gets a new land with one flower bed per day. Plant one of 12 flowers (from a 1-hour daisy to a 6-hour lily of the valley; rarer ones unlock as more flowers bloom), growing from any study or from one module's study only. Every minute of study (focus sessions on a module and time logged under Routine) grows the flower first in line; stop whenever you like and it carries on next session. Each flower comes in five colours: the fewer days it takes to bloom, the rarer the colour. Bloomed flowers give laurels to collect (more for rarer colours and longer flowers), shown in a flower guide that tracks every colour found. Laurels buy decorations, including puffy trees.
- **Study stats:** Routine's *Study* tab shows today against today's goal ("47m more today to stay on track"), the week against its targets, a 14-day chart and what each module still needs per day.
- **Weekly content:** each module lists its topics week by week (set the semester's first week once). Tick topics as they're covered, send one to spaced repetition, or pull them into an exam's checklist. Routine shows this week's topics.
- **Portfolio hours:** CCA, volunteering and clinical activities collect hours from sessions you log on the activity, plus (if you choose) every past event of a kind, such as all your "CCA: Red Cross" events.
- **Journal:** write freely, or switch a page to a Gibbs reflection (description, feelings, evaluation, analysis, conclusion, action plan).
- **Goals:** daily or weekly tick goals with optional steps, such as "By Tuesday, revise HBS and INP". Ticks belong to their day or week, so each new period starts empty and nothing is deleted.

- **Grades:** official NP grade points and semester GPA ([source](https://www.np.edu.sg/admissions-enrolment/academic-matters)). Enter each assessment's score as written: "20/30", "78%", or a letter ("B+" counts as the middle of its range). It's weighted by what that assessment is worth, so 20/30 on a 20% test counts 13.3 of 20 marks. NP does not publish mark ranges, so the cut-offs are editable estimates.
- **Spaced Repetition:** recall on days 1, 3, 5, 7, 14, 21 and 28 after first learning, ticked by hand. Older flashcard decks stay reachable from that page when any exist.

## Money

- **Weekly allowance:** Money → This week → *Set weekly allowance*. Key it in once with its payday, and it's logged as money received every week (if StudyMed was closed on payday, it catches up next time it opens, never twice).
- **Events** are Social, Relationship, School (CCA: Red Cross or Badminton, rescheduled class with its module, or school event) or Volunteering.

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
- **Wishlist** was removed from the app (saving goals in Money cover it). Its data is still in the database, untouched.
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
