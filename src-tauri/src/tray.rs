//! System tray: keeps StudyMed (and its reminder scheduler) running after the
//! window is closed. Left-click the tray icon to reopen; right-click for a menu.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Window};

use crate::db::Db;
use crate::scheduler;

/// Launch argument used by "Start with Windows": start hidden in the tray.
pub const MINIMIZED_ARG: &str = "--minimized";

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub fn setup(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open StudyMed", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit StudyMed", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &sep, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("StudyMed — reminders active")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id().as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

fn setting_bool(app: &AppHandle, key: &str, default: bool) -> bool {
    let db = app.state::<Db>();
    let Ok(conn) = db.conn() else { return default };
    conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get::<_, String>(0))
        .ok()
        .and_then(|v| serde_json::from_str::<bool>(&v).ok())
        .unwrap_or(default)
}

fn set_setting_bool(app: &AppHandle, key: &str, value: bool) {
    let db = app.state::<Db>();
    if let Ok(conn) = db.conn() {
        let _ = conn.execute(
            "INSERT INTO settings(key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![key, value.to_string()],
        );
    };
}

/// Called on the main window's close request. Returns true if the close was
/// turned into "hide to tray".
pub fn on_close_requested(window: &Window) -> bool {
    let app = window.app_handle();
    if !setting_bool(app, "tray.closeToTray", true) {
        return false;
    }
    let _ = window.hide();
    if !setting_bool(app, "tray.hintShown", false) {
        set_setting_bool(app, "tray.hintShown", true);
        let _ = scheduler::show(
            app,
            "StudyMed is still running",
            Some("It's in the system tray so your reminders keep working. Right-click the tray icon to quit."),
        );
    }
    true
}
