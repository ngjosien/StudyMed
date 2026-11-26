-- =====================================================================
-- 0006: daily routine, weekly study targets, richer grades and events,
-- and module pages that show to-dos/events linked through homework/exams.
-- ADDITIVE ONLY: nothing is dropped except the `connections` view, which
-- holds no data and is recreated below.
-- =====================================================================

-- ---- Daily routine -----------------------------------------------------
CREATE TABLE routine_items (
  id         INTEGER PRIMARY KEY,
  title      TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'Other',
  start_time TEXT NOT NULL,
  end_time   TEXT,
  days       TEXT NOT NULL DEFAULT '0123456',   -- weekdays it repeats on, 0 = Monday
  once_on    TEXT,                               -- set = a one-off on this date instead
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  CHECK (end_time IS NULL OR end_time > start_time)
);
CREATE TABLE routine_ticks (
  item_id INTEGER NOT NULL REFERENCES routine_items(id) ON DELETE CASCADE,
  date    TEXT NOT NULL,
  PRIMARY KEY (item_id, date)
);

-- ---- Weekly study targets (no fixed time; finish within the week) -------
CREATE TABLE study_targets (
  id               INTEGER PRIMARY KEY,
  module_id        INTEGER NOT NULL UNIQUE REFERENCES modules(id) ON DELETE CASCADE,
  minutes_per_week INTEGER NOT NULL CHECK (minutes_per_week >= 0)
);

-- ---- Grades: keep what was typed ("20/30", "B+", "78%") -----------------
ALTER TABLE grading_components ADD COLUMN score_text TEXT;

-- ---- Events: a school sub-kind and, for rescheduled classes, the module --
ALTER TABLE events ADD COLUMN subtype TEXT;
ALTER TABLE events ADD COLUMN module_id INTEGER REFERENCES modules(id) ON DELETE SET NULL;

-- ---- Links, now also through homework/exams to their module -------------
DROP VIEW IF EXISTS connections;
CREATE VIEW connections AS
  SELECT a_type AS from_type, a_id AS from_id, b_type AS to_type, b_id AS to_id, id AS link_id FROM record_links
  UNION ALL SELECT b_type, b_id, a_type, a_id, id FROM record_links
  UNION ALL SELECT 'events', event_id, 'people', person_id, NULL FROM event_people
  UNION ALL SELECT 'people', person_id, 'events', event_id, NULL FROM event_people
  UNION ALL SELECT 'school_notes', note_id, 'exams', exam_id, NULL FROM note_exam_links
  UNION ALL SELECT 'exams', exam_id, 'school_notes', note_id, NULL FROM note_exam_links
  UNION ALL SELECT 'school_notes', note_id, 'homework', homework_id, NULL FROM note_homework_links
  UNION ALL SELECT 'homework', homework_id, 'school_notes', note_id, NULL FROM note_homework_links
  UNION ALL SELECT 'homework', homework_id, 'exams', exam_id, NULL FROM homework_exam_links
  UNION ALL SELECT 'exams', exam_id, 'homework', homework_id, NULL FROM homework_exam_links
  UNION ALL SELECT 'homework', id, 'modules', module_id, NULL FROM homework
  UNION ALL SELECT 'modules', module_id, 'homework', id, NULL FROM homework
  UNION ALL SELECT 'exams', id, 'modules', module_id, NULL FROM exams
  UNION ALL SELECT 'modules', module_id, 'exams', id, NULL FROM exams
  UNION ALL SELECT 'school_notes', id, 'modules', module_id, NULL FROM school_notes
  UNION ALL SELECT 'modules', module_id, 'school_notes', id, NULL FROM school_notes
  UNION ALL SELECT 'review_topics', id, 'modules', module_id, NULL FROM review_topics
  UNION ALL SELECT 'modules', module_id, 'review_topics', id, NULL FROM review_topics
  UNION ALL SELECT 'decks', id, 'modules', module_id, NULL FROM decks
  UNION ALL SELECT 'modules', module_id, 'decks', id, NULL FROM decks
  UNION ALL SELECT 'portfolio_entries', id, 'modules', module_id, NULL FROM portfolio_entries WHERE module_id IS NOT NULL
  UNION ALL SELECT 'modules', module_id, 'portfolio_entries', id, NULL FROM portfolio_entries WHERE module_id IS NOT NULL
  -- A rescheduled class belongs to its module.
  UNION ALL SELECT 'events', id, 'modules', module_id, NULL FROM events WHERE module_id IS NOT NULL
  UNION ALL SELECT 'modules', module_id, 'events', id, NULL FROM events WHERE module_id IS NOT NULL
  -- A to-do or event linked to a piece of homework or an exam also shows on that module.
  UNION ALL SELECT l.a_type, l.a_id, 'modules', h.module_id, NULL FROM record_links l JOIN homework h ON l.b_type = 'homework' AND h.id = l.b_id WHERE l.a_type IN ('todos','events')
  UNION ALL SELECT 'modules', h.module_id, l.a_type, l.a_id, NULL FROM record_links l JOIN homework h ON l.b_type = 'homework' AND h.id = l.b_id WHERE l.a_type IN ('todos','events')
  UNION ALL SELECT l.b_type, l.b_id, 'modules', h.module_id, NULL FROM record_links l JOIN homework h ON l.a_type = 'homework' AND h.id = l.a_id WHERE l.b_type IN ('todos','events')
  UNION ALL SELECT 'modules', h.module_id, l.b_type, l.b_id, NULL FROM record_links l JOIN homework h ON l.a_type = 'homework' AND h.id = l.a_id WHERE l.b_type IN ('todos','events')
  UNION ALL SELECT l.a_type, l.a_id, 'modules', e.module_id, NULL FROM record_links l JOIN exams e ON l.b_type = 'exams' AND e.id = l.b_id WHERE l.a_type IN ('todos','events')
  UNION ALL SELECT 'modules', e.module_id, l.a_type, l.a_id, NULL FROM record_links l JOIN exams e ON l.b_type = 'exams' AND e.id = l.b_id WHERE l.a_type IN ('todos','events')
  UNION ALL SELECT l.b_type, l.b_id, 'modules', e.module_id, NULL FROM record_links l JOIN exams e ON l.a_type = 'exams' AND e.id = l.a_id WHERE l.b_type IN ('todos','events')
  UNION ALL SELECT 'modules', e.module_id, l.b_type, l.b_id, NULL FROM record_links l JOIN exams e ON l.a_type = 'exams' AND e.id = l.a_id WHERE l.b_type IN ('todos','events');
