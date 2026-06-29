pub mod db;
pub mod commands;
pub mod llm;
pub mod fonts;
pub mod sync;

use db::DbState;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(Default::default(), None))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .on_window_event(|window, event| {
            // 拦截关闭事件：改为隐藏窗口，不退出应用
            if let WindowEvent::CloseRequested { api, .. } = event {
                window.hide().unwrap();
                api.prevent_close();
            }
        })
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()
                .expect("Failed to get app data directory");
            std::fs::create_dir_all(&app_data_dir)
                .expect("Failed to create app data directory");
            let db = db::init_db(app_data_dir.to_str().unwrap())
                .expect("Failed to initialize database");
            app.manage(DbState(std::sync::Mutex::new(db)));

            // 创建托盘菜单
            let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            // 创建系统托盘图标
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("滴答清单")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    // 左键单击/双击：显示窗口
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // 启动自动同步定时器
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // 启动时延迟 10 秒，等待应用初始化完成
                tokio::time::sleep(std::time::Duration::from_secs(10)).await;

                loop {
                    // 获取 app_data_dir
                    let app_data_dir = match app_handle.path().app_data_dir() {
                        Ok(dir) => dir.to_string_lossy().to_string(),
                        Err(_) => {
                            tokio::time::sleep(std::time::Duration::from_secs(300)).await;
                            continue;
                        }
                    };

                    // 检查是否配置了同步
                    let config = match commands::sync_commands::get_sync_config(app_data_dir.clone()) {
                        Ok(Some(c)) if c.auto_sync => c,
                        _ => {
                            tokio::time::sleep(std::time::Duration::from_secs(300)).await;
                            continue;
                        }
                    };

                    // 执行同步
                    let _ = commands::sync_commands::sync_now(app_data_dir).await;

                    // 等待下次同步
                    let interval = config.auto_sync_interval_secs;
                    tokio::time::sleep(std::time::Duration::from_secs(interval)).await;
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_tasks,
            commands::create_task,
            commands::update_task,
            commands::delete_task,
            commands::duplicate_task,
            commands::get_lists,
            commands::create_list,
            commands::update_list,
            commands::delete_list,
            commands::get_tags,
            commands::create_tag,
            commands::delete_tag,
            commands::add_tag_to_task,
            commands::remove_tag_from_task,
            commands::reorder_tasks,
            commands::complete_task,
            commands::get_habits,
            commands::create_habit,
            commands::update_habit,
            commands::delete_habit,
            commands::archive_habit,
            commands::get_habit_records,
            commands::upsert_habit_record,
            commands::delete_habit_record,
            commands::export_json,
            commands::export_csv,
            commands::export_markdown,
            commands::import_json,
            llm::test_llm_connection,
            llm::llm_chat,
            llm::llm_chat_stream,
            fonts::list_system_fonts,
            commands::window_minimize,
            commands::window_maximize,
            commands::window_unmaximize,
            commands::window_toggle_maximize,
            commands::window_is_maximized,
            commands::window_close,
            commands::get_sync_config,
            commands::save_sync_config,
            commands::init_sync_repo,
            commands::sync_now,
            commands::get_sync_status_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
