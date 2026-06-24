pub mod db;
pub mod commands;

use db::DbState;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()
                .expect("Failed to get app data directory");
            std::fs::create_dir_all(&app_data_dir)
                .expect("Failed to create app data directory");
            let db = db::init_db(app_data_dir.to_str().unwrap())
                .expect("Failed to initialize database");
            app.manage(DbState(std::sync::Mutex::new(db)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_tasks,
            commands::create_task,
            commands::update_task,
            commands::delete_task,
            commands::get_lists,
            commands::create_list,
            commands::update_list,
            commands::delete_list,
            commands::get_tags,
            commands::create_tag,
            commands::delete_tag,
            commands::add_tag_to_task,
            commands::remove_tag_from_task,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
