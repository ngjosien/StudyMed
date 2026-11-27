# StudyMed — Architecture

Tauri 2 (Rust) + React 19 + TypeScript + Tailwind 4, SQLite via `rusqlite` (bundled, FTS5).
Schema: [`0001_init.sql`](src-tauri/migrations/0001_init.sql) (tables, calendar view) and [`0002_triggers_seed.sql`](src-tauri/migrations/0002_triggers_seed.sql) (search triggers, cleanup triggers, default data). [`0004_fixed_pages.sql`](src-tauri/migrations/0004_fixed_pages.sql) adds page links, grades, routine, 1-3-5-7 recall and saving goals; it only adds, and the older `db_*` property tables remain but are unused. [`0007_focus_beats.sql`](src-tauri/migrations/0007_focus_beats.sql) adds focus sessions, the `beats` ledger and treats; triggers turn saved sessions into study-log minutes and beats, and ticked to-dos into beats (shown in the app as laurels). [`0008_plans_hours_gibbs.sql`](src-tauri/migrations/0008_plans_hours_gibbs.sql) marks revision-plan to-dos with their exam and topic, adds `activity_logs` (portfolio hours) and lets a journal page be a Gibbs reflection. [`0009_topics_garden.sql`](src-tauri/migrations/0009_topics_garden.sql) adds weekly module topics and the study garden; a trigger on `study_logs` grows the plant first in line, passes extra minutes on, and takes them back when a log is deleted. [`0010_flower_lands.sql`](src-tauri/migrations/0010_flower_lands.sql) turns the garden into monthly flower lands: plants and decorations get a `land` ('YYYY-MM'), `garden_credits` records which log grew which flower on which day (the colour comes from the number of sessions, i.e. logs that gave it at least 10 minutes; deleting a log takes back exactly what it gave). [`0011_focus_flower.sql`](src-tauri/migrations/0011_focus_flower.sql) lets a focus session name the flower it grows first (`focus_sessions.plant_id`). [`0012_flowers_any_study.sql`](src-tauri/migrations/0012_flowers_any_study.sql) clears the old module links: every flower grows from any study. [`0013_exam_weeks.sql`](src-tauri/migrations/0013_exam_weeks.sql) records which weeks of content an exam tests, for week-by-week study plans (`buildWeekPlan` in `lib/revision.ts`). [`0014_class_changes_exam_grades.sql`](src-tauri/migrations/0014_class_changes_exam_grades.sql) adds `class_changes` (one class changed, cancelled or moved on one day; applied by `lib/classes.ts` and `calendar.rs`) and links every exam to an assessment in Grades (`grading_components.exam_id`), kept in step both ways by triggers. The 3D garden (`src/features/garden`, three.js; flowers in `flowers.ts`, merged into a few meshes each) is loaded only when the page opens.

## Key decisions

| Area | Decision | Why |
|---|---|---|
| DB access | All SQL runs in Rust. The webview calls a **validated generic CRUD** layer (`commands/crud.rs`): table names are whitelisted, every column/sort name is checked against the live schema, every value is a bound parameter. Aggregates are **named queries** defined in Rust. | One small, auditable backend serves ~45 tables; the frontend can never send raw SQL. Vault tables aren't reachable generically at all. |
| Data location | `%APPDATA%\com.studymed.app\studymed.db` + `files\` | One folder to back up; Settings → Data & backup snapshots the DB (`VACUUM INTO`). |
| Platforms | Windows desktop plus an Android app from the same code (`src-tauri/gen/android`). Tray, autostart, single-instance and self-update are desktop-only (`#[cfg(desktop)]`, `capabilities/desktop.json`). Narrow screens get a phone layout (top bar, bottom tabs, slide-out menu) in `layout.tsx`. | One codebase; the phone keeps its own database and moves data by backup file (`backup_bytes` / `backup_restore`). |
| Migrations | `PRAGMA user_version` + ordered SQL files in `db.rs` | Upgrades existing databases on launch, atomically, after a `VACUUM INTO` backup. |
| Crypto | Argon2id → 256-bit key → AES-256-GCM (`argon2`, `aes-gcm`, `zeroize`) in `crypto.rs` | Key lives only in Rust memory while unlocked; wiped on lock/auto-lock. |
| Encrypted at rest | Vault entries (whole JSON payload), locked Important Note bodies | Titles of locked notes stay listable; locked bodies never enter the search index. |
| Wishlist | Page removed in 0.3.0; tables and backend commands kept so existing data is never lost | Saving goals in Money cover the same need. |
| Automation | Only `scheduler.rs`: keeps next reminders for bills/birthdays/active-recall digest, fires due reminders as native toasts, stamps `fired_at` | The single automation allowed by the spec. |
| Recurrence | Bills and birthdays stored once, expanded per visible range in `recur.rs` / `calendar.rs` | Editing a bill updates every occurrence. |
| Spaced repetition | `review_schedule` view derives the 1-3-5-7-14-21-28 days from the learned date; ticks live in `review_checks`. Legacy decks still use `srs.rs`. | Manual-only rule; nothing to reschedule. |
| Page links | `record_links` plus the read-only `connections` view, which also exposes module and join-table links in both directions, plus to-dos/events linked through homework or exams to that module | One component (`components/connections.tsx`) serves every page. Vault and Wishlist records are not linkable. |
| Search | One FTS5 table `search_fts` fed by triggers; powers `Ctrl+K` | Instant cross-database search. |
| Editor | Markdown stored as text; toolbar + write/split/preview; GFM tables & checklists, `> [!NOTE]` callouts, KaTeX math, code; pasted images saved to `files\` | Portable, exportable notes. |
| Frontend data | TanStack Query; every write goes through `useMutate()` which surfaces errors as toasts and refreshes all on-screen queries | No optimistic fake state — what you see is what's in SQLite. |
| Forms | One `FormModal` (`components/form.tsx`) handles fields, tags, many-to-many links, reminders and attachments for any table | Consistent behaviour, no dead buttons. |

## Folder structure

```
StudyMed/
├─ package.json  vite.config.ts  tsconfig.json  index.html
├─ .cargo/config.toml            Rust build output → %LOCALAPPDATA%\StudyMed-build (outside OneDrive)
├─ release/                      copies of the latest installers
├─ src-tauri/
│  ├─ tauri.conf.json            window, CSP, asset protocol, NSIS + MSI bundles
│  ├─ capabilities/default.json  notification, dialog, opener permissions
│  ├─ migrations/                0001_init.sql, 0002_triggers_seed.sql
│  └─ src/
│     ├─ lib.rs                  builder, state, command registration
│     ├─ db.rs                   connection, PRAGMAs, migrations (+ tests)
│     ├─ crypto.rs               KDF, AES-GCM, in-memory vault with auto-lock (+ tests)
│     ├─ scheduler.rs            reminder loop (+ tests)
│     ├─ tray.rs                 system tray, close-to-tray, --minimized startup
│     ├─ recur.rs                weekly/monthly/yearly + birthday expansion (+ tests)
│     └─ commands/
│        ├─ crud.rs              generic CRUD, links, tags, named queries
│        ├─ calendar.rs          unified range query
│        ├─ srs.rs               review scheduling (+ tests)
│        ├─ reminders.rs         per-record reminders, test notification
│        ├─ vault.rs             passwords, locked notes, wishlist locks
│        ├─ files.rs             attachments, pasted images, exports, backup
│        ├─ search.rs            FTS for Ctrl+K
│        └─ settings.rs          key/value settings, app info
└─ src/
   ├─ main.tsx  App.tsx  index.css
   ├─ lib/          api.ts · hooks.ts · dates.ts · format.ts · nav.ts · deeplink.ts
   ├─ stores/       ui.ts (theme, sidebar, settings) · toast.ts
   ├─ components/   ui.tsx · form.tsx · markdown.tsx · shared.tsx · layout.tsx (sidebar, Ctrl+K, toasts)
   └─ features/
      ├─ calendar/   CalendarPage (semantic zoom month↔week, layer filters, deep-link popovers)
      ├─ academics/  Modules · ModuleDashboard · Grades · Routine · Notes · Recall · Flashcards · Homework · Exams · Portfolio
      ├─ life/       Todos · Events · Relationships · Money · Journal · Habits · Moments · Interests
      ├─ secure/     vault.tsx (lock gate) · Passwords · ImportantNotes
      └─ settings/   SettingsPage
```

## Relational map (Academics)

```
modules ─┬─< school_notes ─┬─< cards (spawned from a highlighted passage)
         │                 ├─< note_exam_links >── exams
         │                 └─< note_homework_links >── homework
         ├─< homework ───────< homework_exam_links >── exams
         ├─< exams ─┬─< exam_topics (confidence R/Y/G)
         │          └─< exam_deck_links >── decks
         ├─< decks ──< cards ──< card_reviews
         ├─< grading_components
         └─< portfolio_entries (optional module)
```

## Deep links

Every record type has a route (`lib/nav.ts → entityRoute`). Calendar popovers, search results and the module dashboard use `?id=` to open the exact record, and `?new=1` opens a blank form (used by the `Ctrl+K` "Create" actions).
