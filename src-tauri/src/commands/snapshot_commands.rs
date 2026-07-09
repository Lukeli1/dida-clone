// 数据快照命令（Data snapshot commands）
//
// 提供 4 个 Tauri command：
//   - create_data_snapshot    创建数据快照（使用 VACUUM INTO 保证 WAL 一致性）
//   - list_data_snapshots     列出所有快照
//   - restore_data_snapshot   恢复快照（采用 pending-restore + 重启策略）
//   - delete_data_snapshot    删除指定快照
//
// 快照存储在 app_data_dir/snapshots/ 目录下。
// 使用 SQLite VACUUM INTO 命令创建一致性快照，正确处理 WAL 模式。
// 恢复采用安全策略：写入 pending-restore 文件，下次启动时替换，避免长期连接冲突。

use chrono::TimeZone;
use rusqlite::Connection;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;

use crate::db::DbState;

/// 快照目录名
const SNAPSHOT_DIR: &str = "snapshots";

/// 最大保留快照数量（超出时自动清理最旧的）
const MAX_SNAPSHOTS: usize = 20;

/// 快照信息（返回给前端）
#[derive(Serialize)]
pub struct SnapshotInfo {
    pub file_name: String,
    pub reason: String,
    pub created_at: String,
    pub file_size: u64,
}

/// 创建快照的结果
#[derive(Serialize)]
pub struct SnapshotResult {
    pub file_name: String,
    pub message: String,
}

/// 恢复快照的结果
#[derive(Serialize)]
pub struct RestoreResult {
    pub message: String,
    pub requires_restart: bool,
}

/// 获取快照目录路径
fn get_snapshots_dir(app_data_dir: &str) -> PathBuf {
    Path::new(app_data_dir).join(SNAPSHOT_DIR)
}

/// 将 reason 净化为安全的文件名片段（仅保留 ASCII 字母数字、-、_）
fn sanitize_reason(reason: &str) -> String {
    reason
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(30)
        .collect::<String>()
}

/// 清理超出上限的旧快照（按文件名排序，文件名含时间戳所以天然有序）
fn cleanup_old_snapshots(snapshots_dir: &Path) {
    if let Ok(entries) = fs::read_dir(snapshots_dir) {
        let mut files: Vec<PathBuf> = entries
            .flatten()
            .filter(|e| {
                e.path()
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(|ext| ext == "db")
                    .unwrap_or(false)
            })
            .map(|e| e.path())
            .collect();

        if files.len() > MAX_SNAPSHOTS {
            // 按文件名升序排序（最旧的在前），删除超出的
            files.sort();
            let to_remove = files.len() - MAX_SNAPSHOTS;
            for f in files.iter().take(to_remove) {
                let _ = fs::remove_file(f);
            }
        }
    }
}

/// 内部函数：创建快照（不暴露为 Tauri command，供其他模块调用）
///
/// 使用 VACUUM INTO 创建一致性快照，正确处理 WAL 模式下的 -wal/-shm 文件。
/// VACUUM INTO 会创建一个全新的数据库文件，包含所有已提交的数据，
/// 不依赖 WAL 文件，因此是 WAL 模式下最安全的快照方式。
pub(crate) fn create_snapshot_internal(
    conn: &Connection,
    app_data_dir: &str,
    reason: &str,
) -> Result<SnapshotResult, String> {
    let snapshots_dir = get_snapshots_dir(app_data_dir);
    fs::create_dir_all(&snapshots_dir).map_err(|e| format!("创建快照目录失败: {}", e))?;

    // 生成快照文件名：snapshot_YYYYMMDD_HHMMSS_mmm_reason.db
    // 加入毫秒防止同秒同 reason 撞名导致 VACUUM INTO 失败
    let now = chrono::Local::now();
    let timestamp = now.format("%Y%m%d_%H%M%S").to_string();
    let millis = now.timestamp_subsec_millis();
    let safe_reason = sanitize_reason(reason);
    let file_name = if safe_reason.is_empty() {
        format!("snapshot_{}_{:03}.db", timestamp, millis)
    } else {
        format!("snapshot_{}_{}_{}.db", timestamp, millis, safe_reason)
    };
    let snapshot_path = snapshots_dir.join(&file_name);

    // 使用 VACUUM INTO 创建一致性快照
    // 此命令会创建一个新的数据库文件，包含所有已提交事务的数据
    let sql = format!(
        "VACUUM INTO '{}'",
        snapshot_path.to_string_lossy().replace('\'', "''")
    );
    conn.execute_batch(&sql)
        .map_err(|e| format!("创建数据库快照失败: {}", e))?;

    // 清理超出上限的旧快照
    cleanup_old_snapshots(&snapshots_dir);

    Ok(SnapshotResult {
        file_name,
        message: format!("快照已创建（原因: {}）", reason),
    })
}

/// 校验快照文件名安全性：拒绝路径穿越、绝对路径、非快照格式
///
/// 规则：
/// - 不允许包含路径分隔符 `/` 或 `\`
/// - 不允许包含 `..`（防止目录穿越）
/// - 必须以 `snapshot_` 开头、`.db` 结尾
/// - 必须是纯文件名（无父目录）
fn validate_snapshot_filename(file_name: &str) -> Result<(), String> {
    if file_name.contains('/')
        || file_name.contains('\\')
        || file_name.contains("..")
    {
        return Err(format!(
            "无效的快照文件名（包含路径分隔符或目录穿越）: {}",
            file_name
        ));
    }
    if !file_name.starts_with("snapshot_") || !file_name.ends_with(".db") {
        return Err(format!("无效的快照文件名（格式不匹配）: {}", file_name));
    }
    // 确保是纯文件名，没有父目录
    // Path::new("file.db").parent() 返回 Some("")（空路径），这是合法的
    // Path::new("dir/file.db").parent() 返回 Some("dir")，这是非法的
    if let Some(parent) = Path::new(file_name).parent() {
        if !parent.as_os_str().is_empty() {
            return Err(format!("无效的快照文件名（不应包含路径）: {}", file_name));
        }
    }
    Ok(())
}

/// 校验文件名并返回安全拼接后的路径，同时通过 canonicalize 确认路径仍在快照目录内
fn safe_snapshot_path(
    snapshots_dir: &Path,
    file_name: &str,
) -> Result<PathBuf, String> {
    validate_snapshot_filename(file_name)?;
    let snapshot_path = snapshots_dir.join(file_name);

    // canonicalize 双重校验：确保最终路径仍在快照目录内
    // （即使前面漏过了某种路径穿越手法）
    let canonical_dir = snapshots_dir
        .canonicalize()
        .map_err(|e| format!("无法解析快照目录路径: {}", e))?;
    let canonical_file = snapshot_path
        .canonicalize()
        .map_err(|e| format!("无法解析快照文件路径: {}", e))?;
    if !canonical_file.starts_with(&canonical_dir) {
        return Err(format!("快照路径越界: {}", file_name));
    }

    Ok(snapshot_path)
}

/// 从文件名解析快照原因
fn parse_reason_from_filename(file_name: &str) -> String {
    // 格式: snapshot_YYYYMMDD_HHMMSS_mmm_reason.db
    file_name
        .strip_prefix("snapshot_")
        .and_then(|s| s.strip_suffix(".db"))
        .map(|s| {
            // 跳过时间戳+毫秒部分 YYYYMMDD_HHMMSS_mmm_
            let parts: Vec<&str> = s.splitn(4, '_').collect();
            if parts.len() >= 4 {
                parts[3].replace('_', " ")
            } else {
                String::new()
            }
        })
        .unwrap_or_default()
}

/// 创建数据快照
#[tauri::command]
pub fn create_data_snapshot(
    state: State<DbState>,
    app_data_dir: String,
    reason: String,
) -> Result<SnapshotResult, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    create_snapshot_internal(&conn, &app_data_dir, &reason)
}

/// 列出所有快照
#[tauri::command]
pub fn list_data_snapshots(app_data_dir: String) -> Result<Vec<SnapshotInfo>, String> {
    let snapshots_dir = get_snapshots_dir(&app_data_dir);
    if !snapshots_dir.exists() {
        return Ok(Vec::new());
    }

    let mut snapshots: Vec<SnapshotInfo> = Vec::new();
    let entries =
        fs::read_dir(&snapshots_dir).map_err(|e| format!("读取快照目录失败: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("db") {
            continue;
        }

        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let reason = parse_reason_from_filename(&file_name);

        // 从文件名中提取时间戳作为创建时间（毫秒部分不参与解析，仅用于排序和唯一性）
        let created_at = file_name
            .strip_prefix("snapshot_")
            .and_then(|s| s.strip_suffix(".db"))
            .and_then(|s| {
                let parts: Vec<&str> = s.splitn(4, '_').collect();
                if parts.len() >= 2 {
                    let ts = format!("{}_{}", parts[0], parts[1]);
                    chrono::NaiveDateTime::parse_from_str(&ts, "%Y%m%d_%H%M%S")
                        .ok()
                        .and_then(|dt| {
                            chrono::Local
                                .from_local_datetime(&dt)
                                .single()
                                .map(|dt| dt.to_rfc3339())
                        })
                } else {
                    None
                }
            })
            .unwrap_or_default();

        snapshots.push(SnapshotInfo {
            file_name,
            reason,
            created_at,
            file_size: metadata.len(),
        });
    }

    // 按创建时间降序排序（最新的在前），时间相同时按文件名降序
    snapshots.sort_by(|a, b| b.created_at.cmp(&a.created_at).then_with(|| b.file_name.cmp(&a.file_name)));

    Ok(snapshots)
}

/// 恢复数据快照
///
/// 采用安全策略：
/// 1. 先创建 before-restore 快照
/// 2. 将快照复制到 dida.db.pending-restore
/// 3. 提示用户重启应用
/// 4. 应用启动时（init_db）检测 pending-restore 文件并完成恢复
#[tauri::command]
pub fn restore_data_snapshot(
    state: State<DbState>,
    app_data_dir: String,
    file_name: String,
) -> Result<RestoreResult, String> {
    let snapshots_dir = get_snapshots_dir(&app_data_dir);
    let snapshot_path = safe_snapshot_path(&snapshots_dir, &file_name)?;

    if !snapshot_path.exists() {
        return Err(format!("快照文件不存在: {}", file_name));
    }

    // 1. 先创建 before-restore 快照（失败则中止，防止用户失去恢复前状态）
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    create_snapshot_internal(&conn, &app_data_dir, "before-restore")
        .map_err(|e| format!("恢复前创建安全快照失败，已中止恢复以防数据丢失: {}", e))?;

    // 2. 将快照复制到 pending-restore 文件
    let pending_path = Path::new(&app_data_dir).join("dida.db.pending-restore");
    fs::copy(&snapshot_path, &pending_path)
        .map_err(|e| format!("恢复快照失败: {}", e))?;

    Ok(RestoreResult {
        message: "快照恢复已准备完成。请重启应用以完成恢复操作。".to_string(),
        requires_restart: true,
    })
}

/// 删除指定快照
#[tauri::command]
pub fn delete_data_snapshot(app_data_dir: String, file_name: String) -> Result<(), String> {
    let snapshots_dir = get_snapshots_dir(&app_data_dir);
    let snapshot_path = safe_snapshot_path(&snapshots_dir, &file_name)?;

    if !snapshot_path.exists() {
        return Err(format!("快照文件不存在: {}", file_name));
    }

    fs::remove_file(&snapshot_path).map_err(|e| format!("删除快照失败: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_schema;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        conn
    }

    #[test]
    fn test_create_snapshot_internal() {
        let conn = setup_db();
        let dir = std::env::temp_dir().join(format!(
            "dida_snapshot_test_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();

        let result = create_snapshot_internal(&conn, &dir.to_string_lossy(), "test-reason");
        assert!(result.is_ok());
        let result = result.unwrap();
        assert!(result.file_name.starts_with("snapshot_"));
        assert!(result.file_name.contains("test-reason"));

        // 验证快照文件存在
        let snapshot_path = dir.join("snapshots").join(&result.file_name);
        assert!(snapshot_path.exists());

        // 验证快照是有效的 SQLite 数据库
        let snapshot_conn = Connection::open(&snapshot_path).unwrap();
        let count: i64 = snapshot_conn
            .query_row("SELECT COUNT(*) FROM lists", [], |row| row.get(0))
            .unwrap();
        assert!(count >= 1); // 至少有默认清单
        drop(snapshot_conn); // Windows 下需要先关闭连接才能删除文件

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_list_data_snapshots_empty() {
        let dir = std::env::temp_dir().join(format!(
            "dida_snapshot_list_empty_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();

        let result = list_data_snapshots(dir.to_string_lossy().to_string());
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_list_data_snapshots_with_data() {
        let conn = setup_db();
        let dir = std::env::temp_dir().join(format!(
            "dida_snapshot_list_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();

        create_snapshot_internal(&conn, &dir.to_string_lossy(), "reason1").unwrap();
        create_snapshot_internal(&conn, &dir.to_string_lossy(), "reason2").unwrap();

        let result = list_data_snapshots(dir.to_string_lossy().to_string());
        assert!(result.is_ok());
        let snapshots = result.unwrap();
        assert_eq!(snapshots.len(), 2);
        // 最新的在前
        assert!(snapshots[0].file_name.contains("reason2"));
        assert!(snapshots[1].file_name.contains("reason1"));

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_delete_data_snapshot() {
        let conn = setup_db();
        let dir = std::env::temp_dir().join(format!(
            "dida_snapshot_delete_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();

        let result = create_snapshot_internal(&conn, &dir.to_string_lossy(), "to-delete");
        assert!(result.is_ok());
        let file_name = result.unwrap().file_name;

        let delete_result = delete_data_snapshot(dir.to_string_lossy().to_string(), file_name);
        assert!(delete_result.is_ok());

        // 验证文件已删除
        let snapshots = list_data_snapshots(dir.to_string_lossy().to_string()).unwrap();
        assert!(snapshots.is_empty());

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_sanitize_reason() {
        assert_eq!(sanitize_reason("import-replace"), "import-replace");
        assert_eq!(sanitize_reason("before restore"), "beforerestore");
        assert_eq!(sanitize_reason("test_123"), "test_123");
        assert_eq!(sanitize_reason(""), "");
        assert_eq!(sanitize_reason("很长的中文reason"), "reason");
    }

    #[test]
    fn test_parse_reason_from_filename() {
        // 新格式：snapshot_YYYYMMDD_HHMMSS_mmm_reason.db
        assert_eq!(
            parse_reason_from_filename("snapshot_20260101_120000_000_before-restore.db"),
            "before-restore"
        );
        assert_eq!(
            parse_reason_from_filename("snapshot_20260101_120000_123_importreplace.db"),
            "importreplace"
        );
        assert_eq!(
            parse_reason_from_filename("snapshot_20260101_120000_999.db"),
            ""
        );
    }

    #[test]
    fn test_validate_snapshot_filename_rejects_path_traversal() {
        // 正常文件名应通过（新格式含毫秒）
        assert!(validate_snapshot_filename("snapshot_20260101_120000_000_test.db").is_ok());
        assert!(validate_snapshot_filename("snapshot_20260101_120000_999.db").is_ok());

        // 路径穿越应被拒绝
        assert!(validate_snapshot_filename("../dida.db").is_err());
        assert!(validate_snapshot_filename("../../sync_logs.jsonl").is_err());
        assert!(validate_snapshot_filename("subdir/snapshot_test.db").is_err());
        assert!(validate_snapshot_filename("snapshot_test.db/../../evil").is_err());
        assert!(validate_snapshot_filename("\\\\..\\evil.db").is_err());

        // 格式不匹配应被拒绝
        assert!(validate_snapshot_filename("dida.db").is_err());
        assert!(validate_snapshot_filename("snapshot_test.txt").is_err());
        assert!(validate_snapshot_filename("not_a_snapshot.db").is_err());
    }

    #[test]
    fn test_safe_snapshot_path_rejects_traversal() {
        let dir = std::env::temp_dir().join(format!(
            "dida_snapshot_path_test_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let snapshots_dir = dir.join("snapshots");
        std::fs::create_dir_all(&snapshots_dir).unwrap();

        // 合法路径（文件不存在时 canonicalize 会失败，所以先创建一个）
        let valid_name = "snapshot_20260101_120000_000_test.db";
        let valid_path = snapshots_dir.join(valid_name);
        std::fs::write(&valid_path, "dummy").unwrap();
        assert!(safe_snapshot_path(&snapshots_dir, valid_name).is_ok());

        // 路径穿越应被拒绝
        assert!(safe_snapshot_path(&snapshots_dir, "../dida.db").is_err());
        assert!(safe_snapshot_path(&snapshots_dir, "../../evil.db").is_err());

        std::fs::remove_dir_all(&dir).unwrap();
    }
}
