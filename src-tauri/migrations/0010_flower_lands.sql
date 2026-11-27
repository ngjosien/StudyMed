-- =====================================================================
-- 0010: a flower garden with a new land every month.
--   * Every plant and decoration belongs to a land ('YYYY-MM'); each month's
--     land has one flower plot per day of the month.
--   * garden_credits records which study log grew which flower, on which day,
--     by how much. A flower's colour comes from how many days it took to bloom,
--     and deleting a log takes back exactly what it gave.
--   * claimed: laurels collected from a bloomed flower (NULL until collected).
--   * module_id: a flower can grow only from one module's study. Study goes first
--     to that module's flowers, then to flowers that grow from any study.
--   * The old plants become flowers, keeping their progress.
-- =====================================================================

ALTER TABLE garden_plants ADD COLUMN land TEXT;
ALTER TABLE garden_plants ADD COLUMN claimed INTEGER;
ALTER TABLE garden_plants ADD COLUMN module_id INTEGER REFERENCES modules(id) ON DELETE SET NULL;
ALTER TABLE garden_decor ADD COLUMN land TEXT;

UPDATE garden_plants SET land = substr(planted_at, 1, 7);
UPDATE garden_decor SET land = substr(created_at, 1, 7);

UPDATE garden_plants SET species = CASE species
  WHEN 'clover' THEN 'daisy'
  WHEN 'daisy' THEN 'cosmos'
  WHEN 'lavender' THEN 'hyacinth'
  WHEN 'cactus' THEN 'pansy'
  WHEN 'sunflower' THEN 'poppy'
  WHEN 'hydrangea' THEN 'mum'
  WHEN 'pumpkin' THEN 'anemone'
  WHEN 'bamboo' THEN 'lily'
  WHEN 'pine' THEN 'peony'
  WHEN 'lemon' THEN 'peony'
  WHEN 'maple' THEN 'mum'
  WHEN 'cherry' THEN 'bells'
  ELSE species END;

-- The new lands are 7 plots wide: number each land's flowers from the first plot,
-- and put its decorations at the front.
CREATE TABLE _garden_remap AS
  SELECT id, row_number() OVER (PARTITION BY land ORDER BY plot, id) - 1 AS np FROM garden_plants;
UPDATE garden_plants SET plot = (SELECT np FROM _garden_remap r WHERE r.id = garden_plants.id);
DROP TABLE _garden_remap;
CREATE TABLE _garden_remap AS
  SELECT id, 41 - (row_number() OVER (PARTITION BY land ORDER BY plot, id) - 1) AS np FROM garden_decor;
UPDATE garden_decor SET plot = (SELECT np FROM _garden_remap r WHERE r.id = garden_decor.id);
DROP TABLE _garden_remap;

CREATE INDEX idx_garden_land ON garden_plants(land, plot);

CREATE TABLE garden_credits (
  id       INTEGER PRIMARY KEY,
  plant_id INTEGER NOT NULL REFERENCES garden_plants(id) ON DELETE CASCADE,
  log_id   INTEGER NOT NULL,                     -- study_logs.id (cleaned up by trigger)
  date     TEXT NOT NULL,
  minutes  INTEGER NOT NULL CHECK (minutes > 0)
);
CREATE INDEX idx_garden_credits_plant ON garden_credits(plant_id, date);
CREATE INDEX idx_garden_credits_log ON garden_credits(log_id);

-- Study minutes fill the flowers in line, in order: each takes what it still
-- needs and passes the rest on. The last one in line keeps any extra. Flowers
-- for this log's module come first; flowers for other modules are skipped.
DROP TRIGGER IF EXISTS study_logs_garden_ai;
DROP TRIGGER IF EXISTS study_logs_garden_ad;

CREATE TRIGGER study_logs_garden_ai AFTER INSERT ON study_logs WHEN new.minutes > 0 BEGIN
  INSERT INTO garden_credits(plant_id, log_id, date, minutes)
    SELECT id, new.id, new.date, amt FROM (
      SELECT id, CASE WHEN n = total THEN new.minutes - before ELSE min(rem, new.minutes - before) END AS amt
      FROM (SELECT id, rem, n, total, sum(rem) OVER (ORDER BY n) - rem AS before
            FROM (SELECT id, max(0, need_minutes - minutes) AS rem,
                         row_number() OVER (ORDER BY module_id IS NULL, queue, id) AS n,
                         count(*) OVER () AS total
                  FROM garden_plants
                  WHERE grown_at IS NULL AND (module_id IS NULL OR module_id IS new.module_id))))
    WHERE amt > 0;
  UPDATE garden_plants
    SET minutes = minutes + (SELECT sum(c.minutes) FROM garden_credits c WHERE c.plant_id = garden_plants.id AND c.log_id = new.id)
    WHERE id IN (SELECT plant_id FROM garden_credits WHERE log_id = new.id);
  UPDATE garden_plants SET grown_at = datetime('now','localtime') WHERE grown_at IS NULL AND minutes >= need_minutes;
END;

CREATE TRIGGER study_logs_garden_ad AFTER DELETE ON study_logs BEGIN
  UPDATE garden_plants
    SET minutes = max(0, minutes - (SELECT sum(c.minutes) FROM garden_credits c WHERE c.plant_id = garden_plants.id AND c.log_id = old.id))
    WHERE id IN (SELECT plant_id FROM garden_credits WHERE log_id = old.id);
  -- Logs from before credits were kept took everything from one plant.
  UPDATE garden_plants SET minutes = max(0, minutes - old.minutes)
    WHERE old.plant_id IS NOT NULL AND id = old.plant_id AND NOT EXISTS (SELECT 1 FROM garden_credits WHERE log_id = old.id);
  DELETE FROM garden_credits WHERE log_id = old.id;
  UPDATE garden_plants SET grown_at = NULL WHERE grown_at IS NOT NULL AND minutes < need_minutes;
END;
