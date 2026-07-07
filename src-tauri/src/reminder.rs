use chrono::Local;
use tauri::{AppHandle, Emitter, Manager};

/// 后台扫描线程：每 30 秒检查一次到期 reminder。
///
/// 在 lib.rs 的 setup 闭包中调用，启动一个 tokio 异步任务循环执行：
///   1. 查询所有 reminder <= now 且未完成、未归档、尚未通知的任务
///   2. 对每个任务发送系统通知（Windows 通知中心）
///   3. 更新 last_notified 字段防止重复通知
///   4. emit "task-reminder" 事件给前端（用于应用内 Toast / 通知中心）
pub fn start_reminder_scanner(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            if let Err(e) = scan_and_fire(&app_handle).await {
                eprintln!("reminder scan error: {}", e);
            }
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        }
    });
}

/// 单次扫描：查询到期任务并触发通知。
///
/// 查询条件：
///   - reminder 非空且不为空字符串
///   - completed = 0 且 archived = 0
///   - reminder <= now（已到期）
///   - last_notified 为空 或 last_notified < reminder（未通知过或提醒时间已更新）
///
/// 通知后更新 last_notified = now，确保同一提醒只通知一次。
async fn scan_and_fire(app: &AppHandle) -> Result<(), String> {
    let db = app.state::<crate::db::DbState>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = Local::now();
    let now_rfc = now.to_rfc3339();

    // 查询 reminder <= now 且未完成且未通知的任务
    let mut stmt = conn
        .prepare(
            "SELECT id, title, reminder FROM tasks
             WHERE reminder IS NOT NULL
             AND reminder != ''
             AND completed = 0 AND archived = 0
             AND reminder <= ?1
             AND (last_notified IS NULL OR last_notified < reminder)",
        )
        .map_err(|e| e.to_string())?;

    let tasks: Vec<(i64, String, String)> = stmt
        .query_map([&now_rfc], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    drop(stmt);

    for (id, title, reminder) in tasks {
        // 发送系统通知（Windows 通知中心）
        use tauri_plugin_notification::NotificationExt;
        app.notification()
            .builder()
            .title("滴答清单提醒")
            .body(&title)
            .show()
            .map_err(|e| e.to_string())?;

        // 更新 last_notified，防止重复通知
        conn.execute(
            "UPDATE tasks SET last_notified = ?1 WHERE id = ?2",
            rusqlite::params![&now_rfc, id],
        )
        .map_err(|e| e.to_string())?;

        // 同时 emit 事件给前端（用于应用内 Toast 通知 + 通知中心历史）
        app.emit("task-reminder", (id, title, reminder)).ok();
    }

    Ok(())
}
