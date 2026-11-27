//! Local file storage. Everything the user attaches is copied into the app data
//! folder so the database + that folder form a complete, portable backup.

use std::path::{Component, Path, PathBuf};

use tauri::ipc::{InvokeBody, Request};
use tauri::State;

use crate::db::{AppPaths, Db};
use crate::error::{AppError, AppResult};

fn clean_subdir(s: &str) -> AppResult<String> {
    if !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        Ok(s.to_string())
    } else {
        Err(AppError::msg("invalid folder name"))
    }
}

fn clean_name(name: &str) -> String {
    let base = Path::new(name)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "file".into());
    let cleaned: String = base
        .chars()
        .map(|c| if c.is_alphanumeric() || matches!(c, '.' | '-' | '_') { c } else { '_' })
        .collect();
    let stamp = chrono::Local::now().format("%Y%m%d%H%M%S%3f");
    format!("{stamp}-{}", cleaned.chars().rev().take(80).collect::<Vec<_>>().into_iter().rev().collect::<String>())
}

/// Returns (absolute path, path relative to the data dir with forward slashes).
fn target(paths: &AppPaths, subdir: &str, name: &str) -> AppResult<(PathBuf, String)> {
    let sub = clean_subdir(subdir)?;
    let file = clean_name(name);
    let dir = paths.data_dir.join("files").join(&sub);
    std::fs::create_dir_all(&dir)?;
    Ok((dir.join(&file), format!("files/{sub}/{file}")))
}

/// Resolve a stored relative path safely inside the data dir.
pub fn resolve(paths: &AppPaths, rel: &str) -> AppResult<PathBuf> {
    let p = Path::new(rel);
    if p.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err(AppError::msg("invalid stored path"));
    }
    Ok(paths.data_dir.join(p))
}

/// Copy a file the user picked into app storage.
#[tauri::command]
pub fn file_import(paths: State<'_, AppPaths>, src: String, subdir: String) -> AppResult<String> {
    let src = PathBuf::from(src);
    if !src.is_file() {
        return Err(AppError::msg("file not found"));
    }
    let (abs, rel) = target(&paths, &subdir, &src.to_string_lossy())?;
    std::fs::copy(&src, &abs)?;
    Ok(rel)
}

/// Save raw bytes (e.g. an image pasted from the clipboard).
/// Headers: x-name (file name), x-subdir (storage folder).
#[tauri::command]
pub fn file_save_bytes(paths: State<'_, AppPaths>, request: Request<'_>) -> AppResult<String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(AppError::msg("expected raw bytes"));
    };
    let h = request.headers();
    let name = h.get("x-name").and_then(|v| v.to_str().ok()).unwrap_or("pasted.png");
    let subdir = h.get("x-subdir").and_then(|v| v.to_str().ok()).unwrap_or("misc");
    let (abs, rel) = target(&paths, subdir, name)?;
    std::fs::write(abs, bytes)?;
    Ok(rel)
}

#[tauri::command]
pub fn file_delete(paths: State<'_, AppPaths>, rel: String) -> AppResult<()> {
    let p = resolve(&paths, &rel)?;
    if p.is_file() {
        std::fs::remove_file(p)?;
    }
    Ok(())
}

/// Write a text export to a path the user chose in a Save dialog.
#[tauri::command]
pub fn file_write_text(path: String, content: String) -> AppResult<()> {
    std::fs::write(path, content)?;
    Ok(())
}

/// Consistent snapshot of the whole database to a user-chosen path.
#[tauri::command]
pub fn backup_create(db: State<'_, Db>, dest: String) -> AppResult<()> {
    let dest_path = PathBuf::from(&dest);
    if dest_path.exists() {
        std::fs::remove_file(&dest_path)?;
    }
    let conn = db.conn()?;
    conn.execute("VACUUM INTO ?1", [dest])?;
    Ok(())
}

/// The whole database as one file's bytes, for saving a backup where the app can't
/// write a path itself (the phone's file picker hands back a document, not a path).
#[tauri::command]
pub fn backup_bytes(db: State<'_, Db>, paths: State<'_, AppPaths>) -> AppResult<tauri::ipc::Response> {
    let tmp = paths.data_dir.join("backup-outgoing.db");
    if tmp.exists() {
        std::fs::remove_file(&tmp)?;
    }
    db.conn()?.execute("VACUUM INTO ?1", [tmp.to_string_lossy()])?;
    let bytes = std::fs::read(&tmp)?;
    let _ = std::fs::remove_file(&tmp);
    Ok(tauri::ipc::Response::new(bytes))
}

/// Replace all data with a backup file (sent as raw bytes). The current data is
/// snapshotted into `backups/` first, and an older backup is upgraded to this
/// version's schema. Returns the backup's schema version.
#[tauri::command]
pub fn backup_restore(db: State<'_, Db>, paths: State<'_, AppPaths>, request: Request<'_>) -> AppResult<i64> {
    // Desktop sends raw bytes; the phone's IPC sends them as a JSON list of numbers.
    let owned: Vec<u8>;
    let bytes: &[u8] = match request.body() {
        InvokeBody::Raw(b) => b,
        InvokeBody::Json(serde_json::Value::Array(list)) => {
            owned = list.iter().map(|v| v.as_u64().unwrap_or(0) as u8).collect();
            &owned
        }
        _ => return Err(AppError::msg("expected the backup file's bytes")),
    };
    if bytes.len() < 100 || &bytes[..16] != b"SQLite format 3\0" {
        return Err(AppError::msg("That file isn't a StudyMed backup"));
    }
    let tmp = paths.data_dir.join("restore-incoming.db");
    std::fs::write(&tmp, bytes)?;
    let result = (|| -> AppResult<i64> {
        let version = {
            let src = rusqlite::Connection::open(&tmp)?;
            let has_modules: i64 = src.query_row("SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'modules'", [], |r| r.get(0))?;
            if has_modules == 0 {
                return Err(AppError::msg("That file isn't a StudyMed backup"));
            }
            crate::db::schema_version(&src)?
        };
        if version as usize > crate::db::SCHEMA_VERSION {
            return Err(AppError::msg("That backup is from a newer StudyMed. Update this app first."));
        }
        let mut conn = db.conn()?;
        let dir = paths.data_dir.join("backups");
        std::fs::create_dir_all(&dir)?;
        let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
        let keep = dir.join(format!("studymed-before-restore-{stamp}.db"));
        conn.execute("VACUUM INTO ?1", [keep.to_string_lossy()])?;
        conn.restore(rusqlite::MAIN_DB, &tmp, None::<fn(rusqlite::backup::Progress)>)?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        crate::db::migrate(&mut conn)?;
        Ok(version)
    })();
    let _ = std::fs::remove_file(&tmp);
    result
}
