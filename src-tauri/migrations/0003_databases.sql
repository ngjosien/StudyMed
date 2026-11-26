-- =====================================================================
-- 0003: Notion-style databases
--   db_properties  user-defined properties per database ("todos", "events",
--                  "interest_items:3", ...)
--   db_values      one value per (database, row, property), JSON-encoded
--   db_views       saved views: layout, sorts, filters, grouping, hidden props
-- =====================================================================

CREATE TABLE db_properties (
  id          INTEGER PRIMARY KEY,
  db          TEXT NOT NULL,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('text','number','select','multi_select','date','checkbox','url','relation','countdown')),
  config_json TEXT NOT NULL DEFAULT '{}',   -- {options:[{value,color}]} | {target:"events"} | {source:"date"}
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_db_properties_db ON db_properties(db, position);

CREATE TABLE db_values (
  db      TEXT NOT NULL,
  row_id  INTEGER NOT NULL,
  prop_id INTEGER NOT NULL REFERENCES db_properties(id) ON DELETE CASCADE,
  value   TEXT,                              -- JSON
  PRIMARY KEY (db, row_id, prop_id)
);
CREATE INDEX idx_db_values_prop ON db_values(prop_id);

CREATE TABLE db_views (
  id          INTEGER PRIMARY KEY,
  db          TEXT NOT NULL,
  name        TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  position    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_db_views_db ON db_views(db, position);

-- The old fixed To-Do presets are replaced by user-defined views.
DELETE FROM saved_views;
