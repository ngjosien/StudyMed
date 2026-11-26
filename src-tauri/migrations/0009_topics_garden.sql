-- =====================================================================
-- 0009: weekly module content, and the study garden.
--   * module_topics: what each module covers in each week of the semester.
--   * The garden grows from study time. Every study-log minute goes to the
--     plant first in line (lowest queue). When it is fully grown, any extra
--     minutes pass to the next plant. Deleting a log takes its minutes back.
--   * Decorations are bought with laurels (the `beats` ledger).
-- ADDITIVE ONLY.
-- =====================================================================

CREATE TABLE module_topics (
  id         INTEGER PRIMARY KEY,
  module_id  INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  week       INTEGER NOT NULL CHECK (week BETWEEN 1 AND 40),
  title      TEXT NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_module_topics ON module_topics(module_id, week, position);

CREATE TABLE garden_plants (
  id           INTEGER PRIMARY KEY,
  species      TEXT NOT NULL,
  plot         INTEGER NOT NULL,
  need_minutes INTEGER NOT NULL CHECK (need_minutes > 0),
  minutes      INTEGER NOT NULL DEFAULT 0 CHECK (minutes >= 0),
  queue        INTEGER NOT NULL DEFAULT 0,       -- lowest unfinished grows first
  planted_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  grown_at     TEXT
);
CREATE INDEX idx_garden_queue ON garden_plants(grown_at, queue, id);

CREATE TABLE garden_decor (
  id         INTEGER PRIMARY KEY,
  kind       TEXT NOT NULL,
  plot       INTEGER NOT NULL,
  rot        INTEGER NOT NULL DEFAULT 0,          -- quarter turns
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Which plant a log's minutes went to, so deleting the log can take them back.
ALTER TABLE study_logs ADD COLUMN plant_id INTEGER REFERENCES garden_plants(id) ON DELETE SET NULL;

CREATE TRIGGER study_logs_garden_ai AFTER INSERT ON study_logs WHEN new.minutes > 0 BEGIN
  UPDATE study_logs SET plant_id = (SELECT id FROM garden_plants WHERE grown_at IS NULL ORDER BY queue, id LIMIT 1)
    WHERE id = new.id;
  UPDATE garden_plants SET minutes = minutes + new.minutes
    WHERE id = (SELECT plant_id FROM study_logs WHERE id = new.id);
  -- Extra minutes beyond what the plant needs go to the next plant in line.
  UPDATE garden_plants
    SET minutes = minutes + (SELECT p.minutes - p.need_minutes FROM garden_plants p WHERE p.id = (SELECT plant_id FROM study_logs WHERE id = new.id))
    WHERE id = (SELECT id FROM garden_plants
                WHERE grown_at IS NULL AND id IS NOT (SELECT plant_id FROM study_logs WHERE id = new.id)
                ORDER BY queue, id LIMIT 1)
      AND (SELECT p.minutes - p.need_minutes FROM garden_plants p WHERE p.id = (SELECT plant_id FROM study_logs WHERE id = new.id)) > 0;
  UPDATE garden_plants SET minutes = need_minutes
    WHERE id = (SELECT plant_id FROM study_logs WHERE id = new.id)
      AND minutes > need_minutes
      AND EXISTS (SELECT 1 FROM garden_plants q WHERE q.grown_at IS NULL AND q.id IS NOT (SELECT plant_id FROM study_logs WHERE id = new.id));
  UPDATE garden_plants SET grown_at = datetime('now','localtime') WHERE grown_at IS NULL AND minutes >= need_minutes;
END;

CREATE TRIGGER study_logs_garden_ad AFTER DELETE ON study_logs WHEN old.plant_id IS NOT NULL BEGIN
  UPDATE garden_plants SET minutes = max(0, minutes - old.minutes) WHERE id = old.plant_id;
  UPDATE garden_plants SET grown_at = NULL WHERE id = old.plant_id AND minutes < need_minutes;
END;
