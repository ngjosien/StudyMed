-- =====================================================================
-- 0013: which weeks of a module's content an exam tests (e.g. weeks 1 to 8),
-- so a study plan can be built week by week. ADDITIVE ONLY.
-- =====================================================================

ALTER TABLE exams ADD COLUMN weeks_from INTEGER CHECK (weeks_from IS NULL OR weeks_from BETWEEN 1 AND 40);
ALTER TABLE exams ADD COLUMN weeks_to INTEGER CHECK (weeks_to IS NULL OR weeks_to BETWEEN 1 AND 40);
