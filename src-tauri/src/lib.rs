pub mod commands;
pub mod db;
pub mod fonts;
pub mod llm;
pub mod reminder;
pub mod repeat;
pub mod sync;
pub mod webdav_sync;

use db::DbState;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

/// 修正开机自启路径：debug 模式运行时自动将注册表指向 release exe
/// 避免 debug 版（依赖 Vite 服务器）被注册为开机自启导致启动后白屏
#[cfg(debug_assertions)]
fn fix_autostart_path() {
    use std::path::Path;
    if let Ok(exe_path) = std::env::current_exe() {
        let exe_str = exe_path.to_string_lossy().to_string();
        if exe_str.contains(r"\debug\") {
            let release_path = exe_str.replace(r"\debug\", r"\release\");
            if Path::new(&release_path).exists() {
                let _ = std::process::Command::new("reg")
                    .args([
                        "add",
                        r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                        "/v",
                        "滴答清单",
                        "/t",
                        "REG_SZ",
                        "/d",
                        &release_path,
                        "/f",
                    ])
                    .output();
                println!("[autostart] Path fixed to release exe: {}", release_path);
            }
        }
    }
}

/// 读取 Windows 系统代理设置并写入环境变量
/// reqwest 默认读取 HTTP_PROXY/HTTPS_PROXY 环境变量来使用代理
/// 但 Windows 系统代理存储在注册表中，需要手动同步
fn setup_system_proxy() {
    // 如果环境变量已设置，直接返回
    if std::env::var("HTTPS_PROXY").is_ok() || std::env::var("HTTP_PROXY").is_ok() {
        return;
    }

    // 读取 Windows 注册表中的代理设置
    // HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings
    let output = std::process::Command::new("reg")
        .args([
            "query",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings",
            "/v",
            "ProxyServer",
        ])
        .output();

    if let Ok(out) = output {
        let stdout = String::from_utf8_lossy(&out.stdout);
        // 解析 "ProxyServer    REG_SZ    127.0.0.1:7897" 格式
        for line in stdout.lines() {
            if line.contains("ProxyServer") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if let Some(proxy_addr) = parts.last() {
                    let proxy_url = if proxy_addr.starts_with("http") {
                        proxy_addr.to_string()
                    } else {
                        format!("http://{}", proxy_addr)
                    };
                    std::env::set_var("HTTP_PROXY", &proxy_url);
                    std::env::set_var("HTTPS_PROXY", &proxy_url);
                    println!("[proxy] System proxy detected and set: {}", proxy_url);
                    return;
                }
            }
        }
    }

    // 如果代理被禁用（ProxyEnable=0），也检查环境变量 ALL_PROXY
    if let Ok(all_proxy) = std::env::var("ALL_PROXY") {
        if !all_proxy.is_empty() {
            std::env::set_var("HTTP_PROXY", &all_proxy);
            std::env::set_var("HTTPS_PROXY", &all_proxy);
            println!("[proxy] ALL_PROXY detected and set: {}", all_proxy);
        }
    }
}

pub fn run() {
    #[cfg(debug_assertions)]
    fix_autostart_path();

    // 初始化系统代理：reqwest 默认读取 HTTP_PROXY/HTTPS_PROXY 环境变量
    // 但 Windows 系统代理配置在注册表中，环境变量可能未设置
    // 这里读取注册表中的代理设置并写入环境变量，让 updater 的 HTTP 请求能通过代理
    setup_system_proxy();

    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(Default::default(), None))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .on_window_event(|window, event| {
            // 拦截关闭事件：改为隐藏窗口，不退出应用
            if let WindowEvent::CloseRequested { api, .. } = event {
                if let Err(e) = window.hide() {
                    eprintln!("[window] Failed to hide window: {}", e);
                }
                api.prevent_close();
            }
        })
        .setup(|app| -> Result<(), Box<dyn std::error::Error>> {
            let app_data_dir = app.path().app_data_dir().map_err(|e| {
                eprintln!("[setup] Failed to get app data directory: {}", e);
                e
            })?;
            std::fs::create_dir_all(&app_data_dir).map_err(|e| {
                eprintln!("[setup] Failed to create app data directory: {}", e);
                e
            })?;
            let dir_str = app_data_dir
                .to_str()
                .ok_or_else(|| -> Box<dyn std::error::Error> {
                    eprintln!("[setup] App data directory path is not valid UTF-8");
                    "App data directory path is not valid UTF-8".into()
                })?;
            let db = db::init_db(dir_str).map_err(|e| {
                eprintln!("[setup] Failed to initialize database: {}", e);
                e
            })?;
            app.manage(DbState(std::sync::Mutex::new(db)));

            // P11-01: 启动 reminder 扫描器（后台每 30 秒检查到期提醒）
            reminder::start_reminder_scanner(app.handle().clone());

            // 创建托盘菜单
            let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            // 创建系统托盘图标
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().unwrap_or_else(|| {
                    eprintln!("[setup] No default window icon found, using fallback");
                    tauri::image::Image::new(&[0u8, 0, 0, 0], 1, 1)
                }))
                .tooltip("滴答清单")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
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
                    let config =
                        match commands::sync_commands::get_sync_config(app_data_dir.clone()) {
                            Ok(Some(c)) if c.auto_sync => c,
                            _ => {
                                tokio::time::sleep(std::time::Duration::from_secs(300)).await;
                                continue;
                            }
                        };

                    // 根据同步方式调用不同的同步命令
                    if config.sync_type == "webdav" {
                        let _ = commands::webdav_commands::webdav_sync(
                            app_handle.clone(),
                            app_data_dir,
                        )
                        .await;
                    } else {
                        let _ = commands::sync_commands::sync_now(app_data_dir).await;
                    }

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
            commands::get_trashed_tasks,
            commands::restore_task,
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
            commands::complete_recurring_task,
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
            commands::webdav_test_connection,
            commands::webdav_sync,
            commands::webdav_upload,
            commands::webdav_download,
            commands::resolve_sync_conflict,
            commands::get_templates,
            commands::create_template,
            commands::update_template,
            commands::delete_template,
            commands::apply_template,
            commands::get_attachments,
            commands::add_attachment,
            commands::delete_attachment,
            commands::open_attachment,
            commands::start_time_tracking,
            commands::stop_time_tracking,
            commands::get_time_entries,
            commands::delete_time_entry,
            commands::get_time_stats,
            commands::add_time_entry,
            commands::save_report,
            commands::get_reports,
            commands::delete_report,
            commands::get_goals,
            commands::create_goal,
            commands::update_goal,
            commands::delete_goal,
            commands::link_task_to_goal,
            commands::unlink_task_from_goal,
            commands::get_goal_progress,
            commands::get_task_goals,
            commands::get_goal_key_results,
            commands::create_goal_key_result,
            commands::update_goal_key_result,
            commands::delete_goal_key_result,
            commands::export_text_file,
            commands::import_text_file,
            commands::set_secret,
            commands::get_secret,
            commands::delete_secret,
            commands::create_data_snapshot,
            commands::list_data_snapshots,
            commands::restore_data_snapshot,
            commands::delete_data_snapshot,
            commands::import_json_preview,
            commands::list_sync_logs,
            commands::clear_sync_logs,
            commands::execute_ai_batch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
