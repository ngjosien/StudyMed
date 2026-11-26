use std::collections::HashMap;

use serde_json::Value;
use tauri::State;

use crate::db::{schema_version, AppPaths, Db};
use crate::error::AppResult;

#[tauri::command]
pub fn settings_get_all(db: State<'_, Db>) -> AppResult<HashMap<String, Value>> {
    let conn = db.conn()?;
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    let mut map = HashMap::new();
    for row in rows {
        let (k, v) = row?;
        map.insert(k, serde_json::from_str(&v).unwrap_or(Value::Null));
    }
    Ok(map)
}

#[tauri::command]
pub fn settings_set(db: State<'_, Db>, key: String, value: Value) -> AppResult<()> {
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO settings(key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![key, serde_json::to_string(&value)?],
    )?;
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    data_dir: String,
    db_path: String,
    schema_version: i64,
    version: String,
}

#[tauri::command]
pub fn app_info(app: tauri::AppHandle, db: State<'_, Db>, paths: State<'_, AppPaths>) -> AppResult<AppInfo> {
    let conn = db.conn()?;
    Ok(AppInfo {
        data_dir: paths.data_dir.to_string_lossy().into_owned(),
        db_path: paths.db_path.to_string_lossy().into_owned(),
        schema_version: schema_version(&conn)?,
        version: app.package_info().version.to_string(),
    })
}
