mod commands;
mod crypto;
mod db;
mod error;
mod recur;
mod scheduler;
#[cfg(desktop)]
mod tray;

use tauri::Manager;

use commands::*;

/// Identifier of the installed app; its AppData folder holds the user's real data.
const LIVE_IDENTIFIER: &str = "com.studymed.app";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // Desktop only: one window, start with Windows, the tray icon and self-updates.
    #[cfg(desktop)]
    let builder = builder
        // Must be first: a second launch just reopens the running window.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| tray::show_main(app)))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![tray::MINIMIZED_ARG]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" && tray::on_close_requested(window) {
                    api.prevent_close();
                }
            }
        });
    builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Development builds must never open the installed app's real data.
            if cfg!(debug_assertions) && app.config().identifier == LIVE_IDENTIFIER {
                return Err("debug builds can't use live data; run `npm run app` (test identifier)".into());
            }
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("studymed.db");
            let db = db::Db::open(&db_path).map_err(|e| format!("could not open database: {e}"))?;
            app.manage(db);
            app.manage(db::AppPaths { data_dir, db_path });
            app.manage(crypto::Vault::default());
            scheduler::spawn(app.handle().clone());
            #[cfg(desktop)]
            {
                tray::setup(app)?;
                // The window starts hidden (tauri.conf.json); show it unless launched at Windows startup.
                if !std::env::args().any(|a| a == tray::MINIMIZED_ARG) {
                    tray::show_main(app.handle());
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            settings::settings_get_all,
            settings::settings_set,
            settings::app_info,
            crud::rows_list,
            crud::row_get,
            crud::row_insert,
            crud::rows_insert,
            crud::row_update,
            crud::row_delete,
            crud::rows_delete_where,
            crud::rows_reorder,
            crud::links_set,
            crud::entity_tags_list,
            crud::entity_tags_set,
            crud::query_named,
            crud::db_value_set,
            calendar::calendar_range,
            search::search,
            srs::srs_review,
            srs::srs_preview,
            srs::srs_due,
            reminders::reminders_list,
            reminders::reminders_for,
            reminders::reminders_sync,
            reminders::reminder_create,
            reminders::reminder_delete,
            reminders::reminders_clear_fired,
            reminders::notify_now,
            files::file_import,
            files::file_save_bytes,
            files::file_delete,
            files::file_write_text,
            files::backup_create,
            files::backup_bytes,
            files::backup_restore,
            vault::vault_status,
            vault::vault_setup,
            vault::vault_unlock,
            vault::vault_lock,
            vault::vault_touch,
            vault::vault_set_auto_lock,
            vault::vault_change_password,
            vault::vault_entries_list,
            vault::vault_entry_save,
            vault::vault_entry_delete,
            vault::note_lock,
            vault::note_read_locked,
            vault::note_save_locked,
            vault::note_unlock,
            vault::wishlist_set_locked,
            vault::wishlist_items_list,
        ])
        .run(tauri::generate_context!())
        .expect("error while running StudyMed");
}
