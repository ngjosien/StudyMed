//! The ONLY automated behaviour in StudyMed: native Windows notifications.
//! Every tick it (1) keeps the next reminder for recurring sources (bills,
//! birthdays, due flashcards) in the `reminders` table and (2) fires reminders
//! whose time has come, stamping `fired_at`. It never changes any other data.

use std::time::Duration;

use chrono::{Duration as CDuration, Local, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::recur::{birthday_occurrences, occurrences, parse_birthday, parse_date};

const TICK: Duration = Duration::from_secs(20);
pub const REMINDERS_CHANGED: &str = "reminders-changed";

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || loop {
        if let Err(e) = tick(&app) {
            eprintln!("[scheduler] {e}");
        }
        std::thread::sleep(TICK);
    });
}

pub fn now_local() -> String {
    Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

fn tick(app: &AppHandle) -> AppResult<()> {
    let now = now_local();
    let due: Vec<(i64, String, Option<String>)> = {
        let db = app.state::<Db>();
        let conn = db.conn()?;
        ensure_recurring(&conn)?;
        let mut stmt = conn.prepare(
            "SELECT id, title, body FROM reminders
             WHERE fired_at IS NULL AND remind_at <= ?1 ORDER BY remind_at",
        )?;
        let rows = stmt.query_map([&now], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        out
    };
    if due.is_empty() {
        return Ok(());
    }
    for (id, title, body) in due {
        // Mark first so a notification error can't cause repeats every tick.
        {
            let db = app.state::<Db>();
            let conn = db.conn()?;
            conn.execute("UPDATE reminders SET fired_at = ?1 WHERE id = ?2", params![now, id])?;
        }
        if let Err(e) = show(app, &title, body.as_deref()) {
            eprintln!("[scheduler] {e}");
        }
    }
    let _ = app.emit(REMINDERS_CHANGED, ());
    Ok(())
}

pub fn show(app: &AppHandle, title: &str, body: Option<&str>) -> AppResult<()> {
    let mut n = app.notification().builder().title(title);
    if let Some(b) = body.filter(|b| !b.is_empty()) {
        n = n.body(b);
    }
    n.show().map_err(|e| AppError::msg(format!("notification failed: {e}")))
}

fn fmt(d: NaiveDate, time: &str) -> String {
    format!("{d}T{time}")
}

/// Keep exactly one pending reminder for the next occurrence of each recurring source.
fn sync_one(conn: &Connection, entity_type: &str, id: i64, desired: Option<(String, String, String)>) -> AppResult<()> {
    match desired {
        None => {
            conn.execute(
                "DELETE FROM reminders WHERE entity_type=?1 AND entity_id=?2 AND fired_at IS NULL",
                params![entity_type, id],
            )?;
        }
        Some((at, title, body)) => {
            conn.execute(
                "DELETE FROM reminders WHERE entity_type=?1 AND entity_id=?2 AND fired_at IS NULL AND remind_at != ?3",
                params![entity_type, id, at],
            )?;
            let exists: Option<i64> = conn
                .query_row(
                    "SELECT id FROM reminders WHERE entity_type=?1 AND entity_id=?2 AND remind_at=?3",
                    params![entity_type, id, at],
                    |r| r.get(0),
                )
                .optional()?;
            if exists.is_none() {
                conn.execute(
                    "INSERT INTO reminders(entity_type, entity_id, remind_at, title, body) VALUES (?1,?2,?3,?4,?5)",
                    params![entity_type, id, at, title, body],
                )?;
            }
        }
    }
    Ok(())
}

fn setting_str(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get::<_, String>(0))
        .ok()
        .and_then(|v| serde_json::from_str::<serde_json::Value>(&v).ok())
        .and_then(|v| match v {
            serde_json::Value::String(s) => Some(s),
            serde_json::Value::Bool(b) => Some(b.to_string()),
            _ => None,
        })
}

pub fn ensure_recurring(conn: &Connection) -> AppResult<()> {
    let now = Local::now().naive_local();
    let now_s = now.format("%Y-%m-%dT%H:%M").to_string();
    let today = now.date();
    let horizon = today + CDuration::days(800);
    let time = setting_str(conn, "reminders.defaultTime").unwrap_or_else(|| "09:00".into());

    // Bills
    let bills: Vec<(i64, String, i64, String, i64, String, Option<i64>, i64)> = {
        let mut stmt = conn.prepare(
            "SELECT id, name, amount_cents, freq, every_n, anchor_date, remind_days_before, active FROM bills",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?))
        })?;
        rows.collect::<Result<_, _>>()?
    };
    for (id, name, cents, freq, every, anchor, days, active) in bills {
        let desired = match (days, parse_date(&anchor), active) {
            (Some(days), Some(anchor), 1) => occurrences(anchor, &freq, every, today, horizon)
                .into_iter()
                .map(|due| (due, fmt(due - CDuration::days(days), &time)))
                .find(|(_, at)| *at > now_s)
                .map(|(due, at)| {
                    (
                        at,
                        format!("Bill due: {name}"),
                        format!("${:.2} due on {}", cents as f64 / 100.0, due.format("%a %d %b")),
                    )
                }),
            _ => None,
        };
        sync_one(conn, "bills", id, desired)?;
    }

    // Birthdays
    let people: Vec<(i64, String, Option<String>, Option<i64>)> = {
        let mut stmt = conn.prepare("SELECT id, name, birthday, birthday_remind_days FROM people")?;
        let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?;
        rows.collect::<Result<_, _>>()?
    };
    for (id, name, bd, days) in people {
        let desired = match (days, bd.as_deref().and_then(parse_birthday)) {
            (Some(days), Some((m, d, _))) => birthday_occurrences(m, d, today, horizon)
                .into_iter()
                .map(|date| (date, fmt(date - CDuration::days(days), &time)))
                .find(|(_, at)| *at > now_s)
                .map(|(date, at)| {
                    let when = if days == 0 { "today".to_string() } else { format!("on {}", date.format("%a %d %b")) };
                    (at, format!("🎂 {name}'s birthday"), format!("{name}'s birthday is {when}"))
                }),
            _ => None,
        };
        sync_one(conn, "people", id, desired)?;
    }

    // Daily flashcard digest
    let enabled = setting_str(conn, "srs.reminders").map(|v| v != "false").unwrap_or(true);
    let srs_time = setting_str(conn, "srs.reminderTime").unwrap_or_else(|| "09:00".into());
    let due: i64 = conn.query_row(
        "SELECT count(*) FROM review_schedule WHERE done_date IS NULL AND due_date <= date('now','localtime')",
        [],
        |r| r.get(0),
    )?;
    let at = fmt(today, &srs_time);
    let already: i64 = conn.query_row(
        "SELECT count(*) FROM reminders WHERE entity_type='sr_digest' AND substr(remind_at,1,10)=?1",
        [today.to_string()],
        |r| r.get(0),
    )?;
    if enabled && due > 0 && already == 0 {
        conn.execute(
            "INSERT INTO reminders(entity_type, entity_id, remind_at, title, body) VALUES ('sr_digest',0,?1,?2,?3)",
            params![
                at,
                "Time for active recall",
                format!("{due} 1-3-5-7 review{} waiting", if due == 1 { " is" } else { "s are" })
            ],
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recurring_reminders_are_kept_single_and_in_future() {
        let conn = crate::db::test_conn();
        conn.execute_batch(
            "INSERT INTO bills(name,amount_cents,freq,anchor_date,remind_days_before) VALUES('Phone',2500,'monthly','2026-01-15',2);
             INSERT INTO people(name,birthday,birthday_remind_days) VALUES('Amy','--03-14',1);",
        )
        .unwrap();
        ensure_recurring(&conn).unwrap();
        ensure_recurring(&conn).unwrap();
        let n: i64 = conn
            .query_row("SELECT count(*) FROM reminders WHERE entity_type IN ('bills','people')", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 2);
        // Turning the reminder off removes the pending one.
        conn.execute("UPDATE bills SET remind_days_before = NULL", []).unwrap();
        ensure_recurring(&conn).unwrap();
        let n: i64 = conn
            .query_row("SELECT count(*) FROM reminders WHERE entity_type='bills'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);
    }
}
