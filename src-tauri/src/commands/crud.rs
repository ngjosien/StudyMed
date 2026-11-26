//! Validated generic CRUD. The frontend names a table and columns; every name is
//! checked against a whitelist and the live schema (PRAGMA table_info) before it
//! is placed in SQL, and every value is bound as a parameter.

use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params_from_iter, Connection};
use serde_json::{Map, Number, Value};
use tauri::State;

use crate::db::Db;
use crate::error::{AppError, AppResult};

pub type Row = Map<String, Value>;

/// Tables the frontend may read/write generically.
const TABLES: &[&str] = &[
    "modules", "grading_components", "school_notes", "homework", "exams", "exam_topics",
    "decks", "cards", "card_reviews", "portfolio_entries",
    "todos", "people", "person_details", "person_memories", "person_plans",
    "events", "event_checklist", "event_people",
    "wallets", "money_categories", "transactions", "budgets", "bills", "savings_goals",
    "journal_entries", "habits", "habit_checks", "moments", "moment_photos",
    "interest_tabs", "interest_items", "note_folders", "important_notes",
    "wishlists", "wishlist_items", "attachments", "saved_views", "tags", "entity_tags",
    "note_exam_links", "note_homework_links", "homework_exam_links", "exam_deck_links",
    "db_properties", "db_values", "db_views",
    "record_links", "connections", "routine_blocks", "study_logs",
    "review_topics", "review_checks", "review_schedule",
    "weekly_limits", "goal_items", "goal_deposits",
    "class_slots", "tick_goals", "tick_goal_steps", "tick_goal_ticks",
    "routine_items", "routine_ticks", "study_targets",
];

/// Tables that must not be listed generically (contents gated by the vault).
const NO_GENERIC_READ: &[&str] = &["wishlist_items"];

/// Columns only the dedicated (vault) commands may change.
fn blocked_cols(table: &str) -> &'static [&'static str] {
    match table {
        "important_notes" => &["locked", "body_enc", "body_nonce"],
        "wishlists" => &["locked"],
        _ => &[],
    }
}

fn check_table(table: &str) -> AppResult<()> {
    if TABLES.contains(&table) {
        Ok(())
    } else {
        Err(AppError::msg(format!("unknown table '{table}'")))
    }
}

pub fn columns(conn: &Connection, table: &str) -> AppResult<Vec<String>> {
    check_table(table)?;
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(1))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

fn check_col(cols: &[String], c: &str) -> AppResult<()> {
    if cols.iter().any(|x| x == c) {
        Ok(())
    } else {
        Err(AppError::msg(format!("unknown column '{c}'")))
    }
}

pub fn json_to_sql(v: &Value) -> SqlValue {
    match v {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(*b as i64),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                SqlValue::Integer(i)
            } else {
                SqlValue::Real(n.as_f64().unwrap_or(0.0))
            }
        }
        Value::String(s) => SqlValue::Text(s.clone()),
        other => SqlValue::Text(other.to_string()),
    }
}

fn ref_to_json(v: ValueRef<'_>) -> Value {
    match v {
        ValueRef::Null | ValueRef::Blob(_) => Value::Null,
        ValueRef::Integer(i) => Value::Number(i.into()),
        ValueRef::Real(f) => Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
    }
}

/// Run any SELECT and return rows as JSON objects.
pub fn query_json(conn: &Connection, sql: &str, params: Vec<SqlValue>) -> AppResult<Vec<Row>> {
    let mut stmt = conn.prepare(sql)?;
    let names: Vec<String> = stmt.column_names().into_iter().map(|s| s.to_string()).collect();
    let mut rows = stmt.query(params_from_iter(params))?;
    let mut out = Vec::new();
    while let Some(row) = rows.next()? {
        let mut m = Map::new();
        for (i, n) in names.iter().enumerate() {
            m.insert(n.clone(), ref_to_json(row.get_ref(i)?));
        }
        out.push(m);
    }
    Ok(out)
}

fn build_where(cols: &[String], filter: Option<&Row>) -> AppResult<(String, Vec<SqlValue>)> {
    let mut clauses = Vec::new();
    let mut params = Vec::new();
    if let Some(f) = filter {
        for (k, v) in f {
            check_col(cols, k)?;
            match v {
                Value::Null => clauses.push(format!("{k} IS NULL")),
                Value::Object(ops) => {
                    for (op, val) in ops {
                        let sql_op = match op.as_str() {
                            "gte" => ">=",
                            "lte" => "<=",
                            "gt" => ">",
                            "lt" => "<",
                            "ne" => "!=",
                            "like" => "LIKE",
                            "null" => {
                                clauses.push(if val.as_bool().unwrap_or(true) {
                                    format!("{k} IS NULL")
                                } else {
                                    format!("{k} IS NOT NULL")
                                });
                                continue;
                            }
                            "in" => {
                                let arr = val.as_array().cloned().unwrap_or_default();
                                if arr.is_empty() {
                                    clauses.push("0".into());
                                } else {
                                    clauses.push(format!(
                                        "{k} IN ({})",
                                        vec!["?"; arr.len()].join(",")
                                    ));
                                    params.extend(arr.iter().map(json_to_sql));
                                }
                                continue;
                            }
                            _ => return Err(AppError::msg(format!("bad operator '{op}'"))),
                        };
                        clauses.push(format!("{k} {sql_op} ?"));
                        params.push(json_to_sql(val));
                    }
                }
                _ => {
                    clauses.push(format!("{k} = ?"));
                    params.push(json_to_sql(v));
                }
            }
        }
    }
    let sql = if clauses.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", clauses.join(" AND "))
    };
    Ok((sql, params))
}

fn build_order(cols: &[String], order: Option<&str>) -> AppResult<String> {
    let Some(order) = order.filter(|o| !o.trim().is_empty()) else {
        return Ok(String::new());
    };
    let mut parts = Vec::new();
    for p in order.split(',') {
        let mut it = p.split_whitespace();
        let col = it.next().unwrap_or_default();
        check_col(cols, col)?;
        let dir = match it.next().map(|d| d.to_ascii_lowercase()) {
            Some(d) if d == "desc" => "DESC",
            _ => "ASC",
        };
        parts.push(format!("{col} IS NULL, {col} {dir}"));
    }
    Ok(format!(" ORDER BY {}", parts.join(", ")))
}

fn get_row(conn: &Connection, table: &str, id: i64) -> AppResult<Row> {
    query_json(conn, &format!("SELECT * FROM {table} WHERE id = ?"), vec![SqlValue::Integer(id)])?
        .into_iter()
        .next()
        .ok_or_else(|| AppError::msg("record not found"))
}

fn writable(cols: &[String], table: &str, values: &Row) -> AppResult<Vec<(String, SqlValue)>> {
    let blocked = blocked_cols(table);
    let mut out = Vec::new();
    for (k, v) in values {
        if k == "id" || k == "created_at" {
            continue;
        }
        check_col(cols, k)?;
        if blocked.contains(&k.as_str()) {
            return Err(AppError::msg(format!("'{k}' can only be changed from the vault")));
        }
        out.push((k.clone(), json_to_sql(v)));
    }
    Ok(out)
}

#[tauri::command]
pub fn rows_list(
    db: State<'_, Db>,
    table: String,
    filter: Option<Row>,
    order: Option<String>,
    limit: Option<i64>,
) -> AppResult<Vec<Row>> {
    if NO_GENERIC_READ.contains(&table.as_str()) {
        return Err(AppError::msg("use the dedicated command for this table"));
    }
    let conn = db.conn()?;
    let cols = columns(&conn, &table)?;
    let (w, params) = build_where(&cols, filter.as_ref())?;
    let o = build_order(&cols, order.as_deref())?;
    let l = limit.map(|n| format!(" LIMIT {}", n.max(0))).unwrap_or_default();
    query_json(&conn, &format!("SELECT * FROM {table}{w}{o}{l}"), params)
}

#[tauri::command]
pub fn row_get(db: State<'_, Db>, table: String, id: i64) -> AppResult<Row> {
    if NO_GENERIC_READ.contains(&table.as_str()) {
        return Err(AppError::msg("use the dedicated command for this table"));
    }
    let conn = db.conn()?;
    check_table(&table)?;
    get_row(&conn, &table, id)
}

pub fn insert(conn: &Connection, table: &str, values: &Row) -> AppResult<Row> {
    let cols = columns(conn, table)?;
    let w = writable(&cols, table, values)?;
    if w.is_empty() {
        conn.execute(&format!("INSERT INTO {table} DEFAULT VALUES"), [])?;
    } else {
        let names: Vec<&str> = w.iter().map(|(k, _)| k.as_str()).collect();
        let sql = format!(
            "INSERT INTO {table} ({}) VALUES ({})",
            names.join(", "),
            vec!["?"; w.len()].join(", ")
        );
        conn.execute(&sql, params_from_iter(w.into_iter().map(|(_, v)| v)))?;
    }
    if NO_GENERIC_READ.contains(&table) {
        // Writing must not be a way to read gated rows.
        Ok(Row::from_iter([("id".to_string(), Value::from(conn.last_insert_rowid()))]))
    } else if cols.iter().any(|c| c == "id") {
        get_row(conn, table, conn.last_insert_rowid())
    } else {
        Ok(values.clone())
    }
}

#[tauri::command]
pub fn row_insert(db: State<'_, Db>, table: String, values: Row) -> AppResult<Row> {
    let conn = db.conn()?;
    insert(&conn, &table, &values)
}

#[tauri::command]
pub fn rows_insert(db: State<'_, Db>, table: String, rows: Vec<Row>) -> AppResult<Vec<Row>> {
    let mut conn = db.conn()?;
    let tx = conn.transaction()?;
    let mut out = Vec::new();
    for r in &rows {
        out.push(insert(&tx, &table, r)?);
    }
    tx.commit()?;
    Ok(out)
}

pub fn update(conn: &Connection, table: &str, id: i64, values: &Row) -> AppResult<Row> {
    let cols = columns(conn, table)?;
    let w = writable(&cols, table, values)?;
    let mut sets: Vec<String> = w.iter().map(|(k, _)| format!("{k} = ?")).collect();
    if cols.iter().any(|c| c == "updated_at") && !values.contains_key("updated_at") {
        sets.push("updated_at = datetime('now','localtime')".into());
    }
    if !sets.is_empty() {
        let mut params: Vec<SqlValue> = w.into_iter().map(|(_, v)| v).collect();
        params.push(SqlValue::Integer(id));
        conn.execute(
            &format!("UPDATE {table} SET {} WHERE id = ?", sets.join(", ")),
            params_from_iter(params),
        )?;
    }
    if NO_GENERIC_READ.contains(&table) {
        // An update (even an empty one) must not reveal a locked wishlist item.
        return Ok(Row::from_iter([("id".to_string(), Value::from(id))]));
    }
    get_row(conn, table, id)
}

#[tauri::command]
pub fn row_update(db: State<'_, Db>, table: String, id: i64, values: Row) -> AppResult<Row> {
    let conn = db.conn()?;
    update(&conn, &table, id, &values)
}

#[tauri::command]
pub fn row_delete(db: State<'_, Db>, table: String, id: i64) -> AppResult<()> {
    let conn = db.conn()?;
    check_table(&table)?;
    conn.execute(&format!("DELETE FROM {table} WHERE id = ?"), [id])?;
    // Custom property values belong to "<table>" or "<table>:<sub>" databases.
    conn.execute(
        "DELETE FROM db_values WHERE row_id = ?1 AND (db = ?2 OR db LIKE ?2 || ':%')",
        rusqlite::params![id, table],
    )?;
    Ok(())
}

/// Set (or clear, with null) one custom property value.
#[tauri::command]
pub fn db_value_set(db: State<'_, Db>, database: String, row_id: i64, prop_id: i64, value: Value) -> AppResult<()> {
    let conn = db.conn()?;
    let empty = value.is_null()
        || value.as_str().is_some_and(|s| s.is_empty())
        || value.as_array().is_some_and(|a| a.is_empty());
    if empty {
        conn.execute(
            "DELETE FROM db_values WHERE db = ?1 AND row_id = ?2 AND prop_id = ?3",
            rusqlite::params![database, row_id, prop_id],
        )?;
    } else {
        conn.execute(
            "INSERT INTO db_values(db, row_id, prop_id, value) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(db, row_id, prop_id) DO UPDATE SET value = excluded.value",
            rusqlite::params![database, row_id, prop_id, serde_json::to_string(&value)?],
        )?;
    }
    Ok(())
}

/// Delete rows matching an equality filter (used for composite-key tables like habit_checks).
#[tauri::command]
pub fn rows_delete_where(db: State<'_, Db>, table: String, filter: Row) -> AppResult<usize> {
    if filter.is_empty() {
        return Err(AppError::msg("refusing to delete without a filter"));
    }
    let conn = db.conn()?;
    let cols = columns(&conn, &table)?;
    let (w, params) = build_where(&cols, Some(&filter))?;
    Ok(conn.execute(&format!("DELETE FROM {table}{w}"), params_from_iter(params))?)
}

/// Reorder: set `position` = index for the given ids.
#[tauri::command]
pub fn rows_reorder(db: State<'_, Db>, table: String, ids: Vec<i64>) -> AppResult<()> {
    let mut conn = db.conn()?;
    let cols = columns(&conn, &table)?;
    check_col(&cols, "position")?;
    let tx = conn.transaction()?;
    for (i, id) in ids.iter().enumerate() {
        tx.execute(
            &format!("UPDATE {table} SET position = ?1 WHERE id = ?2"),
            rusqlite::params![i as i64, id],
        )?;
    }
    tx.commit()?;
    Ok(())
}

// ---- Many-to-many links ----------------------------------------------------

const LINKS: &[(&str, &str, &str)] = &[
    ("note_exam_links", "note_id", "exam_id"),
    ("note_homework_links", "note_id", "homework_id"),
    ("homework_exam_links", "homework_id", "exam_id"),
    ("exam_deck_links", "exam_id", "deck_id"),
    ("event_people", "event_id", "person_id"),
];

/// Replace the set of linked ids for one side of a join table.
#[tauri::command]
pub fn links_set(
    db: State<'_, Db>,
    table: String,
    col: String,
    id: i64,
    other_ids: Vec<i64>,
) -> AppResult<()> {
    let (_, a, b) = LINKS
        .iter()
        .find(|(t, _, _)| *t == table)
        .ok_or_else(|| AppError::msg("unknown link table"))?;
    let other = if col == *a {
        *b
    } else if col == *b {
        *a
    } else {
        return Err(AppError::msg("unknown link column"));
    };
    let mut conn = db.conn()?;
    let tx = conn.transaction()?;
    tx.execute(&format!("DELETE FROM {table} WHERE {col} = ?"), [id])?;
    for o in other_ids {
        tx.execute(
            &format!("INSERT OR IGNORE INTO {table} ({col}, {other}) VALUES (?1, ?2)"),
            [id, o],
        )?;
    }
    tx.commit()?;
    Ok(())
}

// ---- Tags ------------------------------------------------------------------

/// All tag assignments for an entity type within one scope.
#[tauri::command]
pub fn entity_tags_list(db: State<'_, Db>, entity_type: String, scope: String) -> AppResult<Vec<Row>> {
    let conn = db.conn()?;
    query_json(
        &conn,
        "SELECT et.entity_id, t.id AS tag_id, t.name, t.color
         FROM entity_tags et JOIN tags t ON t.id = et.tag_id
         WHERE et.entity_type = ?1 AND t.scope = ?2 ORDER BY t.name",
        vec![SqlValue::Text(entity_type), SqlValue::Text(scope)],
    )
}

/// Replace an entity's tags within a scope, creating tags that don't exist yet.
#[tauri::command]
pub fn entity_tags_set(
    db: State<'_, Db>,
    entity_type: String,
    entity_id: i64,
    scope: String,
    names: Vec<String>,
) -> AppResult<()> {
    let mut conn = db.conn()?;
    let tx = conn.transaction()?;
    tx.execute(
        "DELETE FROM entity_tags WHERE entity_type = ?1 AND entity_id = ?2
         AND tag_id IN (SELECT id FROM tags WHERE scope = ?3)",
        rusqlite::params![entity_type, entity_id, scope],
    )?;
    for n in names.iter().map(|n| n.trim()).filter(|n| !n.is_empty()) {
        tx.execute(
            "INSERT OR IGNORE INTO tags(scope, name) VALUES (?1, ?2)",
            rusqlite::params![scope, n],
        )?;
        let tag_id: i64 = tx.query_row(
            "SELECT id FROM tags WHERE scope = ?1 AND name = ?2",
            rusqlite::params![scope, n],
            |r| r.get(0),
        )?;
        tx.execute(
            "INSERT OR IGNORE INTO entity_tags(tag_id, entity_type, entity_id) VALUES (?1, ?2, ?3)",
            rusqlite::params![tag_id, entity_type, entity_id],
        )?;
    }
    tx.commit()?;
    Ok(())
}

// ---- Named read queries (aggregates the generic layer can't express) --------

#[tauri::command]
pub fn query_named(db: State<'_, Db>, name: String, params: Vec<Value>) -> AppResult<Vec<Row>> {
    let sql = match name.as_str() {
        "deck_stats" => {
            "SELECT deck_id, count(*) AS total,
                    sum(CASE WHEN suspended = 0 AND due_date <= date('now','localtime') THEN 1 ELSE 0 END) AS due
             FROM cards GROUP BY deck_id"
        }
        "module_counts" => {
            "SELECT m.id,
               (SELECT count(*) FROM school_notes WHERE module_id = m.id) AS notes,
               (SELECT count(*) FROM homework WHERE module_id = m.id AND status != 'Submitted') AS open_homework,
               (SELECT count(*) FROM exams WHERE module_id = m.id AND start_at >= strftime('%Y-%m-%dT%H:%M','now','localtime')) AS upcoming_exams,
               (SELECT count(*) FROM decks WHERE module_id = m.id) AS decks,
               (SELECT count(*) FROM cards c JOIN decks d ON d.id = c.deck_id
                  WHERE d.module_id = m.id AND c.suspended = 0 AND c.due_date <= date('now','localtime')) AS due_cards
             FROM modules m"
        }
        "money_by_category" => {
            // ?1 = 'YYYY-MM'
            "SELECT t.kind, t.category_id, coalesce(c.name,'Uncategorised') AS name, c.color,
                    sum(t.amount_cents) AS total_cents
             FROM transactions t LEFT JOIN money_categories c ON c.id = t.category_id
             WHERE substr(t.date,1,7) = ?1
             GROUP BY t.kind, t.category_id ORDER BY total_cents DESC"
        }
        "money_monthly_totals" => {
            // ?1 = first month to include 'YYYY-MM'
            "SELECT substr(date,1,7) AS month,
                    sum(CASE WHEN kind='income' THEN amount_cents ELSE 0 END) AS income_cents,
                    sum(CASE WHEN kind='expense' THEN amount_cents ELSE 0 END) AS expense_cents
             FROM transactions WHERE substr(date,1,7) >= ?1
             GROUP BY month ORDER BY month"
        }
        "wallet_balances" => {
            "SELECT w.id, w.name, w.type, w.opening_cents, w.archived,
                    w.opening_cents + coalesce(sum(CASE WHEN t.kind='income' THEN t.amount_cents ELSE -t.amount_cents END),0) AS balance_cents
             FROM wallets w LEFT JOIN transactions t ON t.wallet_id = w.id
             GROUP BY w.id ORDER BY w.id"
        }
        "budgets_for_month" => {
            // ?1 = 'YYYY-MM'
            "SELECT c.id AS category_id, c.name, c.color,
               (SELECT cap_cents FROM budgets b WHERE b.category_id = c.id AND b.month = ?1) AS month_cap_cents,
               (SELECT cap_cents FROM budgets b WHERE b.category_id = c.id AND b.month IS NULL) AS default_cap_cents,
               (SELECT coalesce(sum(amount_cents),0) FROM transactions t
                  WHERE t.category_id = c.id AND t.kind='expense' AND substr(t.date,1,7) = ?1) AS spent_cents
             FROM money_categories c WHERE c.kind = 'expense' ORDER BY c.name"
        }
        "srs_review_counts" => {
            // reviews per day for the last 30 days
            "SELECT substr(reviewed_at,1,10) AS day, count(*) AS n FROM card_reviews
             WHERE reviewed_at >= date('now','localtime','-30 days') GROUP BY day ORDER BY day"
        }
        _ => return Err(AppError::msg(format!("unknown query '{name}'"))),
    };
    let conn = db.conn()?;
    query_json(&conn, sql, params.iter().map(json_to_sql).collect())
}
