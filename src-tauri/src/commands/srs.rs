//! Spaced repetition. Scheduling changes ONLY when the user rates a card.

use chrono::{Duration, Local};
use rusqlite::{params, Connection};
use tauri::State;

use crate::commands::crud::{query_json, Row};
use crate::db::Db;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, PartialEq)]
pub struct CardState {
    pub ease: f64,
    pub interval: i64,
    pub reps: i64,
    pub lapses: i64,
}

/// rating: 1 Again, 2 Hard, 3 Good, 4 Easy
pub fn schedule(s: &CardState, rating: i64, scheduler: &str, ladder: &[i64]) -> CardState {
    let mut n = s.clone();
    if scheduler == "fixed" && !ladder.is_empty() {
        let last = ladder.len() as i64 - 1;
        let step = |i: i64| ladder[i.clamp(0, last) as usize];
        match rating {
            1 => {
                n.reps = 0;
                n.lapses += 1;
                n.interval = 0;
            }
            2 => n.interval = step(s.reps - 1).max(1),
            3 => {
                n.interval = step(s.reps);
                n.reps = s.reps + 1;
            }
            _ => {
                n.interval = step(s.reps + 1);
                n.reps = s.reps + 2;
            }
        }
        return n;
    }
    // SM-2 (Anki-style variant)
    match rating {
        1 => {
            n.reps = 0;
            n.lapses += 1;
            n.interval = 0; // see again today
            n.ease = (s.ease - 0.2).max(1.3);
        }
        2 => {
            n.interval = if s.reps == 0 { 1 } else { ((s.interval as f64) * 1.2).round().max(1.0) as i64 };
            n.ease = (s.ease - 0.15).max(1.3);
            n.reps += 1;
        }
        3 => {
            n.interval = match s.reps {
                0 => 1,
                1 => 3,
                _ => ((s.interval.max(1) as f64) * s.ease).round() as i64,
            };
            n.reps += 1;
        }
        _ => {
            n.interval = match s.reps {
                0 => 3,
                1 => 7,
                _ => ((s.interval.max(1) as f64) * s.ease * 1.3).round() as i64,
            };
            n.ease = s.ease + 0.15;
            n.reps += 1;
        }
    }
    n
}

fn review(conn: &Connection, card_id: i64, rating: i64) -> AppResult<Row> {
    if !(1..=4).contains(&rating) {
        return Err(AppError::msg("rating must be 1-4"));
    }
    let (state, scheduler, ladder_json): (CardState, String, String) = conn.query_row(
        "SELECT c.ease, c.interval_days, c.repetitions, c.lapses, d.scheduler, d.fixed_intervals
         FROM cards c JOIN decks d ON d.id = c.deck_id WHERE c.id = ?1",
        [card_id],
        |r| {
            Ok((
                CardState { ease: r.get(0)?, interval: r.get(1)?, reps: r.get(2)?, lapses: r.get(3)? },
                r.get(4)?,
                r.get(5)?,
            ))
        },
    )?;
    let ladder: Vec<i64> = serde_json::from_str(&ladder_json).unwrap_or_else(|_| vec![1, 3, 7, 14, 30]);
    let next = schedule(&state, rating, &scheduler, &ladder);
    let due = (Local::now().date_naive() + Duration::days(next.interval)).to_string();
    conn.execute(
        "UPDATE cards SET ease=?1, interval_days=?2, repetitions=?3, lapses=?4, due_date=?5,
                last_reviewed_at=datetime('now','localtime') WHERE id=?6",
        params![next.ease, next.interval, next.reps, next.lapses, due, card_id],
    )?;
    conn.execute(
        "INSERT INTO card_reviews(card_id, rating, prev_interval, new_interval, prev_ease, new_ease)
         VALUES (?1,?2,?3,?4,?5,?6)",
        params![card_id, rating, state.interval, next.interval, state.ease, next.ease],
    )?;
    query_json(conn, "SELECT * FROM cards WHERE id = ?", vec![card_id.into()])?
        .into_iter()
        .next()
        .ok_or_else(|| AppError::msg("card not found"))
}

#[tauri::command]
pub fn srs_review(db: State<'_, Db>, card_id: i64, rating: i64) -> AppResult<Row> {
    let conn = db.conn()?;
    review(&conn, card_id, rating)
}

/// Preview the next interval for each rating (shown on the rating buttons).
#[tauri::command]
pub fn srs_preview(db: State<'_, Db>, card_id: i64) -> AppResult<Vec<i64>> {
    let conn = db.conn()?;
    let (state, scheduler, ladder_json): (CardState, String, String) = conn.query_row(
        "SELECT c.ease, c.interval_days, c.repetitions, c.lapses, d.scheduler, d.fixed_intervals
         FROM cards c JOIN decks d ON d.id = c.deck_id WHERE c.id = ?1",
        [card_id],
        |r| {
            Ok((
                CardState { ease: r.get(0)?, interval: r.get(1)?, reps: r.get(2)?, lapses: r.get(3)? },
                r.get(4)?,
                r.get(5)?,
            ))
        },
    )?;
    let ladder: Vec<i64> = serde_json::from_str(&ladder_json).unwrap_or_else(|_| vec![1, 3, 7, 14, 30]);
    Ok((1..=4).map(|r| schedule(&state, r, &scheduler, &ladder).interval).collect())
}

/// Due cards (optionally for one deck or module), oldest first.
#[tauri::command]
pub fn srs_due(db: State<'_, Db>, deck_id: Option<i64>, module_id: Option<i64>) -> AppResult<Vec<Row>> {
    let conn = db.conn()?;
    query_json(
        &conn,
        "SELECT c.* FROM cards c JOIN decks d ON d.id = c.deck_id
         WHERE c.suspended = 0 AND c.due_date <= date('now','localtime')
           AND (?1 IS NULL OR c.deck_id = ?1) AND (?2 IS NULL OR d.module_id = ?2)
         ORDER BY c.due_date, c.id",
        vec![deck_id.into(), module_id.into()],
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sm2_progression() {
        let s = CardState { ease: 2.5, interval: 0, reps: 0, lapses: 0 };
        let a = schedule(&s, 3, "sm2", &[]);
        assert_eq!((a.interval, a.reps), (1, 1));
        let b = schedule(&a, 3, "sm2", &[]);
        assert_eq!(b.interval, 3);
        let c = schedule(&b, 3, "sm2", &[]);
        assert_eq!(c.interval, 8); // 3 * 2.5 = 7.5 → 8
        let lapse = schedule(&c, 1, "sm2", &[]);
        assert_eq!((lapse.interval, lapse.reps, lapse.lapses), (0, 0, 1));
        assert!((lapse.ease - 2.3).abs() < 1e-9);
    }

    #[test]
    fn fixed_ladder() {
        let l = [1, 3, 7, 14, 30];
        let s = CardState { ease: 2.5, interval: 0, reps: 0, lapses: 0 };
        let a = schedule(&s, 3, "fixed", &l);
        assert_eq!(a.interval, 1);
        let b = schedule(&a, 3, "fixed", &l);
        assert_eq!(b.interval, 3);
        let e = schedule(&b, 4, "fixed", &l);
        assert_eq!(e.interval, 14);
    }

    #[test]
    fn review_writes_history() {
        let conn = crate::db::test_conn();
        conn.execute_batch(
            "INSERT INTO modules(code,name) VALUES('A','A');
             INSERT INTO decks(module_id,name) VALUES(1,'D');
             INSERT INTO cards(deck_id,front_md) VALUES(1,'Q');",
        )
        .unwrap();
        let row = review(&conn, 1, 3).unwrap();
        assert_eq!(row["interval_days"], 1);
        let n: i64 = conn.query_row("SELECT count(*) FROM card_reviews", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
    }
}
