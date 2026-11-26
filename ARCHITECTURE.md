# StudyMed — Architecture

Tauri 2 (Rust) + React 19 + TypeScript + Tailwind 4, SQLite via `rusqlite` (bundled, FTS5).
Schema: [`0001_init.sql`](src-tauri/migrations/0001_init.sql) (tables, calendar view) and [`0002_triggers_seed.sql`](src-tauri/migrations/0002_triggers_seed.sql) (search triggers, cleanup triggers, default data). [`0004_fixed_pages.sql`](src-tauri/migrations/0004_fixed_pages.sql) adds page links, grades, routine, 1-3-5-7 recall and saving goals; it only adds, and the older `db_*` property tables remain but are unused. [`0007_focus_beats.sql`](src-tauri/migrations/0007_focus_beats.sql) adds focus sessions, the `beats` ledger and treats; triggers turn saved sessions into study-log minutes and beats, and ticked to-dos into beats.

## Key decisions

| Area | Decision | Why |
|---|---|---|
| DB access | All SQL runs in Rust. The webview calls a **validated generic CRUD** layer (`commands/crud.rs`): table names are whitelisted, every column/sort name is checked against the live schema, every value is a bound parameter. Aggregates are **named queries** defined in Rust. | One small, auditable backend serves ~45 tables; the frontend can never send raw SQL. Vault tables aren't reachable generically at all. |
| Data location | `%APPDATA%\com.studymed.app\studymed.db` + `files\` | One folder to back up; Settings → Data & backup snapshots the DB (`VACUUM INTO`). |
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
