-- =====================================================================
-- 0002: search-index triggers, reminder cleanup triggers, default data
-- =====================================================================

-- ---- Full-text search triggers (entity_type = table name) -----------
-- school_notes
CREATE TRIGGER school_notes_fts_ai AFTER INSERT ON school_notes BEGIN
  INSERT INTO search_fts(entity_type, entity_id, title, body) VALUES ('school_notes', new.id, new.title || ' ' || coalesce(new.topic,''), new.body_md);
END;
CREATE TRIGGER school_notes_fts_au AFTER UPDATE ON school_notes BEGIN
  DELETE FROM search_fts WHERE entity_type='school_notes' AND entity_id=old.id;
  INSERT INTO search_fts(entity_type, entity_id, title, body) VALUES ('school_notes', new.id, new.title || ' ' || coalesce(new.topic,''), new.body_md);
END;
CREATE TRIGGER school_notes_fts_ad AFTER DELETE ON school_notes BEGIN
  DELETE FROM search_fts WHERE entity_type='school_notes' AND entity_id=old.id;
END;

-- todos
CREATE TRIGGER todos_fts_ai AFTER INSERT ON todos BEGIN
  INSERT INTO search_fts(entity_type, entity_id, title, body) VALUES ('todos', new.id, new.title, coalesce(new.notes_md,''));
END;
CREATE TRIGGER todos_fts_au AFTER UPDATE ON todos BEGIN
  DELETE FROM search_fts WHERE entity_type='todos' AND entity_id=old.id;
  INSERT INTO search_fts(entity_type, entity_id, title, body) VALUES ('todos', new.id, new.title, coalesce(new.notes_md,''));
END;
CREATE TRIGGER todos_fts_ad AFTER DELETE ON todos BEGIN
  DELETE FROM search_fts WHERE entity_type='todos' AND entity_id=old.id;
END;

-- events
CREATE TRIGGER events_fts_ai AFTER INSERT ON events BEGIN
  INSERT INTO search_fts(entity_type, entity_id, title, body) VALUES ('events', new.id, new.name, coalesce(new.location,'') || ' ' || coalesce(new.notes_md,''));
END;
CREATE TRIGGER events_fts_au AFTER UPDATE ON events BEGIN
  DELETE FROM search_fts WHERE entity_type='events' AND entity_id=old.id;
  INSERT INTO search_fts(entity_type, entity_id, title, body) VALUES ('events', new.id, new.name, coalesce(new.location,'') || ' ' || coalesce(new.notes_md,''));
END;
CREATE TRIGGER events_fts_ad AFTER DELETE ON events BEGIN
  DELETE FROM search_fts WHERE entity_type='events' AND entity_id=old.id;
END;

-- people
CREATE TRIGGER people_fts_ai AFTER INSERT ON people BEGIN
  INSERT INTO search_fts(entity_type, entity_id, title, body) VALUES ('people', new.id, new.name, coalesce(new.relationship_tag,'') || ' ' || coalesce(new.general_notes_md,''));
END;
CREATE TRIGGER people_fts_au AFTER UPDATE ON people BEGIN
  DELETE FROM search_fts WHERE entity_type='people' AND entity_id=old.id;
  INSERT INTO search_fts(entity_type, entity_id, title, body) VALUES ('people', new.id, new.name, coalesce(new.relationship_tag,'') || ' ' || coalesce(new.general_notes_md,''));
END;
CREATE TRIGGER people_fts_ad AFTER DELETE ON people BEGIN
  DELETE FROM search_fts WHERE entity_type='people' AND entity_id=old.id;
END;

-- homework
CREATE TRIGGER homework_fts_ai AFTER INSERT ON homework BEGIN
  INSERT INTO search_fts(entity_type, entity_id, title, body) VALUES ('homework', new.id, new.title, coalesce(new.notes_md,''));
END;
CREATE TRIGGER homework_fts_au AFTER UPDATE ON homework BEGIN
  DELETE FROM search_fts WHERE entity_type='homework' AND entity_id=old.id;
  INSERT INTO search_fts(entity_type, entity_id, title, body) VALUES ('homework', new.id, new.title, coalesce(new.notes_md,''));
END;
CREATE TRIGGER homework_fts_ad AFTER DELETE ON homework BEGIN
  DELETE FROM search_fts WHERE entity_type='homework' AND entity_id=old.id;
END;

-- exams
CREATE TRIGGER exams_fts_ai AFTER INSERT ON exams BEGIN
  INSERT INTO search_fts(entity_type, entity_id, title, body) VALUES ('exams', new.id, new.name, coalesce(new.venue,'') || ' ' || coalesce(new.reflection_md,''));
END;
CREATE TRIGGER exams_fts_au AFTER UPDATE ON exams BEGIN
  DELETE FROM search_fts WHERE entity_type='exams' AND entity_id=old.id;
  INSERT INTO search_fts(entity_type, entity_id, title, body) VALUES ('exams', new.id, new.name, coalesce(new.venue,'') || ' ' || coalesce(new.reflection_md,''));
END;
CREATE TRIGGER exams_fts_ad AFTER DELETE ON exams BEGIN
  DELETE FROM search_fts WHERE entity_type='exams' AND entity_id=old.id;
END;

-- modules
CREATE TRIGGER modules_fts_ai AFTER INSERT ON modules BEGIN
  INSERT INTO search_fts(entity_type, entity_id, title, body) VALUES ('modules', new.id, new.code || ' ' || new.name, coalesce(new.lecturer,'') || ' ' || coalesce(new.syllabus_md,''));
END;
CREATE TRIGGER modules_fts_au AFTER UPDATE ON modules BEGIN
  DELETE FROM search_fts WHERE entity_type='modules' AND entity_id=old.id;
  INSERT INTO search_fts(entity_type, entity_id, title, body) VALUES ('modules', new.id, new.code || ' ' || new.name, coalesce(new.lecturer,'') || ' ' || coalesce(new.syllabus_md,''));
END;
CREATE TRIGGER modules_fts_ad AFTER DELETE ON modules BEGIN
  DELETE FROM search_fts WHERE entity_type='modules' AND entity_id=old.id;
END;

-- portfolio_entries
CREATE TRIGGER portfolio_fts_ai AFTER INSERT ON portfolio_entries BEGIN
  INSERT INTO search_fts(entity_type, entity_id, title, body) VALUES ('portfolio_entries', new.id, new.title, coalesce(new.summary_md,'') || ' ' || coalesce(new.reflection_md,''));
END;
CREATE TRIGGER portfolio_fts_au AFTER UPDATE ON portfolio_entries BEGIN
  DELETE FROM search_fts WHERE entity_type='portfolio_entries' AND entity_id=old.id;
  INSERT INTO search_fts(entity_type, entity_id, title, body) VALUES ('portfolio_entries', new.id, new.title, coalesce(new.summary_md,'') || ' ' || coalesce(new.reflection_md,''));
END;
CREATE TRIGGER portfolio_fts_ad AFTER DELETE ON portfolio_entries BEGIN
  DELETE FROM search_fts WHERE entity_type='portfolio_entries' AND entity_id=old.id;
END;

-- interest_items
CREATE TRIGGER interest_fts_ai AFTER INSERT ON interest_items BEGIN
  INSERT INTO search_fts(entity_type, entity_id, title, body) VALUES ('interest_items', new.id, new.title, coalesce(new.notes_md,''));
END;
CREATE TRIGGER interest_fts_au AFTER UPDATE ON interest_items BEGIN
  DELETE FROM search_fts WHERE entity_type='interest_items' AND entity_id=old.id;
  INSERT INTO search_fts(entity_type, entity_id, title, body) VALUES ('interest_items', new.id, new.title, coalesce(new.notes_md,''));
END;
CREATE TRIGGER interest_fts_ad AFTER DELETE ON interest_items BEGIN
  DELETE FROM search_fts WHERE entity_type='interest_items' AND entity_id=old.id;
END;

-- moments
CREATE TRIGGER moments_fts_ai AFTER INSERT ON moments BEGIN
  INSERT INTO search_fts(entity_type, entity_id, title, body) VALUES ('moments', new.id, coalesce(new.caption,'Moment'), coalesce(new.location,''));
END;
CREATE TRIGGER moments_fts_au AFTER UPDATE ON moments BEGIN
  DELETE FROM search_fts WHERE entity_type='moments' AND entity_id=old.id;
  INSERT INTO search_fts(entity_type, entity_id, title, body) VALUES ('moments', new.id, coalesce(new.caption,'Moment'), coalesce(new.location,''));
END;
CREATE TRIGGER moments_fts_ad AFTER DELETE ON moments BEGIN
  DELETE FROM search_fts WHERE entity_type='moments' AND entity_id=old.id;
END;

-- important_notes: locked bodies are never indexed (title only)
CREATE TRIGGER inotes_fts_ai AFTER INSERT ON important_notes BEGIN
  INSERT INTO search_fts(entity_type, entity_id, title, body) VALUES ('important_notes', new.id, new.title, CASE WHEN new.locked = 0 THEN coalesce(new.body_md,'') ELSE '' END);
END;
CREATE TRIGGER inotes_fts_au AFTER UPDATE ON important_notes BEGIN
  DELETE FROM search_fts WHERE entity_type='important_notes' AND entity_id=old.id;
  INSERT INTO search_fts(entity_type, entity_id, title, body) VALUES ('important_notes', new.id, new.title, CASE WHEN new.locked = 0 THEN coalesce(new.body_md,'') ELSE '' END);
END;
CREATE TRIGGER inotes_fts_ad AFTER DELETE ON important_notes BEGIN
  DELETE FROM search_fts WHERE entity_type='important_notes' AND entity_id=old.id;
END;

-- journal triggers were created in 0001 with entity_type 'journal'; rename for consistency
DROP TRIGGER journal_ai;
DROP TRIGGER journal_au;
DROP TRIGGER journal_ad;
CREATE TRIGGER journal_fts_ai AFTER INSERT ON journal_entries BEGIN
  INSERT INTO search_fts(entity_type, entity_id, title, body) VALUES ('journal_entries', new.id, new.entry_date || ' ' || coalesce(new.title,''), new.body_md);
END;
CREATE TRIGGER journal_fts_au AFTER UPDATE ON journal_entries BEGIN
  DELETE FROM search_fts WHERE entity_type='journal_entries' AND entity_id=old.id;
  INSERT INTO search_fts(entity_type, entity_id, title, body) VALUES ('journal_entries', new.id, new.entry_date || ' ' || coalesce(new.title,''), new.body_md);
END;
CREATE TRIGGER journal_fts_ad AFTER DELETE ON journal_entries BEGIN
  DELETE FROM search_fts WHERE entity_type='journal_entries' AND entity_id=old.id;
END;
DELETE FROM search_fts WHERE entity_type='journal';
INSERT INTO search_fts(entity_type, entity_id, title, body)
  SELECT 'journal_entries', id, entry_date || ' ' || coalesce(title,''), body_md FROM journal_entries;

-- ---- Polymorphic cleanup (covers cascaded deletes too) ---------------
CREATE TRIGGER todos_cleanup AFTER DELETE ON todos BEGIN
  DELETE FROM reminders WHERE entity_type='todos' AND entity_id=old.id;
  DELETE FROM entity_tags WHERE entity_type='todos' AND entity_id=old.id;
END;
CREATE TRIGGER events_cleanup AFTER DELETE ON events BEGIN
  DELETE FROM reminders WHERE entity_type='events' AND entity_id=old.id;
END;
CREATE TRIGGER homework_cleanup AFTER DELETE ON homework BEGIN
  DELETE FROM reminders WHERE entity_type='homework' AND entity_id=old.id;
  DELETE FROM attachments WHERE entity_type='homework' AND entity_id=old.id;
END;
CREATE TRIGGER exams_cleanup AFTER DELETE ON exams BEGIN
  DELETE FROM reminders WHERE entity_type='exams' AND entity_id=old.id;
END;
CREATE TRIGGER bills_cleanup AFTER DELETE ON bills BEGIN
  DELETE FROM reminders WHERE entity_type='bills' AND entity_id=old.id;
END;
CREATE TRIGGER people_cleanup AFTER DELETE ON people BEGIN
  DELETE FROM reminders WHERE entity_type='people' AND entity_id=old.id;
END;
CREATE TRIGGER memories_cleanup AFTER DELETE ON person_memories BEGIN
  DELETE FROM attachments WHERE entity_type='person_memories' AND entity_id=old.id;
END;
CREATE TRIGGER portfolio_cleanup AFTER DELETE ON portfolio_entries BEGIN
  DELETE FROM attachments WHERE entity_type='portfolio_entries' AND entity_id=old.id;
  DELETE FROM entity_tags WHERE entity_type='portfolio_entries' AND entity_id=old.id;
END;
CREATE TRIGGER moments_cleanup AFTER DELETE ON moments BEGIN
  DELETE FROM entity_tags WHERE entity_type='moments' AND entity_id=old.id;
END;
CREATE TRIGGER interest_cleanup AFTER DELETE ON interest_items BEGIN
  DELETE FROM entity_tags WHERE entity_type='interest_items' AND entity_id=old.id;
END;

-- ---- Default data ------------------------------------------------------
INSERT INTO money_categories(name, kind, color) VALUES
  ('Food','expense','#f97316'), ('Transport','expense','#0ea5e9'), ('Shopping','expense','#ec4899'),
  ('Study','expense','#6366f1'), ('Bills','expense','#ef4444'), ('Health','expense','#10b981'),
  ('Entertainment','expense','#a855f7'), ('Other','expense','#78716c'),
  ('Allowance','income','#22c55e'), ('Salary','income','#16a34a'), ('Gift','income','#84cc16'), ('Other','income','#65a30d');

INSERT INTO wallets(name, type) VALUES ('Cash','Cash'), ('Debit Card','Debit'), ('Credit Card','Credit'), ('Savings','Savings');

INSERT INTO interest_tabs(name, icon, position, fields_json, statuses_json) VALUES
  ('Movies & Shows', 'film', 0,
   '[{"key":"kind","label":"Type","type":"text"},{"key":"season","label":"Season","type":"number"},{"key":"episode","label":"Episode","type":"number"}]',
   '["Want to Watch","Watching","Finished"]'),
  ('Things to Learn / Watch', 'lightbulb', 1,
   '[{"key":"link","label":"Link","type":"url"},{"key":"topic","label":"Topic","type":"text"},{"key":"takeaways","label":"Key Takeaways","type":"longtext"}]',
   '["To Explore","In Progress","Done"]'),
  ('Books & Reading', 'book', 2,
   '[{"key":"author","label":"Author","type":"text"},{"key":"progress","label":"Progress %","type":"progress"},{"key":"quotes","label":"Quotes","type":"longtext"}]',
   '["Want to Read","Reading","Finished"]'),
  ('Places & Food to Try', 'map', 3,
   '[{"key":"location","label":"Location","type":"text"},{"key":"cuisine","label":"Cuisine / Type","type":"text"},{"key":"visited","label":"Visited","type":"bool"}]',
   '["Want to Try","Visited"]');

INSERT INTO saved_views(page, name, filter_json, sort_json, position) VALUES
  ('todos', 'Today', '{"due":"today","hideDone":true}', '[{"key":"time","dir":"asc"}]', 0),
  ('todos', 'High Priority', '{"priority":["High"],"hideDone":true}', '[{"key":"date","dir":"asc"}]', 1),
  ('todos', 'Quick Wins', '{"maxMinutes":15,"hideDone":true}', '[{"key":"est_minutes","dir":"asc"}]', 2);

INSERT INTO note_folders(name, position) VALUES
  ('General',0), ('IDs & Documents',1), ('Insurance',2), ('Medical',3), ('Emergency Contacts',4), ('Templates',5);

INSERT INTO wishlists(name, position) VALUES ('My Wishlist', 0);
