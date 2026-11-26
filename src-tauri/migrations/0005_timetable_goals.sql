-- =====================================================================
-- 0005: school timetable and repeating tick goals. ADDITIVE ONLY.
-- =====================================================================

-- A class that happens every week on one weekday (0 = Monday).
CREATE TABLE class_slots (
  id         INTEGER PRIMARY KEY,
  module_id  INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'Lecture',
  weekday    INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time   TEXT NOT NULL,
  venue      TEXT,
  starts_on  TEXT,   -- first week of term (optional)
  ends_on    TEXT,   -- last day of term (optional)
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  CHECK (end_time > start_time)
);

-- A goal that repeats every day or every week. Ticks belong to one period,
-- so a new day or week simply starts with no ticks: nothing is reset or deleted.
CREATE TABLE tick_goals (
  id          INTEGER PRIMARY KEY,
  title       TEXT NOT NULL,
  cadence     TEXT NOT NULL DEFAULT 'weekly' CHECK (cadence IN ('daily','weekly')),
  due_weekday INTEGER CHECK (due_weekday BETWEEN 0 AND 6),  -- weekly: "done by" day
  color       TEXT,
  notes       TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE tick_goal_steps (
  id       INTEGER PRIMARY KEY,
  goal_id  INTEGER NOT NULL REFERENCES tick_goals(id) ON DELETE CASCADE,
  title    TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
-- step_id 0 = the goal itself (used when a goal has no steps).
CREATE TABLE tick_goal_ticks (
  goal_id INTEGER NOT NULL REFERENCES tick_goals(id) ON DELETE CASCADE,
  step_id INTEGER NOT NULL DEFAULT 0,
  period  TEXT NOT NULL,   -- the day, or the Monday of the week
  done_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (goal_id, step_id, period)
);
CREATE TRIGGER tick_steps_cleanup AFTER DELETE ON tick_goal_steps BEGIN
  DELETE FROM tick_goal_ticks WHERE step_id = old.id;
END;
CREATE TRIGGER tick_goals_unlink AFTER DELETE ON tick_goals BEGIN
  DELETE FROM record_links WHERE (a_type='tick_goals' AND a_id=old.id) OR (b_type='tick_goals' AND b_id=old.id);
END;
