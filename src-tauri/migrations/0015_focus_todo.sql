-- =====================================================================
-- 0015: a focus session can be for a to-do (started from "Focus on this"),
-- so the to-do shows how long you've focused on it. ADDITIVE ONLY.
-- =====================================================================

ALTER TABLE focus_sessions ADD COLUMN todo_id INTEGER REFERENCES todos(id) ON DELETE SET NULL;
