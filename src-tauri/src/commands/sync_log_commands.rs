// 同步日志命令（Sync log commands）
//
// 提供独立的 sync_logs.jsonl 日志记录，不写入主数据库 dida.db，
// 避免远程覆盖数据库时日志丢失。
//
// 提供 2 个 Tauri command：
//   - list_sync_logs   读取最近 N 条同步日志
//   - clear_sync_logs  清空所有同步日志
//
// 内部函数 append_sync_log 供 sync_commands.rs / webdav_commands.rs 调用。
// 日志写失败不影响同步流程（仅打印 stderr）。

use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

/// 同步日志条目
#[derive(Debug, Serialize, Deserialize)]
pub struct SyncLogEntry {
    /// ISO 8601 时间戳
    pub timestamp: String,
    /// 操作类型：sync_upload / sync_download / sync_auto / sync_conflict_resolved / sync_error
    pub action: String,
    /// 同步方式：git / webdav
    pub sync_type: String,
    /// 结果状态：success / error
    pub status: String,
    /// 描述信息
    pub message: String,
}

/// 获取同步日志文件路径
fn get_sync_log_path(app_data_dir: &str) -> PathBuf {
    Path::new(app_data_dir).join("sync_logs.jsonl")
}

/// 追加一条同步日志（内部函数，供其他模块调用）
///
/// 使用 append 模式写入 JSONL 文件，每行一条 JSON。
/// 写入失败时仅打印 stderr，不返回错误，不影响同步流程。
pub(crate) fn append_sync_log(app_data_dir: &str, entry: SyncLogEntry) {
    let log_path = get_sync_log_path(app_data_dir);

    // 确保父目录存在
    if let Some(parent) = log_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    // 序列化为 JSON 单行
    let line = match serde_json::to_string(&entry) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[sync_log] 序列化日志失败: {}", e);
            return;
        }
    };

    // 追加写入
    match OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        Ok(mut file) => {
            if let Err(e) = writeln!(file, "{}", line) {
                eprintln!("[sync_log] 写入日志失败: {}", e);
            }
        }
        Err(e) => {
            eprintln!("[sync_log] 打开日志文件失败: {}", e);
        }
    }
}

/// 快捷函数：记录成功日志
#[allow(dead_code)]
pub(crate) fn log_sync_success(app_data_dir: &str, action: &str, sync_type: &str, message: &str) {
    append_sync_log(
        app_data_dir,
        SyncLogEntry {
            timestamp: chrono::Local::now().to_rfc3339(),
            action: action.to_string(),
            sync_type: sync_type.to_string(),
            status: "success".to_string(),
            message: message.to_string(),
        },
    );
}

/// 快捷函数：记录错误日志
#[allow(dead_code)]
pub(crate) fn log_sync_error(app_data_dir: &str, action: &str, sync_type: &str, message: &str) {
    append_sync_log(
        app_data_dir,
        SyncLogEntry {
            timestamp: chrono::Local::now().to_rfc3339(),
            action: action.to_string(),
            sync_type: sync_type.to_string(),
            status: "error".to_string(),
            message: message.to_string(),
        },
    );
}

/// 读取最近 N 条同步日志
#[tauri::command]
pub fn list_sync_logs(app_data_dir: String, limit: Option<usize>) -> Result<Vec<SyncLogEntry>, String> {
    let log_path = get_sync_log_path(&app_data_dir);
    if !log_path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&log_path)
        .map_err(|e| format!("读取同步日志失败: {}", e))?;

    let limit = limit.unwrap_or(10);
    let mut entries: Vec<SyncLogEntry> = content
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| serde_json::from_str::<SyncLogEntry>(line).ok())
        .collect();

    // 取最后 limit 条（最新的）
    if entries.len() > limit {
        entries = entries.split_off(entries.len() - limit);
    }

    // 反转为时间倒序（最新的在前）
    entries.reverse();

    Ok(entries)
}

/// 清空同步日志
#[tauri::command]
pub fn clear_sync_logs(app_data_dir: String) -> Result<(), String> {
    let log_path = get_sync_log_path(&app_data_dir);
    if log_path.exists() {
        fs::write(&log_path, "").map_err(|e| format!("清空同步日志失败: {}", e))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "dida_synclog_test_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn test_append_and_list_sync_logs() {
        let dir = test_dir();
        let dir_str = dir.to_string_lossy().to_string();

        append_sync_log(
            &dir_str,
            SyncLogEntry {
                timestamp: "2026-01-01T10:00:00+08:00".to_string(),
                action: "sync_upload".to_string(),
                sync_type: "webdav".to_string(),
                status: "success".to_string(),
                message: "上传成功".to_string(),
            },
        );

        append_sync_log(
            &dir_str,
            SyncLogEntry {
                timestamp: "2026-01-01T11:00:00+08:00".to_string(),
                action: "sync_download".to_string(),
                sync_type: "git".to_string(),
                status: "error".to_string(),
                message: "下载失败".to_string(),
            },
        );

        let logs = list_sync_logs(dir_str.clone(), None).unwrap();
        assert_eq!(logs.len(), 2);
        // 最新的在前
        assert_eq!(logs[0].action, "sync_download");
        assert_eq!(logs[1].action, "sync_upload");

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_list_sync_logs_limit() {
        let dir = test_dir();
        let dir_str = dir.to_string_lossy().to_string();

        for i in 0..15 {
            append_sync_log(
                &dir_str,
                SyncLogEntry {
                    timestamp: format!("2026-01-01T10:{:02}:00+08:00", i),
                    action: format!("action_{}", i),
                    sync_type: "git".to_string(),
                    status: "success".to_string(),
                    message: format!("msg_{}", i),
                },
            );
        }

        let logs = list_sync_logs(dir_str.clone(), Some(5)).unwrap();
        assert_eq!(logs.len(), 5);
        // 最新的 5 条（14, 13, 12, 11, 10）
        assert_eq!(logs[0].action, "action_14");
        assert_eq!(logs[4].action, "action_10");

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_list_sync_logs_empty() {
        let dir = test_dir();
        let dir_str = dir.to_string_lossy().to_string();

        let logs = list_sync_logs(dir_str, None).unwrap();
        assert!(logs.is_empty());

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_clear_sync_logs() {
        let dir = test_dir();
        let dir_str = dir.to_string_lossy().to_string();

        append_sync_log(
            &dir_str,
            SyncLogEntry {
                timestamp: "2026-01-01T10:00:00+08:00".to_string(),
                action: "test".to_string(),
                sync_type: "git".to_string(),
                status: "success".to_string(),
                message: "test".to_string(),
            },
        );

        clear_sync_logs(dir_str.clone()).unwrap();

        let logs = list_sync_logs(dir_str, None).unwrap();
        assert!(logs.is_empty());

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_log_sync_success_and_error() {
        let dir = test_dir();
        let dir_str = dir.to_string_lossy().to_string();

        log_sync_success(&dir_str, "sync_upload", "webdav", "上传成功");
        log_sync_error(&dir_str, "sync_download", "git", "下载失败");

        let logs = list_sync_logs(dir_str, None).unwrap();
        assert_eq!(logs.len(), 2);
        assert_eq!(logs[0].status, "error"); // 最新的在前
        assert_eq!(logs[1].status, "success");

        std::fs::remove_dir_all(&dir).unwrap();
    }
}
