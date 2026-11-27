-- =====================================================================
-- 0014: one-off timetable changes, and exams linked to Grades.
--   * class_changes: a weekly class changed on one day only: cancelled,
--     at another time or room, or moved to another day. The weekly class
--     itself stays as it is.
--   * grading_components.exam_id: every exam is an assessment in its
--     module's grades. Name, worth (%) and result stay in step both ways,
--     and deleting the exam removes its assessment.
-- =====================================================================

CREATE TABLE class_changes (
  id         INTEGER PRIMARY KEY,
  slot_id    INTEGER NOT NULL REFERENCES class_slots(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,                 -- the day the class normally falls on
  cancelled  INTEGER NOT NULL DEFAULT 0,
  new_date   TEXT,                          -- moved to this day (NULL = same day)
  start_time TEXT,
  end_time   TEXT,
  venue      TEXT,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (slot_id, date),
  CHECK (start_time IS NULL OR end_time IS NULL OR end_time > start_time)
);

ALTER TABLE grading_components ADD COLUMN exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE;

-- Link existing assessments to the exam of the same name in the same module.
CREATE TABLE _link AS
  SELECT g.id AS gid,
         (SELECT e.id FROM exams e WHERE e.module_id = g.module_id AND lower(trim(e.name)) = lower(trim(g.name)) ORDER BY e.id LIMIT 1) AS eid
  FROM grading_components g;
DELETE FROM _link WHERE eid IS NULL OR gid NOT IN (SELECT min(gid) FROM _link WHERE eid IS NOT NULL GROUP BY eid);
UPDATE grading_components SET exam_id = (SELECT eid FROM _link WHERE gid = grading_components.id);
DROP TABLE _link;
-- A linked pair takes the worth from Grades, and a result from whichever side has one.
UPDATE grading_components SET score_text = (SELECT e.grade FROM exams e WHERE e.id = grading_components.exam_id)
  WHERE exam_id IS NOT NULL AND score_text IS NULL;
UPDATE exams SET
  weight_pct = (SELECT g.weight_pct FROM grading_components g WHERE g.exam_id = exams.id),
  grade = coalesce((SELECT g.score_text FROM grading_components g WHERE g.exam_id = exams.id), grade)
  WHERE id IN (SELECT exam_id FROM grading_components WHERE exam_id IS NOT NULL);

-- Every other exam becomes an assessment. A result written as a number or
-- "20/30" becomes a percentage here; letter grades are worked out by the app.
INSERT INTO grading_components(module_id, name, weight_pct, due_date, score_text, score, exam_id, position)
  SELECT e.module_id, e.name, coalesce(e.weight_pct, 0), substr(e.start_at, 1, 10), e.grade,
         CASE
           WHEN e.grade IS NULL OR trim(e.grade) = '' THEN NULL
           WHEN instr(e.grade, '/') > 0 AND trim(substr(e.grade, 1, instr(e.grade, '/') - 1)) GLOB '[0-9]*'
                AND CAST(trim(substr(e.grade, instr(e.grade, '/') + 1)) AS REAL) > 0
             THEN min(100.0, 100.0 * CAST(trim(substr(e.grade, 1, instr(e.grade, '/') - 1)) AS REAL) / CAST(trim(substr(e.grade, instr(e.grade, '/') + 1)) AS REAL))
           WHEN trim(replace(e.grade, '%', '')) GLOB '[0-9]*' AND trim(replace(e.grade, '%', '')) NOT GLOB '*[^0-9.]*'
             THEN min(100.0, CAST(trim(replace(e.grade, '%', '')) AS REAL))
           ELSE NULL
         END,
         e.id, 1000 + e.id
  FROM exams e WHERE NOT EXISTS (SELECT 1 FROM grading_components g WHERE g.exam_id = e.id);

CREATE UNIQUE INDEX idx_grading_exam ON grading_components(exam_id) WHERE exam_id IS NOT NULL;

CREATE TRIGGER exams_grades_ai AFTER INSERT ON exams BEGIN
  INSERT INTO grading_components(module_id, name, weight_pct, due_date, score_text, score, exam_id, position)
  VALUES (new.module_id, new.name, coalesce(new.weight_pct, 0), substr(new.start_at, 1, 10), new.grade,
          CASE
            WHEN new.grade IS NULL OR trim(new.grade) = '' THEN NULL
            WHEN instr(new.grade, '/') > 0 AND trim(substr(new.grade, 1, instr(new.grade, '/') - 1)) GLOB '[0-9]*'
                 AND CAST(trim(substr(new.grade, instr(new.grade, '/') + 1)) AS REAL) > 0
              THEN min(100.0, 100.0 * CAST(trim(substr(new.grade, 1, instr(new.grade, '/') - 1)) AS REAL) / CAST(trim(substr(new.grade, instr(new.grade, '/') + 1)) AS REAL))
            WHEN trim(replace(new.grade, '%', '')) GLOB '[0-9]*' AND trim(replace(new.grade, '%', '')) NOT GLOB '*[^0-9.]*'
              THEN min(100.0, CAST(trim(replace(new.grade, '%', '')) AS REAL))
            ELSE NULL
          END,
          new.id, (SELECT coalesce(max(position), -1) + 1 FROM grading_components WHERE module_id = new.module_id));
END;

CREATE TRIGGER exams_grades_au AFTER UPDATE OF module_id, name, start_at, weight_pct, grade ON exams BEGIN
  UPDATE grading_components SET
    module_id = new.module_id,
    name = new.name,
    weight_pct = coalesce(new.weight_pct, weight_pct),
    due_date = substr(new.start_at, 1, 10),
    score = CASE
      WHEN score_text IS new.grade THEN score
      WHEN new.grade IS NULL OR trim(new.grade) = '' THEN NULL
      WHEN instr(new.grade, '/') > 0 AND trim(substr(new.grade, 1, instr(new.grade, '/') - 1)) GLOB '[0-9]*'
           AND CAST(trim(substr(new.grade, instr(new.grade, '/') + 1)) AS REAL) > 0
        THEN min(100.0, 100.0 * CAST(trim(substr(new.grade, 1, instr(new.grade, '/') - 1)) AS REAL) / CAST(trim(substr(new.grade, instr(new.grade, '/') + 1)) AS REAL))
      WHEN trim(replace(new.grade, '%', '')) GLOB '[0-9]*' AND trim(replace(new.grade, '%', '')) NOT GLOB '*[^0-9.]*'
        THEN min(100.0, CAST(trim(replace(new.grade, '%', '')) AS REAL))
      ELSE NULL
    END,
    score_text = new.grade
  WHERE exam_id = new.id;
END;

-- Editing a linked assessment in Grades updates its exam.
CREATE TRIGGER grading_exam_au AFTER UPDATE OF name, weight_pct, score_text ON grading_components WHEN new.exam_id IS NOT NULL BEGIN
  UPDATE exams SET name = new.name, weight_pct = new.weight_pct, grade = new.score_text
  WHERE id = new.exam_id AND (name IS NOT new.name OR weight_pct IS NOT new.weight_pct OR grade IS NOT new.score_text);
END;
