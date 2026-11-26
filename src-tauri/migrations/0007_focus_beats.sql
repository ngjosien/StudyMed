-- =====================================================================
-- 0007: the focus timer and "beats", a small reward currency.
--   * A finished focus session earns 1 beat per focused minute; an
--     academic one also counts toward that module's weekly study target.
--   * Ticking off a to-do earns 5 beats (un-ticking takes them back).
--   * Beats are spent on treats the user sets up themselves.
-- ADDITIVE ONLY.
-- =====================================================================

CREATE TABLE focus_sessions (
  id              INTEGER PRIMARY KEY,
  kind            TEXT NOT NULL DEFAULT 'academic' CHECK (kind IN ('academic','other')),
  module_id       INTEGER REFERENCES modules(id) ON DELETE SET NULL,
  label           TEXT,
  planned_minutes INTEGER NOT NULL DEFAULT 0 CHECK (planned_minutes >= 0),
  started_at      TEXT NOT NULL,              -- 'YYYY-MM-DDTHH:MM'
  ended_at        TEXT,
  focus_minutes   INTEGER NOT NULL DEFAULT 0 CHECK (focus_minutes >= 0),
  break_minutes   INTEGER NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
  note            TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_focus_started ON focus_sessions(started_at);

-- Study minutes that came from a focus session go away with it.
ALTER TABLE study_logs ADD COLUMN focus_session_id INTEGER REFERENCES focus_sessions(id) ON DELETE CASCADE;

-- The ledger: positive = earned, negative = spent.
CREATE TABLE beats (
  id          INTEGER PRIMARY KEY,
  amount      INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  source_type TEXT,                            -- 'todos' | 'focus_sessions' | 'rewards' | NULL
  source_id   INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_beats_source ON beats(source_type, source_id);
CREATE INDEX idx_beats_created ON beats(created_at);

-- Treats to spend beats on.
CREATE TABLE rewards (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  cost       INTEGER NOT NULL CHECK (cost > 0),
  emoji      TEXT,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---- Focus sessions → study log + beats ---------------------------------
CREATE TRIGGER focus_sessions_ai AFTER INSERT ON focus_sessions BEGIN
  INSERT INTO study_logs(module_id, date, minutes, focus_session_id)
    SELECT new.module_id, substr(new.started_at, 1, 10), new.focus_minutes, new.id
    WHERE new.kind = 'academic' AND new.module_id IS NOT NULL AND new.focus_minutes > 0;
  INSERT INTO beats(amount, reason, source_type, source_id)
    SELECT new.focus_minutes, 'Focus · ' || coalesce((SELECT code FROM modules WHERE id = new.module_id), new.label, 'Session'),
           'focus_sessions', new.id
    WHERE new.focus_minutes > 0;
END;

CREATE TRIGGER focus_sessions_au AFTER UPDATE OF kind, module_id, label, focus_minutes, started_at ON focus_sessions BEGIN
  DELETE FROM study_logs WHERE focus_session_id = old.id;
  DELETE FROM beats WHERE source_type = 'focus_sessions' AND source_id = old.id;
  INSERT INTO study_logs(module_id, date, minutes, focus_session_id)
    SELECT new.module_id, substr(new.started_at, 1, 10), new.focus_minutes, new.id
    WHERE new.kind = 'academic' AND new.module_id IS NOT NULL AND new.focus_minutes > 0;
  INSERT INTO beats(amount, reason, source_type, source_id)
    SELECT new.focus_minutes, 'Focus · ' || coalesce((SELECT code FROM modules WHERE id = new.module_id), new.label, 'Session'),
           'focus_sessions', new.id
    WHERE new.focus_minutes > 0;
END;

CREATE TRIGGER focus_sessions_ad AFTER DELETE ON focus_sessions BEGIN
  DELETE FROM beats WHERE source_type = 'focus_sessions' AND source_id = old.id;
END;

-- ---- To-dos → beats -----------------------------------------------------
CREATE TRIGGER todos_beats_done AFTER UPDATE OF done ON todos WHEN new.done = 1 AND old.done = 0 BEGIN
  INSERT INTO beats(amount, reason, source_type, source_id) VALUES (5, 'To-do · ' || new.title, 'todos', new.id);
END;

CREATE TRIGGER todos_beats_undone AFTER UPDATE OF done ON todos WHEN new.done = 0 AND old.done = 1 BEGIN
  DELETE FROM beats WHERE source_type = 'todos' AND source_id = old.id;
END;
