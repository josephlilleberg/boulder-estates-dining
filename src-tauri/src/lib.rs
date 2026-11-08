mod db;

use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Updates come from the GitHub release's latest.json, checked against the pubkey in tauri.conf.json.
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // %APPDATA%\com.boulderestates.dining\dining.sqlite3 on Windows.
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let path = dir.join("dining.sqlite3");
            let conn = db::open(&path)?;
            app.manage(db::DbState { conn: Mutex::new(conn), path });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![db::db_select, db::db_batch, db::db_backup, db::db_info, db::db_list_backups, db::db_restore])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
