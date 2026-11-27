use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use rusqlite::Connection;

use crate::error::{AppError, AppResult};

/// Ordered list of migrations. `PRAGMA user_version` records how many have run,
/// so a file appended here upgrades existing databases on next launch.
const MIGRATIONS: &[&str] = &[
    include_str!("../migrations/0001_init.sql"),
    include_str!("../migrations/0002_triggers_seed.sql"),
    include_str!("../migrations/0003_databases.sql"),
    include_str!("../migrations/0004_fixed_pages.sql"),
    include_str!("../migrations/0005_timetable_goals.sql"),
    include_str!("../migrations/0006_routine_links.sql"),
    include_str!("../migrations/0007_focus_beats.sql"),
    include_str!("../migrations/0008_plans_hours_gibbs.sql"),
    include_str!("../migrations/0009_topics_garden.sql"),
    include_str!("../migrations/0010_flower_lands.sql"),
    include_str!("../migrations/0011_focus_flower.sql"),
    include_str!("../migrations/0012_flowers_any_study.sql"),
    include_str!("../migrations/0013_exam_weeks.sql"),
];

pub struct Db(Mutex<Connection>);

pub struct AppPaths {
    pub data_dir: PathBuf,
    pub db_path: PathBuf,
}

impl Db {
    pub fn open(path: &Path) -> AppResult<Self> {
        let mut conn = Connection::open(path)?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;",
        )?;
        backup_before_migrating(&conn, path)?;
        migrate(&mut conn)?;
        Ok(Db(Mutex::new(conn)))
    }

    pub fn conn(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.0
            .lock()
            .map_err(|_| AppError::msg("database lock poisoned"))
    }
}

/// Schema version this build migrates to.
pub const SCHEMA_VERSION: usize = MIGRATIONS.len();

pub fn schema_version(conn: &Connection) -> AppResult<i64> {
    Ok(conn.query_row("PRAGMA user_version", [], |r| r.get(0))?)
}

/// This is the user's only copy of their data: snapshot it before any schema upgrade.
/// A failed backup stops the upgrade.
fn backup_before_migrating(conn: &Connection, path: &Path) -> AppResult<()> {
    let current = schema_version(conn)?;
    if current == 0 || current as usize >= MIGRATIONS.len() {
        return Ok(());
    }
    let dir = path
        .parent()
        .ok_or_else(|| AppError::msg("database has no parent folder"))?
        .join("backups");
    std::fs::create_dir_all(&dir)?;
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S%3f");
    let dest = dir.join(format!("studymed-v{current}-{stamp}.db"));
    conn.execute("VACUUM INTO ?1", [dest.to_string_lossy()])?;
    Ok(())
}

pub fn migrate(conn: &mut Connection) -> AppResult<()> {
    let current = schema_version(conn)? as usize;
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(current) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", (i + 1) as i64)?;
        tx.commit()?;
    }
    Ok(())
}

#[cfg(test)]
pub fn test_conn() -> Connection {
    let mut conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
    migrate(&mut conn).unwrap();
    conn
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn v3_data_survives_the_fixed_pages_upgrade() {
        let mut conn = Connection::open_in_memory().unwrap();
        for sql in &MIGRATIONS[..3] {
            conn.execute_batch(sql).unwrap();
        }
        conn.pragma_update(None, "user_version", 3).unwrap();
        conn.execute_batch(
            r#"INSERT INTO modules(code,name) VALUES('HBS2','Human Biosciences 2');
               INSERT INTO homework(module_id,title,type) VALUES(1,'Worksheet','Tutorial');
               INSERT INTO events(name,start_at) VALUES('Study date','2026-11-25T10:00');
               INSERT INTO portfolio_entries(title,category) VALUES('Attachment','Practical/Clinical Log');
               INSERT INTO savings_goals(name,target_cents,saved_cents) VALUES('Trip',50000,1200);
               INSERT INTO db_properties(db,name,type,config_json) VALUES('homework','Session','relation','{"target":"events"}');
               INSERT INTO db_values(db,row_id,prop_id,value) VALUES('homework',1,1,'[1]');"#,
        )
        .unwrap();
        migrate(&mut conn).unwrap();

        let count = |sql: &str| conn.query_row(sql, [], |r| r.get::<_, i64>(0)).unwrap();
        assert_eq!(count("SELECT count(*) FROM connections WHERE from_type='events' AND to_type='homework' AND to_id=1"), 1);
        assert_eq!(count("SELECT saved_cents FROM savings_goals"), 1200);
        assert_eq!(count("SELECT count(*) FROM db_values"), 1);
        assert_eq!(count("SELECT count(*) FROM portfolio_entries WHERE kind='Clinical & shadowing'"), 1);
        conn.execute("DELETE FROM events", []).unwrap();
        assert_eq!(count("SELECT count(*) FROM record_links"), 0);
    }

    #[test]
    fn classes_and_tick_goals() {
        let conn = test_conn();
        conn.execute_batch(
            "INSERT INTO modules(id, code, name) VALUES (1, 'HBS', 'Human Biosciences');
             INSERT INTO class_slots(module_id, kind, weekday, start_time, end_time) VALUES (1, 'Lecture', 2, '09:00', '11:00');
             INSERT INTO tick_goals(id, title, cadence, due_weekday) VALUES (1, 'Revise HBS', 'weekly', 1);
             INSERT INTO tick_goal_steps(id, goal_id, title) VALUES (5, 1, 'HBS'), (6, 1, 'INP');
             INSERT INTO tick_goal_ticks(goal_id, step_id, period) VALUES (1, 5, '2026-11-23'), (1, 6, '2026-11-23');
             INSERT INTO record_links(a_type, a_id, b_type, b_id) VALUES ('tick_goals', 1, 'modules', 1);",
        )
        .unwrap();
        // A class must end after it starts.
        assert!(conn
            .execute("INSERT INTO class_slots(module_id, weekday, start_time, end_time) VALUES (1, 0, '10:00', '09:00')", [])
            .is_err());
        // Deleting a step drops its ticks; deleting the goal drops the rest and its links.
        conn.execute("DELETE FROM tick_goal_steps WHERE id = 6", []).unwrap();
        let n: i64 = conn.query_row("SELECT count(*) FROM tick_goal_ticks", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
        conn.execute("DELETE FROM tick_goals WHERE id = 1", []).unwrap();
        let left: i64 = conn
            .query_row("SELECT (SELECT count(*) FROM tick_goal_ticks) + (SELECT count(*) FROM record_links)", [], |r| r.get(0))
            .unwrap();
        assert_eq!(left, 0);
        // Deleting a module removes its classes.
        conn.execute("DELETE FROM modules WHERE id = 1", []).unwrap();
        let classes: i64 = conn.query_row("SELECT count(*) FROM class_slots", [], |r| r.get(0)).unwrap();
        assert_eq!(classes, 0);
    }

    #[test]
    fn study_time_grows_the_garden() {
        let conn = test_conn();
        let mins = |c: &Connection, id: i64| -> (i64, bool) {
            c.query_row("SELECT minutes, grown_at IS NOT NULL FROM garden_plants WHERE id = ?1", [id], |r| Ok((r.get(0)?, r.get(1)?))).unwrap()
        };
        conn.execute_batch(
            "INSERT INTO modules(id, code, name) VALUES (1, 'HBS', 'Human Biosciences');
             INSERT INTO module_topics(module_id, week, title) VALUES (1, 3, 'Cardiac cycle');
             INSERT INTO garden_plants(id, species, plot, need_minutes, queue) VALUES (1, 'tulip', 0, 60, 0), (2, 'sunflower', 1, 180, 1);
             INSERT INTO study_logs(id, module_id, date, minutes) VALUES (1, 1, '2026-11-26', 45);",
        )
        .unwrap();
        assert_eq!(mins(&conn, 1), (45, false));
        // 45 + 30 = 75: the tulip blooms at 60 and the extra 15 go to the sunflower.
        conn.execute_batch("INSERT INTO study_logs(id, module_id, date, minutes) VALUES (2, 1, '2026-11-26', 30);").unwrap();
        assert_eq!(mins(&conn, 1), (60, true));
        assert_eq!(mins(&conn, 2), (15, false));
        // The next log goes straight to the sunflower.
        conn.execute_batch("INSERT INTO study_logs(id, module_id, date, minutes) VALUES (3, 1, '2026-11-27', 20);").unwrap();
        assert_eq!(mins(&conn, 2), (35, false));
        // Deleting a log takes its minutes back, and a plant can un-bloom.
        conn.execute_batch("DELETE FROM study_logs WHERE id = 3; DELETE FROM study_logs WHERE id = 1;").unwrap();
        assert_eq!(mins(&conn, 2), (15, false));
        assert_eq!(mins(&conn, 1), (15, false));
        // With nothing else in line, extra minutes stay on the last plant.
        conn.execute_batch("DELETE FROM garden_plants WHERE id = 2; INSERT INTO study_logs(id, module_id, date, minutes) VALUES (4, 1, '2026-11-28', 90);").unwrap();
        assert_eq!(mins(&conn, 1), (105, true));
        // Focus sessions grow it too (through their study log).
        conn.execute_batch("INSERT INTO garden_plants(id, species, plot, need_minutes) VALUES (3, 'clover', 2, 30); INSERT INTO focus_sessions(kind, module_id, planned_minutes, started_at, focus_minutes) VALUES ('academic', 1, 25, '2026-11-28T10:00', 25);").unwrap();
        assert_eq!(mins(&conn, 3), (25, false));
        conn.execute_batch("DELETE FROM modules WHERE id = 1;").unwrap();
        let left: i64 = conn.query_row("SELECT count(*) FROM module_topics", [], |r| r.get(0)).unwrap();
        assert_eq!(left, 0);
    }

    #[test]
    fn flower_credits_record_days_and_spill_down_the_line() {
        let conn = test_conn();
        let q = |sql: &str| conn.query_row(sql, [], |r| r.get::<_, i64>(0)).unwrap();
        conn.execute_batch(
            "INSERT INTO modules(id, code, name) VALUES (1, 'HBS', 'Human Biosciences');
             INSERT INTO garden_plants(id, species, land, plot, need_minutes, queue) VALUES
               (1, 'daisy', '2026-11', 0, 60, 0), (2, 'tulip', '2026-11', 1, 30, 1), (3, 'rose', '2026-11', 2, 300, 2);
             INSERT INTO study_logs(id, module_id, date, minutes) VALUES (1, 1, '2026-11-26', 40);
             INSERT INTO study_logs(id, module_id, date, minutes) VALUES (2, 1, '2026-11-27', 120);",
        )
        .unwrap();
        // 120 minutes: 20 finish the daisy, 30 grow the whole tulip, 70 go to the rose.
        assert_eq!(q("SELECT minutes FROM garden_plants WHERE id = 1"), 60);
        assert_eq!(q("SELECT minutes FROM garden_plants WHERE id = 2"), 30);
        assert_eq!(q("SELECT minutes FROM garden_plants WHERE id = 3"), 70);
        assert_eq!(q("SELECT count(*) FROM garden_plants WHERE grown_at IS NOT NULL"), 2);
        assert_eq!(q("SELECT count(DISTINCT date) FROM garden_credits WHERE plant_id = 1"), 2);
        assert_eq!(q("SELECT count(DISTINCT date) FROM garden_credits WHERE plant_id = 2"), 1);
        // Deleting the big log takes back exactly what each flower got from it.
        conn.execute_batch("DELETE FROM study_logs WHERE id = 2;").unwrap();
        assert_eq!(q("SELECT minutes FROM garden_plants WHERE id = 1"), 40);
        assert_eq!(q("SELECT minutes FROM garden_plants WHERE id = 2"), 0);
        assert_eq!(q("SELECT minutes FROM garden_plants WHERE id = 3"), 0);
        assert_eq!(q("SELECT count(*) FROM garden_plants WHERE grown_at IS NOT NULL"), 0);
        assert_eq!(q("SELECT count(*) FROM garden_credits"), 1);
        // Digging up a flower clears its credits.
        conn.execute_batch("DELETE FROM garden_plants WHERE id = 1;").unwrap();
        assert_eq!(q("SELECT count(*) FROM garden_credits"), 0);
    }

    #[test]
    fn module_flowers_grow_only_from_their_module() {
        let conn = test_conn();
        let q = |sql: &str| conn.query_row(sql, [], |r| r.get::<_, i64>(0)).unwrap();
        conn.execute_batch(
            "INSERT INTO modules(id, code, name) VALUES (1, 'HBS', 'Human Biosciences'), (2, 'INP', 'Intro to Practice');
             INSERT INTO garden_plants(id, species, land, plot, need_minutes, queue, module_id) VALUES
               (1, 'daisy', '2026-11', 0, 60, 0, NULL), (2, 'tulip', '2026-11', 1, 90, 1, 1), (3, 'rose', '2026-11', 2, 300, 2, 2);
             INSERT INTO study_logs(id, module_id, date, minutes) VALUES (1, 1, '2026-11-26', 100);",
        )
        .unwrap();
        // HBS study fills the HBS tulip first, then the any-study daisy; the INP rose waits.
        assert_eq!(q("SELECT minutes FROM garden_plants WHERE id = 2"), 90);
        assert_eq!(q("SELECT minutes FROM garden_plants WHERE id = 1"), 10);
        assert_eq!(q("SELECT minutes FROM garden_plants WHERE id = 3"), 0);
        conn.execute_batch("INSERT INTO study_logs(id, module_id, date, minutes) VALUES (2, 2, '2026-11-26', 30);").unwrap();
        assert_eq!(q("SELECT minutes FROM garden_plants WHERE id = 3"), 30);
        assert_eq!(q("SELECT minutes FROM garden_plants WHERE id = 1"), 10);
        // A focus session grows the flower picked for it first, even one further back in line.
        conn.execute_batch(
            "INSERT INTO garden_plants(id, species, land, plot, need_minutes, queue) VALUES (4, 'pansy', '2026-11', 3, 60, 9);
             INSERT INTO focus_sessions(kind, module_id, planned_minutes, started_at, focus_minutes, plant_id) VALUES ('academic', 1, 45, '2026-11-27T10:00', 45, 4);",
        )
        .unwrap();
        assert_eq!(q("SELECT minutes FROM garden_plants WHERE id = 4"), 45);
        assert_eq!(q("SELECT minutes FROM garden_plants WHERE id = 1"), 10);
        // Deleting a module lets its flowers grow from any study.
        conn.execute_batch("DELETE FROM modules WHERE id = 2;").unwrap();
        assert_eq!(q("SELECT count(*) FROM garden_plants WHERE module_id IS NULL"), 3);
    }

    #[test]
    fn old_gardens_become_flower_lands() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        for sql in &MIGRATIONS[..9] {
            conn.execute_batch(sql).unwrap();
        }
        conn.pragma_update(None, "user_version", 9).unwrap();
        conn.execute_batch(
            "INSERT INTO modules(id, code, name) VALUES (1, 'HBS', 'Human Biosciences');
             INSERT INTO garden_plants(id, species, plot, need_minutes, queue, planted_at) VALUES
               (1, 'cherry', 14, 900, 0, '2026-11-20 10:00'), (2, 'daisy', 3, 90, 1, '2026-11-21 10:00');
             INSERT INTO garden_decor(id, kind, plot, created_at) VALUES (1, 'bench', 9, '2026-11-22 10:00');
             INSERT INTO study_logs(id, module_id, date, minutes) VALUES (1, 1, '2026-11-26', 50);",
        )
        .unwrap();
        migrate(&mut conn).unwrap();
        let s = |sql: &str| conn.query_row(sql, [], |r| r.get::<_, String>(0)).unwrap();
        let n = |sql: &str| conn.query_row(sql, [], |r| r.get::<_, i64>(0)).unwrap();
        assert_eq!(s("SELECT species || ':' || plot || ':' || land FROM garden_plants WHERE id = 1"), "bells:1:2026-11");
        assert_eq!(s("SELECT species || ':' || plot FROM garden_plants WHERE id = 2"), "cosmos:0");
        assert_eq!(s("SELECT plot || ':' || land FROM garden_decor"), "41:2026-11");
        // Minutes from before the upgrade are still taken back when their log is deleted.
        assert_eq!(n("SELECT minutes FROM garden_plants WHERE id = 1"), 50);
        conn.execute_batch("DELETE FROM study_logs WHERE id = 1;").unwrap();
        assert_eq!(n("SELECT minutes FROM garden_plants WHERE id = 1"), 0);
    }

    #[test]
    fn revision_plans_hours_and_gibbs() {
        let conn = test_conn();
        conn.execute_batch(
            "INSERT INTO modules(id, code, name) VALUES (1, 'HBS', 'Human Biosciences');
             INSERT INTO exams(id, module_id, name, start_at) VALUES (1, 1, 'Final', '2026-12-20 09:00');
             INSERT INTO exam_topics(id, exam_id, title) VALUES (1, 1, 'Cardiac cycle');
             INSERT INTO todos(id, title, date, plan_exam_id, plan_topic_id, plan_kind) VALUES (1, 'Learn: Cardiac cycle', '2026-12-01', 1, 1, 'learn');
             INSERT INTO portfolio_entries(id, title, category, kind, count_events) VALUES (1, 'Red Cross Youth', 'Project', 'CCA', 'subtype:CCA: Red Cross');
             INSERT INTO activity_logs(entry_id, date, hours) VALUES (1, '2026-11-20', 3.5);
             INSERT INTO journal_entries(id, entry_date, format, gibbs_json) VALUES (1, '2026-11-26', 'gibbs', '{\"description\":\"First ward round\"}');",
        )
        .unwrap();
        assert!(conn.execute("INSERT INTO activity_logs(entry_id, date, hours) VALUES (1, '2026-11-21', 0)", []).is_err());
        // Gibbs stages are searchable.
        let hits: i64 = conn.query_row("SELECT count(*) FROM search_fts WHERE search_fts MATCH 'ward' AND entity_type = 'journal_entries'", [], |r| r.get(0)).unwrap();
        assert_eq!(hits, 1);
        // A deleted topic leaves its to-do; a deleted exam takes its plan with it.
        conn.execute_batch("DELETE FROM exam_topics WHERE id = 1;").unwrap();
        let topic: Option<i64> = conn.query_row("SELECT plan_topic_id FROM todos WHERE id = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(topic, None);
        conn.execute_batch("DELETE FROM exams WHERE id = 1; DELETE FROM portfolio_entries WHERE id = 1;").unwrap();
        let left: i64 = conn.query_row("SELECT (SELECT count(*) FROM todos) + (SELECT count(*) FROM activity_logs)", [], |r| r.get(0)).unwrap();
        assert_eq!(left, 0);
    }

    #[test]
    fn focus_sessions_and_todos_earn_beats() {
        let conn = test_conn();
        let bal = |c: &Connection| -> i64 { c.query_row("SELECT coalesce(sum(amount),0) FROM beats", [], |r| r.get(0)).unwrap() };
        conn.execute_batch(
            "INSERT INTO modules(id, code, name) VALUES (1, 'HBS', 'Human Biosciences');
             INSERT INTO todos(id, title) VALUES (1, 'Read chapter 4');
             INSERT INTO focus_sessions(id, kind, module_id, planned_minutes, started_at, focus_minutes) VALUES (1, 'academic', 1, 60, '2026-11-26T09:00', 75);
             INSERT INTO focus_sessions(id, kind, label, planned_minutes, started_at, focus_minutes) VALUES (2, 'other', 'Reading', 30, '2026-11-26T20:00', 20);",
        )
        .unwrap();
        assert_eq!(bal(&conn), 95);
        // Only the academic session counts toward the module's study log.
        let logged: i64 = conn.query_row("SELECT coalesce(sum(minutes),0) FROM study_logs WHERE module_id = 1 AND date = '2026-11-26'", [], |r| r.get(0)).unwrap();
        assert_eq!(logged, 75);
        // Ticking a to-do earns 5; ticking it twice or un-ticking doesn't farm.
        conn.execute_batch("UPDATE todos SET done = 1 WHERE id = 1; UPDATE todos SET done = 1 WHERE id = 1;").unwrap();
        assert_eq!(bal(&conn), 100);
        conn.execute_batch("UPDATE todos SET done = 0 WHERE id = 1;").unwrap();
        assert_eq!(bal(&conn), 95);
        // Editing a session's minutes re-counts both the study log and beats.
        conn.execute_batch("UPDATE focus_sessions SET focus_minutes = 50 WHERE id = 1;").unwrap();
        assert_eq!(bal(&conn), 70);
        let logged: i64 = conn.query_row("SELECT coalesce(sum(minutes),0) FROM study_logs", [], |r| r.get(0)).unwrap();
        assert_eq!(logged, 50);
        // Deleting a session removes what it earned and logged.
        conn.execute_batch("DELETE FROM focus_sessions WHERE id = 1;").unwrap();
        assert_eq!(bal(&conn), 20);
        let logs: i64 = conn.query_row("SELECT count(*) FROM study_logs", [], |r| r.get(0)).unwrap();
        assert_eq!(logs, 0);
        // Spending.
        conn.execute_batch("INSERT INTO rewards(id, name, cost) VALUES (1, 'Bubble tea', 15); INSERT INTO beats(amount, reason, source_type, source_id) VALUES (-15, 'Treat · Bubble tea', 'rewards', 1);").unwrap();
        assert_eq!(bal(&conn), 5);
    }

    #[test]
    fn todos_linked_to_homework_show_on_the_module() {
        let conn = test_conn();
        conn.execute_batch(
            "INSERT INTO modules(id, code, name) VALUES (1, 'HBS', 'Human Biosciences'), (2, 'PHAR', 'Pharmacology');
             INSERT INTO homework(id, module_id, title, type) VALUES (7, 1, 'Cardiac case study', 'Assignment');
             INSERT INTO exams(id, module_id, name) VALUES (3, 2, 'Class test');
             INSERT INTO todos(id, title) VALUES (10, 'Finish references'), (11, 'Revise drugs');
             INSERT INTO record_links(a_type, a_id, b_type, b_id) VALUES ('todos', 10, 'homework', 7), ('exams', 3, 'todos', 11);
             INSERT INTO events(id, name, start_at, type, subtype, module_id) VALUES (4, 'PHAR replacement class', '2026-12-01 09:00', 'School', 'Rescheduled class', 2);",
        )
        .unwrap();
        let on = |m: i64| -> Vec<(String, i64)> {
            let mut s = conn
                .prepare("SELECT DISTINCT to_type, to_id FROM connections WHERE from_type='modules' AND from_id=?1 AND to_type IN ('todos','events') ORDER BY 1, 2")
                .unwrap();
            s.query_map([m], |r| Ok((r.get(0)?, r.get(1)?))).unwrap().map(Result::unwrap).collect()
        };
        assert_eq!(on(1), vec![("todos".into(), 10)]);
        assert_eq!(on(2), vec![("events".into(), 4), ("todos".into(), 11)]);
        // And the reverse direction, so the to-do shows its module.
        let back: i64 = conn
            .query_row("SELECT count(*) FROM connections WHERE from_type='todos' AND from_id=10 AND to_type='modules' AND to_id=1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(back, 1);
        // Routine items must end after they start; ticks go with their item.
        assert!(conn.execute("INSERT INTO routine_items(title, start_time, end_time) VALUES ('x', '10:00', '09:00')", []).is_err());
        conn.execute_batch("INSERT INTO routine_items(id, title, start_time) VALUES (1, 'Check homework', '07:00'); INSERT INTO routine_ticks VALUES (1, '2026-11-26'); DELETE FROM routine_items WHERE id = 1;").unwrap();
        let ticks: i64 = conn.query_row("SELECT count(*) FROM routine_ticks", [], |r| r.get(0)).unwrap();
        assert_eq!(ticks, 0);
    }

    #[test]
    fn review_days_are_1_3_5_7_then_weekly_three_times() {
        let conn = test_conn();
        conn.execute_batch(
            "INSERT INTO modules(code,name) VALUES('A','A');
             INSERT INTO review_topics(module_id,title,learned_date) VALUES(1,'Heart','2026-11-22');",
        )
        .unwrap();
        let mut stmt = conn.prepare("SELECT offset_days, due_date FROM review_schedule ORDER BY step").unwrap();
        let rows: Vec<(i64, String)> = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).unwrap().map(Result::unwrap).collect();
        assert_eq!(rows.iter().map(|r| r.0).collect::<Vec<_>>(), vec![1, 3, 5, 7, 14, 21, 28]);
        assert_eq!(rows[0].1, "2026-11-23");
        assert_eq!(rows[6].1, "2026-12-20");
    }

    #[test]
    fn upgrade_backs_up_existing_data_first() {
        let stamp = chrono::Local::now().timestamp_nanos_opt().unwrap();
        let dir = std::env::temp_dir().join(format!("studymed-unit-test-{stamp}"));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("studymed.db");
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(MIGRATIONS[0]).unwrap();
            conn.execute("INSERT INTO todos(title) VALUES('keep me')", []).unwrap();
            conn.pragma_update(None, "user_version", 1).unwrap();
        }
        let db = Db::open(&path).unwrap();
        let kept: String = db.conn().unwrap().query_row("SELECT title FROM todos", [], |r| r.get(0)).unwrap();
        assert_eq!(kept, "keep me");

        let backups: Vec<_> = std::fs::read_dir(dir.join("backups")).unwrap().map(|e| e.unwrap().path()).collect();
        assert_eq!(backups.len(), 1);
        let copy = Connection::open(&backups[0]).unwrap();
        assert_eq!(schema_version(&copy).unwrap(), 1);
        let saved: String = copy.query_row("SELECT title FROM todos", [], |r| r.get(0)).unwrap();
        assert_eq!(saved, "keep me");
    }

    #[test]
    fn migrations_apply_and_relations_work() {
        let conn = test_conn();
        assert_eq!(schema_version(&conn).unwrap(), MIGRATIONS.len() as i64);

        conn.execute_batch(
            "INSERT INTO modules(code,name,color) VALUES('HBS2','Human Biosciences 2','#ef4444');
             INSERT INTO exams(module_id,name,start_at,duration_min,venue) VALUES(1,'Class Test','2026-11-25T09:00',90,'LT1');
             INSERT INTO todos(title,date) VALUES('Buy groceries','2026-11-22');
             INSERT INTO journal_entries(entry_date,title,body_md) VALUES('2026-11-21','First','hello anatomy');
             INSERT INTO reminders(entity_type,entity_id,remind_at,title) VALUES('exams',1,'2026-11-24T09:00','x');",
        )
        .unwrap();

        let (title, end): (String, String) = conn
            .query_row(
                "SELECT title, end_at FROM calendar_items WHERE layer='exam'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(title, "HBS2 · Class Test");
        assert_eq!(end, "2026-11-25T10:30");

        let hit: String = conn
            .query_row(
                "SELECT entity_type FROM search_fts WHERE search_fts MATCH '\"anat\"*'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(hit, "journal_entries");

        // Cascade: deleting a module removes its exams and their reminders.
        conn.execute("DELETE FROM modules WHERE id=1", []).unwrap();
        let n: i64 = conn
            .query_row("SELECT (SELECT count(*) FROM exams) + (SELECT count(*) FROM reminders)", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);

        let cats: i64 = conn
            .query_row("SELECT count(*) FROM money_categories", [], |r| r.get(0))
            .unwrap();
        assert!(cats > 0);
    }
}
