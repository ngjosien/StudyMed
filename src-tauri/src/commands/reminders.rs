use chrono::NaiveDateTime;
use rusqlite::{params, types::Value as SqlValue};
use serde::Deserialize;
use tauri::{AppHandle, Emitter, State};

use crate::commands::crud::{query_json, Row};
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::scheduler::{self, REMINDERS_CHANGED};

fn normalize(at: &str) -> AppResult<String> {
    let parsed = NaiveDateTime::parse_from_str(at, "%Y-%m-%dT%H:%M")
        .or_else(|_| NaiveDateTime::parse_from_str(at, "%Y-%m-%dT%H:%M:%S"))
        .map_err(|_| AppError::msg(format!("invalid reminder time '{at}'")))?;
    Ok(parsed.format("%Y-%m-%dT%H:%M").to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderInput {
    remind_at: String,
    title: String,
    body: Option<String>,
}

/// Pending + fired reminders (for Settings → Notifications).
#[tauri::command]
pub fn reminders_list(db: State<'_, Db>, include_fired: bool) -> AppResult<Vec<Row>> {
    let conn = db.conn()?;
    let sql = if include_fired {
        "SELECT * FROM reminders ORDER BY fired_at IS NOT NULL, CASE WHEN fired_at IS NULL THEN remind_at END, fired_at DESC LIMIT 200"
    } else {
        "SELECT * FROM reminders WHERE fired_at IS NULL ORDER BY remind_at"
    };
    query_json(&conn, sql, vec![])
}

/// Pending reminders attached to one record.
#[tauri::command]
pub fn reminders_for(db: State<'_, Db>, entity_type: String, entity_id: i64) -> AppResult<Vec<Row>> {
    let conn = db.conn()?;
    query_json(
        &conn,
        "SELECT * FROM reminders WHERE entity_type=?1 AND entity_id=?2 AND fired_at IS NULL ORDER BY remind_at",
        vec![SqlValue::Text(entity_type), SqlValue::Integer(entity_id)],
    )
}

/// Replace a record's pending reminders. Times already in the past are dropped.
#[tauri::command]
pub fn reminders_sync(
    app: AppHandle,
    db: State<'_, Db>,
    entity_type: String,
    entity_id: i64,
    items: Vec<ReminderInput>,
) -> AppResult<()> {
    let now = scheduler::now_local();
    {
        let mut conn = db.conn()?;
        let tx = conn.transaction()?;
        tx.execute(
            "DELETE FROM reminders WHERE entity_type=?1 AND entity_id=?2 AND fired_at IS NULL",
            params![entity_type, entity_id],
        )?;
        for it in items {
            let at = normalize(&it.remind_at)?;
            if at.as_str() <= &now[..16] {
                continue;
            }
            tx.execute(
                "INSERT INTO reminders(entity_type, entity_id, remind_at, title, body) VALUES (?1,?2,?3,?4,?5)",
                params![entity_type, entity_id, at, it.title, it.body],
            )?;
        }
        tx.commit()?;
    }
    let _ = app.emit(REMINDERS_CHANGED, ());
    Ok(())
}

/// A standalone reminder (Settings → "Remind me").
#[tauri::command]
pub fn reminder_create(app: AppHandle, db: State<'_, Db>, input: ReminderInput) -> AppResult<()> {
    let at = normalize(&input.remind_at)?;
    {
        let conn = db.conn()?;
        conn.execute(
            "INSERT INTO reminders(entity_type, entity_id, remind_at, title, body) VALUES ('manual',0,?1,?2,?3)",
            params![at, input.title, input.body],
        )?;
    }
    let _ = app.emit(REMINDERS_CHANGED, ());
    Ok(())
}

#[tauri::command]
pub fn reminder_delete(app: AppHandle, db: State<'_, Db>, id: i64) -> AppResult<()> {
    {
        let conn = db.conn()?;
        conn.execute("DELETE FROM reminders WHERE id = ?1", [id])?;
    }
    let _ = app.emit(REMINDERS_CHANGED, ());
    Ok(())
}

#[tauri::command]
pub fn reminders_clear_fired(app: AppHandle, db: State<'_, Db>) -> AppResult<()> {
    {
        let conn = db.conn()?;
        conn.execute("DELETE FROM reminders WHERE fired_at IS NOT NULL", [])?;
    }
    let _ = app.emit(REMINDERS_CHANGED, ());
    Ok(())
}

#[tauri::command]
pub fn notify_now(app: AppHandle, title: String, body: Option<String>) -> AppResult<()> {
    scheduler::show(&app, &title, body.as_deref())
}
