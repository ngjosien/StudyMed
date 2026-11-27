-- 0.9.5: the garden is flowers only. Decorations are put away and the laurels spent
-- on them given back (their "spent" entries are removed from the laurel history).
DELETE FROM beats WHERE source_type = 'garden' AND source_id IN (SELECT id FROM garden_decor);
DELETE FROM garden_decor;
