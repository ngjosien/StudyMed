-- =====================================================================
-- 0004: fixed pages, page-to-page links, grades, routine, 1-3-5-7, saving
-- ADDITIVE ONLY. This runs on real user data: nothing is dropped or deleted.
-- db_properties / db_values / db_views stay in place, just unused by the UI.
-- =====================================================================

-- ---- Connect any record to any other ---------------------------------
CREATE TABLE record_links (
  id         INTEGER PRIMARY KEY,
  a_type     TEXT NOT NULL,
  a_id       INTEGER NOT NULL,
  b_type     TEXT NOT NULL,
  b_id       INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (a_type, a_id, b_type, b_id)
);
CREATE INDEX idx_record_links_b ON record_links(b_type, b_id);

-- Keep links that were made with relation properties.
INSERT OR IGNORE INTO record_links(a_type, a_id, b_type, b_id)
SELECT CASE WHEN instr(v.db, ':') > 0 THEN substr(v.db, 1, instr(v.db, ':') - 1) ELSE v.db END,
       v.row_id,
       json_extract(p.config_json, '$.target'),
       CAST(j.value AS INTEGER)
FROM db_values v
JOIN db_properties p ON p.id = v.prop_id,
     json_each(v.value) j
WHERE p.type = 'relation' AND json_extract(p.config_json, '$.target') IS NOT NULL;

-- ---- Grade tracker and study routine ----------------------------------
ALTER TABLE modules ADD COLUMN target_grade TEXT;
ALTER TABLE modules ADD COLUMN final_grade TEXT;
ALTER TABLE modules ADD COLUMN difficulty INTEGER NOT NULL DEFAULT 2;
ALTER TABLE grading_components ADD COLUMN score REAL;
ALTER TABLE grading_components ADD COLUMN due_date TEXT;

CREATE TABLE routine_blocks (
  id         INTEGER PRIMARY KEY,
  module_id  INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  weekday    INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),   -- 0 = Monday
  start_time TEXT NOT NULL,
  minutes    INTEGER NOT NULL CHECK (minutes > 0),
  focus      TEXT
);
CREATE TABLE study_logs (
  id        INTEGER PRIMARY KEY,
  module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  block_id  INTEGER REFERENCES routine_blocks(id) ON DELETE SET NULL,
  date      TEXT NOT NULL,
  minutes   INTEGER NOT NULL CHECK (minutes > 0)
);
CREATE INDEX idx_study_logs_date ON study_logs(date);

-- ---- 1-3-5-7 spaced repetition ----------------------------------------
CREATE TABLE review_topics (
  id           INTEGER PRIMARY KEY,
  module_id    INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  note_id      INTEGER REFERENCES school_notes(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  whole_module INTEGER NOT NULL DEFAULT 0,
  learned_date TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE review_checks (
  topic_id  INTEGER NOT NULL REFERENCES review_topics(id) ON DELETE CASCADE,
  step      INTEGER NOT NULL CHECK (step BETWEEN 1 AND 7),
  done_date TEXT NOT NULL,
  PRIMARY KEY (topic_id, step)
);

CREATE VIEW review_schedule AS
WITH steps(step, offset_days) AS (VALUES (1,1),(2,3),(3,5),(4,7),(5,14),(6,21),(7,28))
SELECT t.id AS topic_id, t.module_id, t.title, s.step, s.offset_days,
       date(t.learned_date, '+' || s.offset_days || ' days') AS due_date,
       c.done_date
FROM review_topics t
CROSS JOIN steps s
LEFT JOIN review_checks c ON c.topic_id = t.id AND c.step = s.step;

-- ---- Portfolio for a medicine application -----------------------------
-- `category` keeps its original CHECK; `kind` is what the page shows now.
ALTER TABLE portfolio_entries ADD COLUMN kind TEXT;
ALTER TABLE portfolio_entries ADD COLUMN organisation TEXT;
ALTER TABLE portfolio_entries ADD COLUMN hours REAL;
ALTER TABLE portfolio_entries ADD COLUMN referee TEXT;
ALTER TABLE portfolio_entries ADD COLUMN highlight INTEGER NOT NULL DEFAULT 0;
UPDATE portfolio_entries SET kind = CASE category
  WHEN 'Practical/Clinical Log' THEN 'Clinical & shadowing'
  WHEN 'Award' THEN 'Awards'
  WHEN 'Certification' THEN 'Certifications'
  WHEN 'Research' THEN 'Research'
  ELSE 'Important events' END;

-- ---- Journal ----------------------------------------------------------
ALTER TABLE journal_entries ADD COLUMN mood TEXT;
ALTER TABLE journal_entries ADD COLUMN paper TEXT;
ALTER TABLE journal_entries ADD COLUMN grateful TEXT;

-- ---- Money ------------------------------------------------------------
CREATE TABLE weekly_limits (
  id          INTEGER PRIMARY KEY,
  category_id INTEGER UNIQUE REFERENCES money_categories(id) ON DELETE CASCADE,  -- NULL = whole week
  cap_cents   INTEGER NOT NULL CHECK (cap_cents > 0)
);
ALTER TABLE savings_goals ADD COLUMN bucket TEXT NOT NULL DEFAULT 'Things I want';
ALTER TABLE savings_goals ADD COLUMN created_on TEXT;
ALTER TABLE savings_goals ADD COLUMN weekly_cents INTEGER;

CREATE TABLE goal_items (
  id          INTEGER PRIMARY KEY,
  goal_id     INTEGER NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  selected    INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE goal_deposits (
  id           INTEGER PRIMARY KEY,
  goal_id      INTEGER NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  date         TEXT NOT NULL
);

INSERT OR IGNORE INTO money_categories(name, kind, color) VALUES
  ('Social','expense','#c3a6f4'), ('Relationship','expense','#f4a6c0'),
  ('Snacks & drinks','expense','#f4d8a6'), ('School supplies','expense','#a6c8f4'),
  ('Self-care','expense','#a6e3d0'), ('Subscriptions','expense','#f4b8a6');

-- ---- Every kind of link, readable from either side --------------------
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
  -- "Homework under module 1 shows on module 1": choosing a module is a link too.
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
  UNION ALL SELECT 'modules', module_id, 'portfolio_entries', id, NULL FROM portfolio_entries WHERE module_id IS NOT NULL;

-- Ids can be reused after a delete, so links must go with their record.
CREATE TRIGGER todos_unlink AFTER DELETE ON todos BEGIN DELETE FROM record_links WHERE (a_type='todos' AND a_id=old.id) OR (b_type='todos' AND b_id=old.id); END;
CREATE TRIGGER events_unlink AFTER DELETE ON events BEGIN DELETE FROM record_links WHERE (a_type='events' AND a_id=old.id) OR (b_type='events' AND b_id=old.id); END;
CREATE TRIGGER people_unlink AFTER DELETE ON people BEGIN DELETE FROM record_links WHERE (a_type='people' AND a_id=old.id) OR (b_type='people' AND b_id=old.id); END;
CREATE TRIGGER homework_unlink AFTER DELETE ON homework BEGIN DELETE FROM record_links WHERE (a_type='homework' AND a_id=old.id) OR (b_type='homework' AND b_id=old.id); END;
CREATE TRIGGER exams_unlink AFTER DELETE ON exams BEGIN DELETE FROM record_links WHERE (a_type='exams' AND a_id=old.id) OR (b_type='exams' AND b_id=old.id); END;
CREATE TRIGGER modules_unlink AFTER DELETE ON modules BEGIN DELETE FROM record_links WHERE (a_type='modules' AND a_id=old.id) OR (b_type='modules' AND b_id=old.id); END;
CREATE TRIGGER school_notes_unlink AFTER DELETE ON school_notes BEGIN DELETE FROM record_links WHERE (a_type='school_notes' AND a_id=old.id) OR (b_type='school_notes' AND b_id=old.id); END;
CREATE TRIGGER portfolio_unlink AFTER DELETE ON portfolio_entries BEGIN DELETE FROM record_links WHERE (a_type='portfolio_entries' AND a_id=old.id) OR (b_type='portfolio_entries' AND b_id=old.id); END;
CREATE TRIGGER journal_unlink AFTER DELETE ON journal_entries BEGIN DELETE FROM record_links WHERE (a_type='journal_entries' AND a_id=old.id) OR (b_type='journal_entries' AND b_id=old.id); END;
CREATE TRIGGER moments_unlink AFTER DELETE ON moments BEGIN DELETE FROM record_links WHERE (a_type='moments' AND a_id=old.id) OR (b_type='moments' AND b_id=old.id); END;
CREATE TRIGGER interests_unlink AFTER DELETE ON interest_items BEGIN DELETE FROM record_links WHERE (a_type='interest_items' AND a_id=old.id) OR (b_type='interest_items' AND b_id=old.id); END;
CREATE TRIGGER inotes_unlink AFTER DELETE ON important_notes BEGIN DELETE FROM record_links WHERE (a_type='important_notes' AND a_id=old.id) OR (b_type='important_notes' AND b_id=old.id); END;
CREATE TRIGGER transactions_unlink AFTER DELETE ON transactions BEGIN DELETE FROM record_links WHERE (a_type='transactions' AND a_id=old.id) OR (b_type='transactions' AND b_id=old.id); END;
CREATE TRIGGER bills_unlink AFTER DELETE ON bills BEGIN DELETE FROM record_links WHERE (a_type='bills' AND a_id=old.id) OR (b_type='bills' AND b_id=old.id); END;
CREATE TRIGGER goals_unlink AFTER DELETE ON savings_goals BEGIN DELETE FROM record_links WHERE (a_type='savings_goals' AND a_id=old.id) OR (b_type='savings_goals' AND b_id=old.id); END;
CREATE TRIGGER habits_unlink AFTER DELETE ON habits BEGIN DELETE FROM record_links WHERE (a_type='habits' AND a_id=old.id) OR (b_type='habits' AND b_id=old.id); END;
CREATE TRIGGER decks_unlink AFTER DELETE ON decks BEGIN DELETE FROM record_links WHERE (a_type='decks' AND a_id=old.id) OR (b_type='decks' AND b_id=old.id); END;
CREATE TRIGGER topics_unlink AFTER DELETE ON review_topics BEGIN DELETE FROM record_links WHERE (a_type='review_topics' AND a_id=old.id) OR (b_type='review_topics' AND b_id=old.id); END;
