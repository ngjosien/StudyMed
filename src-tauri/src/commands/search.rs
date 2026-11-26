use rusqlite::types::Value as SqlValue;
use tauri::State;

use crate::commands::crud::{query_json, Row};
use crate::db::Db;
use crate::error::AppResult;

/// Prefix search across every indexed table (Ctrl+K). Locked notes and the
/// password vault are never in the index.
#[tauri::command]
pub fn search(db: State<'_, Db>, query: String, limit: Option<i64>) -> AppResult<Vec<Row>> {
    let terms: Vec<String> = query
        .split_whitespace()
        .map(|t| t.chars().filter(|c| c.is_alphanumeric()).collect::<String>())
        .filter(|t| !t.is_empty())
        .map(|t| format!("\"{t}\"*"))
        .collect();
    if terms.is_empty() {
        return Ok(vec![]);
    }
    let conn = db.conn()?;
    query_json(
        &conn,
        "SELECT entity_type, entity_id, title,
                snippet(search_fts, 3, '', '', '…', 10) AS snippet
         FROM search_fts WHERE search_fts MATCH ?1 ORDER BY rank LIMIT ?2",
        vec![SqlValue::Text(terms.join(" ")), SqlValue::Integer(limit.unwrap_or(30))],
    )
}
