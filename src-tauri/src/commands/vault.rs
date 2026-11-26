//! Password vault, locked Important Notes and Wishlist locks.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::{Map, Value};
use tauri::State;

use crate::commands::crud::{query_json, Row};
use crate::crypto::{self, Key, Vault, KDF_PARAMS, VERIFIER};
use crate::db::Db;
use crate::error::{AppError, AppResult};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    configured: bool,
    unlocked: bool,
    auto_lock_min: i64,
}

fn auto_lock_min(conn: &Connection) -> AppResult<i64> {
    Ok(conn
        .query_row("SELECT auto_lock_min FROM vault_meta WHERE id = 1", [], |r| r.get(0))
        .optional()?
        .unwrap_or(5))
}

fn key(conn: &Connection, vault: &Vault) -> AppResult<Key> {
    vault.key(auto_lock_min(conn)?)
}

fn check_password(conn: &Connection, password: &str) -> AppResult<Key> {
    let (params_json, salt, vct, vnonce): (String, Vec<u8>, Vec<u8>, Vec<u8>) = conn
        .query_row(
            "SELECT kdf_params, salt, verifier_enc, verifier_nonce FROM vault_meta WHERE id = 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()?
        .ok_or_else(|| AppError::msg("No master password has been set yet"))?;
    let k = crypto::derive_key(password, &salt, &params_json)?;
    match crypto::decrypt(&k, &vct, &vnonce) {
        Ok(v) if v == VERIFIER => Ok(k),
        _ => Err(AppError::msg("Incorrect master password")),
    }
}

#[tauri::command]
pub fn vault_status(db: State<'_, Db>, vault: State<'_, Vault>) -> AppResult<VaultStatus> {
    let conn = db.conn()?;
    let configured: bool = conn.query_row("SELECT count(*) FROM vault_meta", [], |r| r.get::<_, i64>(0))? > 0;
    let mins = auto_lock_min(&conn)?;
    Ok(VaultStatus { configured, unlocked: configured && vault.is_unlocked(mins), auto_lock_min: mins })
}

#[tauri::command]
pub fn vault_setup(db: State<'_, Db>, vault: State<'_, Vault>, password: String, auto_lock_min: i64) -> AppResult<()> {
    let conn = db.conn()?;
    let exists: i64 = conn.query_row("SELECT count(*) FROM vault_meta", [], |r| r.get(0))?;
    if exists > 0 {
        return Err(AppError::msg("A master password is already set"));
    }
    if password.chars().count() < 4 {
        return Err(AppError::msg("Use at least 4 characters (a PIN or a password)"));
    }
    let salt = crypto::random_bytes::<16>()?;
    let k = crypto::derive_key(&password, &salt, KDF_PARAMS)?;
    let (vct, vnonce) = crypto::encrypt(&k, VERIFIER)?;
    conn.execute(
        "INSERT INTO vault_meta(id, kdf_params, salt, verifier_enc, verifier_nonce, auto_lock_min)
         VALUES (1, ?1, ?2, ?3, ?4, ?5)",
        params![KDF_PARAMS, salt.to_vec(), vct, vnonce, auto_lock_min.clamp(0, 240)],
    )?;
    vault.set(k);
    Ok(())
}

#[tauri::command]
pub fn vault_unlock(db: State<'_, Db>, vault: State<'_, Vault>, password: String) -> AppResult<()> {
    let conn = db.conn()?;
    let k = check_password(&conn, &password)?;
    vault.set(k);
    Ok(())
}

#[tauri::command]
pub fn vault_lock(vault: State<'_, Vault>) {
    vault.lock();
}

/// Keep-alive from UI activity on vault pages (resets the auto-lock timer).
#[tauri::command]
pub fn vault_touch(db: State<'_, Db>, vault: State<'_, Vault>) -> AppResult<bool> {
    let conn = db.conn()?;
    Ok(key(&conn, &vault).is_ok())
}

#[tauri::command]
pub fn vault_set_auto_lock(db: State<'_, Db>, vault: State<'_, Vault>, minutes: i64) -> AppResult<()> {
    let conn = db.conn()?;
    key(&conn, &vault)?;
    conn.execute("UPDATE vault_meta SET auto_lock_min = ?1 WHERE id = 1", [minutes.clamp(0, 240)])?;
    Ok(())
}

/// Re-encrypt everything under a new master password, atomically.
#[tauri::command]
pub fn vault_change_password(
    db: State<'_, Db>,
    vault: State<'_, Vault>,
    old_password: String,
    new_password: String,
) -> AppResult<()> {
    if new_password.chars().count() < 4 {
        return Err(AppError::msg("Use at least 4 characters (a PIN or a password)"));
    }
    let mut conn = db.conn()?;
    let old = check_password(&conn, &old_password)?;
    let salt = crypto::random_bytes::<16>()?;
    let new = crypto::derive_key(&new_password, &salt, KDF_PARAMS)?;
    let tx = conn.transaction()?;

    let entries: Vec<(i64, Vec<u8>, Vec<u8>)> = {
        let mut s = tx.prepare("SELECT id, payload_enc, nonce FROM vault_entries")?;
        let rows = s.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
        rows.collect::<Result<_, _>>()?
    };
    for (id, ct, n) in entries {
        let pt = crypto::decrypt(&old, &ct, &n)?;
        let (ct2, n2) = crypto::encrypt(&new, &pt)?;
        tx.execute("UPDATE vault_entries SET payload_enc=?1, nonce=?2 WHERE id=?3", params![ct2, n2, id])?;
    }
    let notes: Vec<(i64, Vec<u8>, Vec<u8>)> = {
        let mut s = tx.prepare("SELECT id, body_enc, body_nonce FROM important_notes WHERE locked = 1")?;
        let rows = s.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
        rows.collect::<Result<_, _>>()?
    };
    for (id, ct, n) in notes {
        let pt = crypto::decrypt(&old, &ct, &n)?;
        let (ct2, n2) = crypto::encrypt(&new, &pt)?;
        tx.execute("UPDATE important_notes SET body_enc=?1, body_nonce=?2 WHERE id=?3", params![ct2, n2, id])?;
    }
    let (vct, vnonce) = crypto::encrypt(&new, VERIFIER)?;
    tx.execute(
        "UPDATE vault_meta SET kdf_params=?1, salt=?2, verifier_enc=?3, verifier_nonce=?4 WHERE id=1",
        params![KDF_PARAMS, salt.to_vec(), vct, vnonce],
    )?;
    tx.commit()?;
    vault.set(new);
    Ok(())
}

// ---- Password entries -------------------------------------------------------

#[tauri::command]
pub fn vault_entries_list(db: State<'_, Db>, vault: State<'_, Vault>) -> AppResult<Vec<Row>> {
    let conn = db.conn()?;
    let k = key(&conn, &vault)?;
    let mut stmt = conn.prepare("SELECT id, payload_enc, nonce, updated_at FROM vault_entries ORDER BY id")?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get::<_, i64>(0)?, r.get::<_, Vec<u8>>(1)?, r.get::<_, Vec<u8>>(2)?, r.get::<_, String>(3)?))
    })?;
    let mut out = Vec::new();
    for row in rows {
        let (id, ct, n, updated) = row?;
        let pt = crypto::decrypt(&k, &ct, &n)?;
        let mut m: Map<String, Value> = serde_json::from_slice(&pt)?;
        m.insert("id".into(), id.into());
        m.insert("updated_at".into(), updated.into());
        out.push(m);
    }
    Ok(out)
}

#[tauri::command]
pub fn vault_entry_save(
    db: State<'_, Db>,
    vault: State<'_, Vault>,
    id: Option<i64>,
    payload: Map<String, Value>,
) -> AppResult<i64> {
    let conn = db.conn()?;
    let k = key(&conn, &vault)?;
    let mut p = payload;
    p.remove("id");
    p.remove("updated_at");
    let (ct, n) = crypto::encrypt(&k, &serde_json::to_vec(&p)?)?;
    match id {
        Some(id) => {
            conn.execute(
                "UPDATE vault_entries SET payload_enc=?1, nonce=?2, updated_at=datetime('now','localtime') WHERE id=?3",
                params![ct, n, id],
            )?;
            Ok(id)
        }
        None => {
            conn.execute("INSERT INTO vault_entries(payload_enc, nonce) VALUES (?1, ?2)", params![ct, n])?;
            Ok(conn.last_insert_rowid())
        }
    }
}

#[tauri::command]
pub fn vault_entry_delete(db: State<'_, Db>, vault: State<'_, Vault>, id: i64) -> AppResult<()> {
    let conn = db.conn()?;
    key(&conn, &vault)?;
    conn.execute("DELETE FROM vault_entries WHERE id = ?1", [id])?;
    Ok(())
}

// ---- Locked Important Notes -------------------------------------------------

#[tauri::command]
pub fn note_lock(db: State<'_, Db>, vault: State<'_, Vault>, id: i64) -> AppResult<()> {
    let conn = db.conn()?;
    let k = key(&conn, &vault)?;
    let body: Option<String> = conn.query_row(
        "SELECT body_md FROM important_notes WHERE id=?1 AND locked=0",
        [id],
        |r| r.get(0),
    )?;
    let (ct, n) = crypto::encrypt(&k, body.unwrap_or_default().as_bytes())?;
    conn.execute(
        "UPDATE important_notes SET locked=1, body_md=NULL, body_enc=?1, body_nonce=?2,
         updated_at=datetime('now','localtime') WHERE id=?3",
        params![ct, n, id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn note_read_locked(db: State<'_, Db>, vault: State<'_, Vault>, id: i64) -> AppResult<String> {
    let conn = db.conn()?;
    let k = key(&conn, &vault)?;
    let (ct, n): (Vec<u8>, Vec<u8>) = conn.query_row(
        "SELECT body_enc, body_nonce FROM important_notes WHERE id=?1 AND locked=1",
        [id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    String::from_utf8(crypto::decrypt(&k, &ct, &n)?).map_err(|_| AppError::msg("corrupt note"))
}

#[tauri::command]
pub fn note_save_locked(db: State<'_, Db>, vault: State<'_, Vault>, id: i64, body: String) -> AppResult<()> {
    let conn = db.conn()?;
    let k = key(&conn, &vault)?;
    let (ct, n) = crypto::encrypt(&k, body.as_bytes())?;
    conn.execute(
        "UPDATE important_notes SET body_enc=?1, body_nonce=?2, updated_at=datetime('now','localtime')
         WHERE id=?3 AND locked=1",
        params![ct, n, id],
    )?;
    Ok(())
}

/// Remove the lock: decrypt back into plain Markdown.
#[tauri::command]
pub fn note_unlock(db: State<'_, Db>, vault: State<'_, Vault>, id: i64) -> AppResult<()> {
    let conn = db.conn()?;
    let k = key(&conn, &vault)?;
    let (ct, n): (Vec<u8>, Vec<u8>) = conn.query_row(
        "SELECT body_enc, body_nonce FROM important_notes WHERE id=?1 AND locked=1",
        [id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let body = String::from_utf8(crypto::decrypt(&k, &ct, &n)?).map_err(|_| AppError::msg("corrupt note"))?;
    conn.execute(
        "UPDATE important_notes SET locked=0, body_md=?1, body_enc=NULL, body_nonce=NULL,
         updated_at=datetime('now','localtime') WHERE id=?2",
        params![body, id],
    )?;
    Ok(())
}

// ---- Wishlist locks ---------------------------------------------------------

#[tauri::command]
pub fn wishlist_set_locked(db: State<'_, Db>, vault: State<'_, Vault>, id: i64, locked: bool) -> AppResult<()> {
    let conn = db.conn()?;
    key(&conn, &vault)?;
    conn.execute("UPDATE wishlists SET locked=?1 WHERE id=?2", params![locked as i64, id])?;
    Ok(())
}

/// Items of a wishlist; refused while the list is locked and the vault is locked.
#[tauri::command]
pub fn wishlist_items_list(db: State<'_, Db>, vault: State<'_, Vault>, wishlist_id: i64) -> AppResult<Vec<Row>> {
    let conn = db.conn()?;
    let locked: i64 = conn.query_row("SELECT locked FROM wishlists WHERE id=?1", [wishlist_id], |r| r.get(0))?;
    if locked == 1 {
        key(&conn, &vault)?;
    }
    query_json(
        &conn,
        "SELECT * FROM wishlist_items WHERE wishlist_id = ?1 ORDER BY id",
        vec![wishlist_id.into()],
    )
}
