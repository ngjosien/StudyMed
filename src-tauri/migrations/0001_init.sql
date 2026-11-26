-- =====================================================================
-- StudyMed — initial schema (SQLite, migration 0001)
-- Conventions:
--   * INTEGER PRIMARY KEY ids; FKs enforced (PRAGMA foreign_keys = ON at connect).
--   * Dates: 'YYYY-MM-DD'; datetimes: ISO-8601 local 'YYYY-MM-DDTHH:MM'.
--   * Money stored as integer cents.
--   * Polymorphic tables (tags, attachments, reminders) use
--     (entity_type, entity_id) and are cleaned up by triggers/app code.
--   * Encrypted columns are AES-256-GCM: *_enc BLOB + *_nonce BLOB,
--     key derived from the Master Password with Argon2id (see vault_meta).
-- =====================================================================
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- 0. App-wide / shared
-- ---------------------------------------------------------------------
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                       -- JSON-encoded
);

CREATE TABLE vault_meta (                   -- single row
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  kdf           TEXT NOT NULL DEFAULT 'argon2id',
  kdf_params    TEXT NOT NULL,              -- JSON {m_cost,t_cost,p_cost}
  salt          BLOB NOT NULL,
  verifier_enc  BLOB NOT NULL,              -- encrypts a known constant to check the password
  verifier_nonce BLOB NOT NULL,
  pin_hash      TEXT,                       -- optional quick-unlock PIN (Argon2 PHC string)
  auto_lock_min INTEGER NOT NULL DEFAULT 5,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE tags (
  id     INTEGER PRIMARY KEY,
  scope  TEXT NOT NULL,                     -- 'todo_category','skill','moment','interest:<tab_id>','note_folder', ...
  name   TEXT NOT NULL,
  color  TEXT,
  UNIQUE (scope, name)
);

CREATE TABLE entity_tags (
  tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id   INTEGER NOT NULL,
  PRIMARY KEY (tag_id, entity_type, entity_id)
);
CREATE INDEX idx_entity_tags_entity ON entity_tags(entity_type, entity_id);

CREATE TABLE attachments (                  -- files copied into %APPDATA%/StudyMed/files
  id          INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL,                -- 'homework','portfolio','memory','note', ...
  entity_id   INTEGER NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('file','image','link')),
  path_or_url TEXT NOT NULL,
  label       TEXT,
  mime        TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_attachments_entity ON attachments(entity_type, entity_id);

-- The ONLY automation: the notification scheduler reads this table and
-- fires native toasts when remind_at <= now AND fired_at IS NULL.
CREATE TABLE reminders (
  id          INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL,                -- 'todo','event','bill','exam','homework','birthday','sr_digest'
  entity_id   INTEGER NOT NULL,
  remind_at   TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  fired_at    TEXT
);
CREATE INDEX idx_reminders_pending ON reminders(fired_at, remind_at);
CREATE INDEX idx_reminders_entity  ON reminders(entity_type, entity_id);

CREATE TABLE saved_views (                  -- To-Do presets (reusable for other tables)
  id          INTEGER PRIMARY KEY,
  page        TEXT NOT NULL,                -- 'todos'
  name        TEXT NOT NULL,
  filter_json TEXT NOT NULL DEFAULT '{}',
  sort_json   TEXT NOT NULL DEFAULT '[]',
  position    INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------
-- 1. Academics (relational suite — everything hangs off modules)
-- ---------------------------------------------------------------------
CREATE TABLE modules (
  id            INTEGER PRIMARY KEY,
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  term          TEXT,
  color         TEXT NOT NULL DEFAULT '#6366f1',
  credits       REAL,
  lecturer      TEXT,
  lecturer_contact TEXT,
  syllabus_md   TEXT,
  archived      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (code, term)
);

CREATE TABLE grading_components (
  id         INTEGER PRIMARY KEY,
  module_id  INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  weight_pct REAL NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE school_notes (
  id         INTEGER PRIMARY KEY,
  module_id  INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  week       INTEGER,
  topic      TEXT,
  body_md    TEXT NOT NULL DEFAULT '',      -- markdown incl. tables, callouts, $math$, ![](local images)
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_notes_module ON school_notes(module_id, week);

CREATE TABLE homework (
  id         INTEGER PRIMARY KEY,
  module_id  INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('Assignment','Lab Report','Tutorial','Group Project','Reading')),
  due_at     TEXT,
  weight_pct REAL,
  status     TEXT NOT NULL DEFAULT 'Not Started'
             CHECK (status IN ('Not Started','Researching','Drafting','Reviewing','Submitted')),
  notes_md   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_homework_due ON homework(due_at);

CREATE TABLE exams (
  id            INTEGER PRIMARY KEY,
  module_id     INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  start_at      TEXT,
  duration_min  INTEGER,
  venue         TEXT,
  seat          TEXT,
  format        TEXT CHECK (format IN ('MCQ','Written','Practical','Open-Book','Oral','Other')),
  weight_pct    REAL,
  grade         TEXT,
  reflection_md TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_exams_start ON exams(start_at);

CREATE TABLE exam_topics (                  -- syllabus checklist w/ confidence
  id         INTEGER PRIMARY KEY,
  exam_id    INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  confidence TEXT CHECK (confidence IN ('red','yellow','green')),
  done       INTEGER NOT NULL DEFAULT 0,
  note_id    INTEGER REFERENCES school_notes(id) ON DELETE SET NULL,
  position   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE decks (
  id             INTEGER PRIMARY KEY,
  module_id      INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  scheduler      TEXT NOT NULL DEFAULT 'sm2' CHECK (scheduler IN ('sm2','fixed')),
  fixed_intervals TEXT NOT NULL DEFAULT '[1,3,7,14,30]',   -- days, used when scheduler='fixed'
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE cards (
  id               INTEGER PRIMARY KEY,
  deck_id          INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  note_id          INTEGER REFERENCES school_notes(id) ON DELETE SET NULL,  -- spawned-from note
  kind             TEXT NOT NULL DEFAULT 'qa' CHECK (kind IN ('qa','topic')),
  front_md         TEXT NOT NULL,
  back_md          TEXT NOT NULL DEFAULT '',
  source_excerpt   TEXT,                    -- highlighted text the card was spawned from
  ease             REAL NOT NULL DEFAULT 2.5,
  interval_days    INTEGER NOT NULL DEFAULT 0,
  repetitions      INTEGER NOT NULL DEFAULT 0,
  lapses           INTEGER NOT NULL DEFAULT 0,
  due_date         TEXT NOT NULL DEFAULT (date('now','localtime')),
  last_reviewed_at TEXT,
  suspended        INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_cards_due ON cards(deck_id, suspended, due_date);

CREATE TABLE card_reviews (                 -- written only when the user presses Again/Hard/Good/Easy
  id            INTEGER PRIMARY KEY,
  card_id       INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  reviewed_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),   -- 1 Again, 2 Hard, 3 Good, 4 Easy
  prev_interval INTEGER NOT NULL,
  new_interval  INTEGER NOT NULL,
  prev_ease     REAL NOT NULL,
  new_ease      REAL NOT NULL
);

-- Many-to-many relational links between academic items
CREATE TABLE note_exam_links (
  note_id INTEGER NOT NULL REFERENCES school_notes(id) ON DELETE CASCADE,
  exam_id INTEGER NOT NULL REFERENCES exams(id)        ON DELETE CASCADE,
  PRIMARY KEY (note_id, exam_id)
);
CREATE TABLE note_homework_links (
  note_id     INTEGER NOT NULL REFERENCES school_notes(id) ON DELETE CASCADE,
  homework_id INTEGER NOT NULL REFERENCES homework(id)     ON DELETE CASCADE,
  PRIMARY KEY (note_id, homework_id)
);
CREATE TABLE homework_exam_links (
  homework_id INTEGER NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
  exam_id     INTEGER NOT NULL REFERENCES exams(id)    ON DELETE CASCADE,
  PRIMARY KEY (homework_id, exam_id)
);
CREATE TABLE exam_deck_links (
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  PRIMARY KEY (exam_id, deck_id)
);

CREATE TABLE portfolio_entries (
  id            INTEGER PRIMARY KEY,
  module_id     INTEGER REFERENCES modules(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('Project','Practical/Clinical Log','Certification','Award','Research')),
  start_date    TEXT,
  end_date      TEXT,
  role          TEXT,
  summary_md    TEXT,
  reflection_md TEXT,                       -- skills → entity_tags(scope='skill'); artifacts → attachments
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------------------------------------------------------------------
-- 2. Life / Personal
-- ---------------------------------------------------------------------
CREATE TABLE todos (
  id           INTEGER PRIMARY KEY,
  parent_id    INTEGER REFERENCES todos(id) ON DELETE CASCADE,   -- subtasks
  title        TEXT NOT NULL,
  done         INTEGER NOT NULL DEFAULT 0,
  date         TEXT,
  time         TEXT,
  priority     TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High')),
  status       TEXT NOT NULL DEFAULT 'Not Started'
               CHECK (status IN ('Not Started','In Progress','Waiting','Done')),
  est_minutes  INTEGER,
  notes_md     TEXT,                        -- category tags → entity_tags(scope='todo_category')
  position     INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_todos_date ON todos(date);

CREATE TABLE people (
  id               INTEGER PRIMARY KEY,
  name             TEXT NOT NULL,
  photo_path       TEXT,
  relationship_tag TEXT,
  birthday         TEXT,                    -- 'YYYY-MM-DD' or '--MM-DD' if year unknown
  birthday_remind_days INTEGER,             -- NULL = no reminder
  general_notes_md TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE person_details (               -- "Little Details" quick facts
  id        INTEGER PRIMARY KEY,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  field     TEXT NOT NULL,                  -- 'favorite_food','coffee_order','allergies','sizes','gift_ideas','likes','dislikes','how_we_met','custom'
  label     TEXT,
  value     TEXT NOT NULL,
  position  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE person_memories (              -- photos → attachments(entity_type='memory')
  id        INTEGER PRIMARY KEY,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  date      TEXT NOT NULL,
  text      TEXT NOT NULL
);

CREATE TABLE person_plans (
  id        INTEGER PRIMARY KEY,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  title     TEXT NOT NULL,
  notes     TEXT,
  done      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE events (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  start_at      TEXT NOT NULL,
  end_at        TEXT,
  all_day       INTEGER NOT NULL DEFAULT 0,
  type          TEXT NOT NULL DEFAULT 'Social',
  location      TEXT,
  sync_calendar INTEGER NOT NULL DEFAULT 1,
  notes_md      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE event_people (
  event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, person_id)
);
CREATE TABLE event_checklist (
  id       INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  text     TEXT NOT NULL,
  done     INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0
);

-- Money ---------------------------------------------------------------
CREATE TABLE wallets (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  type            TEXT NOT NULL CHECK (type IN ('Cash','Debit','Credit','Savings','Other')),
  opening_cents   INTEGER NOT NULL DEFAULT 0,
  archived        INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE money_categories (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL,
  kind  TEXT NOT NULL CHECK (kind IN ('income','expense')),
  color TEXT,
  UNIQUE (name, kind)
);
CREATE TABLE transactions (
  id           INTEGER PRIMARY KEY,
  kind         TEXT NOT NULL CHECK (kind IN ('income','expense')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  date         TEXT NOT NULL,
  category_id  INTEGER REFERENCES money_categories(id) ON DELETE SET NULL,
  wallet_id    INTEGER REFERENCES wallets(id) ON DELETE SET NULL,
  bill_id      INTEGER REFERENCES bills(id) ON DELETE SET NULL,   -- set when user manually logs a bill payment
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_tx_date ON transactions(date);
CREATE TABLE budgets (
  id          INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES money_categories(id) ON DELETE CASCADE,
  month       TEXT,                         -- 'YYYY-MM'; NULL = default cap for every month
  cap_cents   INTEGER NOT NULL,
  UNIQUE (category_id, month)
);
CREATE TABLE bills (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL,
  category_id   INTEGER REFERENCES money_categories(id) ON DELETE SET NULL,
  wallet_id     INTEGER REFERENCES wallets(id) ON DELETE SET NULL,
  freq          TEXT NOT NULL CHECK (freq IN ('weekly','monthly','yearly')),
  every_n       INTEGER NOT NULL DEFAULT 1,
  anchor_date   TEXT NOT NULL,              -- first due date; occurrences are expanded for the calendar
  remind_days_before INTEGER,               -- NULL = no reminder
  active        INTEGER NOT NULL DEFAULT 1,
  notes         TEXT
);
CREATE TABLE savings_goals (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  target_cents INTEGER NOT NULL,
  saved_cents  INTEGER NOT NULL DEFAULT 0,
  target_date  TEXT,
  notes        TEXT
);

-- Journal -------------------------------------------------------------
CREATE TABLE journal_entries (
  id         INTEGER PRIMARY KEY,
  entry_date TEXT NOT NULL UNIQUE,          -- primary identifier, e.g. 2026-11-20
  title      TEXT,
  body_md    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Habits --------------------------------------------------------------
CREATE TABLE habits (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  color         TEXT NOT NULL DEFAULT '#10b981',
  goal_per_week INTEGER NOT NULL DEFAULT 7 CHECK (goal_per_week BETWEEN 1 AND 7),  -- 7 = Daily
  position      INTEGER NOT NULL DEFAULT 0,
  archived      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (date('now','localtime'))
);
CREATE TABLE habit_checks (                 -- row exists = done that day (streaks computed in queries)
  habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date     TEXT NOT NULL,
  PRIMARY KEY (habit_id, date)
);

-- Moments -------------------------------------------------------------
CREATE TABLE moments (
  id         INTEGER PRIMARY KEY,
  caption    TEXT,
  date       TEXT NOT NULL,
  location   TEXT,                          -- tags → entity_tags(scope='moment')
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE moment_photos (
  id        INTEGER PRIMARY KEY,
  moment_id INTEGER NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  path      TEXT NOT NULL,                  -- relative to app data /moments
  position  INTEGER NOT NULL DEFAULT 0
);

-- Interests (user-defined tabs with their own fields/statuses) -------
CREATE TABLE interest_tabs (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  icon        TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  fields_json   TEXT NOT NULL DEFAULT '[]', -- [{key,label,type:'text'|'number'|'rating'|'url'|'bool'|'progress'|'longtext'}]
  statuses_json TEXT NOT NULL DEFAULT '[]'  -- ["Want to Watch","Watching","Finished"]
);
CREATE TABLE interest_items (
  id          INTEGER PRIMARY KEY,
  tab_id      INTEGER NOT NULL REFERENCES interest_tabs(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  status      TEXT,
  rating      INTEGER CHECK (rating BETWEEN 0 AND 5),
  values_json TEXT NOT NULL DEFAULT '{}',   -- values keyed by interest_tabs.fields_json[].key
  notes_md    TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------------------------------------------------------------------
-- 3. Security & Privacy
-- ---------------------------------------------------------------------
CREATE TABLE vault_entries (                -- whole entry is encrypted; decrypted only in memory while unlocked
  id          INTEGER PRIMARY KEY,
  payload_enc BLOB NOT NULL,                -- JSON {service,username,password,url,category,notes}
  nonce       BLOB NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE note_folders (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL UNIQUE,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE important_notes (
  id         INTEGER PRIMARY KEY,
  folder_id  INTEGER REFERENCES note_folders(id) ON DELETE SET NULL,
  title      TEXT NOT NULL,
  pinned     INTEGER NOT NULL DEFAULT 0,
  locked     INTEGER NOT NULL DEFAULT 0,
  body_md    TEXT,                          -- used when locked = 0
  body_enc   BLOB,                          -- used when locked = 1 (title stays visible)
  body_nonce BLOB,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  CHECK ((locked = 0 AND body_enc IS NULL) OR (locked = 1 AND body_md IS NULL AND body_enc IS NOT NULL))
);

CREATE TABLE wishlists (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL,
  locked   INTEGER NOT NULL DEFAULT 0,      -- requires Master Password/PIN to open
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE wishlist_items (
  id           INTEGER PRIMARY KEY,
  wishlist_id  INTEGER NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  image_path   TEXT,
  price_cents  INTEGER,
  store        TEXT,
  url          TEXT,
  priority     TEXT NOT NULL DEFAULT 'Nice-to-Have' CHECK (priority IN ('Must-Have','Nice-to-Have','Dream')),
  category     TEXT,
  notes        TEXT,
  purchased    INTEGER NOT NULL DEFAULT 0,
  purchased_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------------------------------------------------------------------
-- 4. Full-text search (Ctrl+K palette + per-page search)
-- ---------------------------------------------------------------------
CREATE VIRTUAL TABLE search_fts USING fts5(
  entity_type UNINDEXED, entity_id UNINDEXED, title, body,
  tokenize = 'porter unicode61'
);
-- Kept in sync by triggers (one set per searchable table). Locked notes and
-- the vault are never indexed. Example for journal; the rest follow the same pattern.
CREATE TRIGGER journal_ai AFTER INSERT ON journal_entries BEGIN
  INSERT INTO search_fts(entity_type, entity_id, title, body)
  VALUES ('journal', new.id, new.entry_date || ' ' || coalesce(new.title,''), new.body_md);
END;
CREATE TRIGGER journal_au AFTER UPDATE ON journal_entries BEGIN
  DELETE FROM search_fts WHERE entity_type='journal' AND entity_id=old.id;
  INSERT INTO search_fts(entity_type, entity_id, title, body)
  VALUES ('journal', new.id, new.entry_date || ' ' || coalesce(new.title,''), new.body_md);
END;
CREATE TRIGGER journal_ad AFTER DELETE ON journal_entries BEGIN
  DELETE FROM search_fts WHERE entity_type='journal' AND entity_id=old.id;
END;
-- (school_notes, todos, events, people, homework, exams, important_notes[unlocked],
--  interest_items, portfolio_entries: same three triggers each — generated in 0002_fts_triggers.sql)

-- ---------------------------------------------------------------------
-- 5. Unified Calendar view (one-off items). Recurring items — birthdays
--    (yearly) and bills (weekly/monthly/yearly) — are expanded for the
--    visible date range in calendar.rs and merged with this view.
-- ---------------------------------------------------------------------
CREATE VIEW calendar_items AS
  SELECT 'todo' AS layer, 'todo' AS source_type, id AS source_id, title,
         date || CASE WHEN time IS NOT NULL THEN 'T' || time ELSE '' END AS start_at,
         NULL AS end_at, (time IS NULL) AS all_day, NULL AS location, NULL AS color, done
    FROM todos WHERE date IS NOT NULL AND parent_id IS NULL
  UNION ALL
  SELECT 'event', 'event', id, name, start_at, end_at, all_day, location, NULL, 0
    FROM events WHERE sync_calendar = 1
  UNION ALL
  SELECT 'homework', 'homework', h.id, m.code || ' · ' || h.title, h.due_at, NULL, 0, NULL, m.color,
         (h.status = 'Submitted')
    FROM homework h JOIN modules m ON m.id = h.module_id WHERE h.due_at IS NOT NULL
  UNION ALL
  SELECT 'exam', 'exam', e.id, m.code || ' · ' || e.name, e.start_at,
         CASE WHEN e.duration_min IS NOT NULL
              THEN strftime('%Y-%m-%dT%H:%M', e.start_at, '+' || e.duration_min || ' minutes') END,
         0, trim(coalesce(e.venue,'') || ' ' || coalesce(e.seat,'')), m.color, 0
    FROM exams e JOIN modules m ON m.id = e.module_id WHERE e.start_at IS NOT NULL;
