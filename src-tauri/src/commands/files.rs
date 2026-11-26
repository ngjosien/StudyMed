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
