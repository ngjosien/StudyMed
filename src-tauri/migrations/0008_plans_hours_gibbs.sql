-- =====================================================================
-- 0008: exam revision plans, portfolio hours, Gibbs reflections.
--   * A revision plan is a set of to-dos spread out before an exam. They
--     remember their exam and topic so the plan can be re-made later.
--   * Portfolio activities (CCA, volunteering, clinical) collect hours from
--     logged sessions and, optionally, from matching past events.
--   * A journal page can be free writing or a Gibbs reflection.
-- ADDITIVE ONLY.
-- =====================================================================

ALTER TABLE todos ADD COLUMN plan_exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE;
ALTER TABLE todos ADD COLUMN plan_topic_id INTEGER REFERENCES exam_topics(id) ON DELETE SET NULL;
ALTER TABLE todos ADD COLUMN plan_kind TEXT;          -- 'learn' | 'recap' | 'paper' | 'review'
CREATE INDEX idx_todos_plan ON todos(plan_exam_id);

-- One row per session done for a portfolio activity.
CREATE TABLE activity_logs (
  id         INTEGER PRIMARY KEY,
  entry_id   INTEGER NOT NULL REFERENCES portfolio_entries(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  hours      REAL NOT NULL CHECK (hours > 0),
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_activity_logs_entry ON activity_logs(entry_id, date);
-- 'type:Volunteering' or 'subtype:CCA: Red Cross': past events like this count as hours too.
ALTER TABLE portfolio_entries ADD COLUMN count_events TEXT;

ALTER TABLE journal_entries ADD COLUMN format TEXT NOT NULL DEFAULT 'free';
ALTER TABLE journal_entries ADD COLUMN gibbs_json TEXT;

-- Search the Gibbs stages as well as the free writing.
DROP TRIGGER IF EXISTS journal_fts_ai;
DROP TRIGGER IF EXISTS journal_fts_au;
CREATE TRIGGER journal_fts_ai AFTER INSERT ON journal_entries BEGIN
  INSERT INTO search_fts(entity_type, entity_id, title, body)
    VALUES ('journal_entries', new.id, new.entry_date || ' ' || coalesce(new.title,''), new.body_md || ' ' || coalesce(new.gibbs_json,''));
END;
CREATE TRIGGER journal_fts_au AFTER UPDATE ON journal_entries BEGIN
  DELETE FROM search_fts WHERE entity_type='journal_entries' AND entity_id=old.id;
  INSERT INTO search_fts(entity_type, entity_id, title, body)
    VALUES ('journal_entries', new.id, new.entry_date || ' ' || coalesce(new.title,''), new.body_md || ' ' || coalesce(new.gibbs_json,''));
END;
