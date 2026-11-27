-- =====================================================================
-- 0012: flowers grow from any study again. The option to tie a flower to one
-- module is gone, so clear any links (the column stays, unused).
-- =====================================================================

UPDATE garden_plants SET module_id = NULL WHERE module_id IS NOT NULL;
