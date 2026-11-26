use chrono::Datelike;
use rusqlite::types::Value as SqlValue;
use serde_json::{json, Value};
use tauri::State;

use crate::commands::crud::{query_json, Row};
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::recur::{birthday_occurrences, occurrences, parse_birthday, parse_date};

/// All calendar items between `start` and `end` (inclusive dates, 'YYYY-MM-DD').
/// One-off items come from the `calendar_items` view; birthdays and bills are
/// expanded here so editing the source updates every occurrence.
#[tauri::command]
pub fn calendar_range(db: State<'_, Db>, start: String, end: String) -> AppResult<Vec<Row>> {
    let from = parse_date(&start).ok_or_else(|| AppError::msg("bad start date"))?;
    let to = parse_date(&end).ok_or_else(|| AppError::msg("bad end date"))?;
    let conn = db.conn()?;

    let mut items = query_json(
        &conn,
        "SELECT layer, source_type, source_id, title, start_at, end_at, all_day, location, color, done
         FROM calendar_items
         WHERE substr(start_at,1,10) <= ?2 AND substr(coalesce(end_at, start_at),1,10) >= ?1
         ORDER BY start_at",
        vec![SqlValue::Text(start.clone()), SqlValue::Text(end.clone())],
    )?;

    // Birthdays
    for p in query_json(
        &conn,
        "SELECT id, name, birthday FROM people WHERE birthday IS NOT NULL AND birthday != ''",
        vec![],
    )? {
        let Some(bd) = p.get("birthday").and_then(Value::as_str) else { continue };
        let Some((m, d, year)) = parse_birthday(bd) else { continue };
        let name = p.get("name").and_then(Value::as_str).unwrap_or("");
        for date in birthday_occurrences(m, d, from, to) {
            let title = match year {
                Some(y) => format!("{name}'s birthday (turns {})", date.year() - y),
                None => format!("{name}'s birthday"),
            };
            items.push(item("birthday", "people", &p["id"], title, date.to_string(), None, true, None, 0));
        }
    }

    // 1-3-5-7 reviews
    for r in query_json(
        &conn,
        "SELECT topic_id, title, offset_days, due_date, done_date FROM review_schedule
         WHERE due_date BETWEEN ?1 AND ?2",
        vec![SqlValue::Text(start.clone()), SqlValue::Text(end.clone())],
    )? {
        let title = r.get("title").and_then(Value::as_str).unwrap_or("");
        let offset = r.get("offset_days").and_then(Value::as_i64).unwrap_or(0);
        let due = r.get("due_date").and_then(Value::as_str).unwrap_or("").to_string();
        let done = r.get("done_date").is_some_and(|v| !v.is_null()) as i64;
        items.push(item("review", "review_topics", &r["topic_id"], format!("Recall: {title} (day {offset})"), due, None, true, None, done));
    }

    // Weekly classes, coloured by module
    for c in query_json(
        &conn,
        "SELECT c.id, c.kind, c.weekday, c.start_time, c.end_time, c.venue, c.starts_on, c.ends_on, m.code, m.color
         FROM class_slots c JOIN modules m ON m.id = c.module_id WHERE m.archived = 0",
        vec![],
    )? {
        let weekday = c.get("weekday").and_then(Value::as_i64).unwrap_or(0) as u32;
        let first = c.get("starts_on").and_then(Value::as_str).and_then(parse_date);
        let last = c.get("ends_on").and_then(Value::as_str).and_then(parse_date);
        let s = |k: &str| c.get(k).and_then(Value::as_str).unwrap_or("").to_string();
        for day in from.iter_days().take_while(|d| *d <= to) {
            let in_term = first.is_none_or(|f| day >= f) && last.is_none_or(|l| day <= l);
            if day.weekday().num_days_from_monday() == weekday && in_term {
                let mut it = item(
                    "class",
                    "class_slots",
                    &c["id"],
                    format!("{} {}", s("code"), s("kind")),
                    format!("{day}T{}", s("start_time")),
                    Some(format!("{day}T{}", s("end_time"))),
                    false,
                    c.get("venue").and_then(Value::as_str).map(str::to_string),
                    0,
                );
                it.insert("color".into(), c.get("color").cloned().unwrap_or(Value::Null));
                items.push(it);
            }
        }
    }

    // Recurring bills
    for b in query_json(
        &conn,
        "SELECT id, name, amount_cents, freq, every_n, anchor_date FROM bills WHERE active = 1",
        vec![],
    )? {
        let Some(anchor) = b.get("anchor_date").and_then(Value::as_str).and_then(parse_date) else { continue };
        let freq = b.get("freq").and_then(Value::as_str).unwrap_or("monthly");
        let every = b.get("every_n").and_then(Value::as_i64).unwrap_or(1);
        let amount = b.get("amount_cents").and_then(Value::as_i64).unwrap_or(0) as f64 / 100.0;
        let name = b.get("name").and_then(Value::as_str).unwrap_or("");
        for date in occurrences(anchor, freq, every, from, to) {
            items.push(item(
                "bill",
                "bills",
                &b["id"],
                format!("{name} · ${amount:.2}"),
                date.to_string(),
                None,
                true,
                None,
                0,
            ));
        }
    }

    items.sort_by(|a, b| {
        let ka = a.get("start_at").and_then(Value::as_str).unwrap_or("");
        let kb = b.get("start_at").and_then(Value::as_str).unwrap_or("");
        ka.cmp(kb)
    });
    Ok(items)
}

#[allow(clippy::too_many_arguments)]
fn item(
    layer: &str,
    source_type: &str,
    id: &Value,
    title: String,
    start: String,
    end: Option<String>,
    all_day: bool,
    location: Option<String>,
    done: i64,
) -> Row {
    let v = json!({
        "layer": layer, "source_type": source_type, "source_id": id, "title": title,
        "start_at": start, "end_at": end, "all_day": all_day as i64, "location": location,
        "color": Value::Null, "done": done,
    });
    v.as_object().cloned().unwrap_or_default()
}
