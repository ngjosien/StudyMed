-- =====================================================================
-- 0011: pick the flower a focus session grows.
--   * focus_sessions.plant_id: the flower chosen when the session was set up.
--     Its study minutes go to that flower first, then down the line as usual.
-- =====================================================================

ALTER TABLE focus_sessions ADD COLUMN plant_id INTEGER REFERENCES garden_plants(id) ON DELETE SET NULL;

DROP TRIGGER IF EXISTS study_logs_garden_ai;

CREATE TRIGGER study_logs_garden_ai AFTER INSERT ON study_logs WHEN new.minutes > 0 BEGIN
  INSERT INTO garden_credits(plant_id, log_id, date, minutes)
    SELECT id, new.id, new.date, amt FROM (
      SELECT id, CASE WHEN n = total THEN new.minutes - before ELSE min(rem, new.minutes - before) END AS amt
      FROM (SELECT id, rem, n, total, sum(rem) OVER (ORDER BY n) - rem AS before
            FROM (SELECT id, max(0, need_minutes - minutes) AS rem,
                         row_number() OVER (ORDER BY id IS (SELECT f.plant_id FROM focus_sessions f WHERE f.id = new.focus_session_id) DESC,
                                                     module_id IS NULL, queue, id) AS n,
                         count(*) OVER () AS total
                  FROM garden_plants
                  WHERE grown_at IS NULL AND (module_id IS NULL OR module_id IS new.module_id))))
    WHERE amt > 0;
  UPDATE garden_plants
    SET minutes = minutes + (SELECT sum(c.minutes) FROM garden_credits c WHERE c.plant_id = garden_plants.id AND c.log_id = new.id)
    WHERE id IN (SELECT plant_id FROM garden_credits WHERE log_id = new.id);
  UPDATE garden_plants SET grown_at = datetime('now','localtime') WHERE grown_at IS NULL AND minutes >= need_minutes;
END;
