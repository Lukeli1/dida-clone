// 附件相关命令（Attachment commands）
//
// 包含附件的查询、添加（将源文件复制到应用数据目录）、删除、
// 以及使用系统默认程序打开。
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;

use crate::db::DbState;
use super::now_rfc3339;

/// 附件结构体（与 attachments 表对齐）
#[derive(Debug, Serialize, Deserialize)]
pub struct Attachment {
    pub id: i64,
    pub task_id: i64,
    pub file_name: String,
    pub file_path: String,
    pub file_size: i64,
    pub mime_type: Option<String>,
    pub created_at: String,
}

/// 辅助函数：从数据库行构造 Attachment
fn row_to_attachment(row: &rusqlite::Row) -> rusqlite::Result<Attachment> {
    Ok(Attachment {
        id: row.get(0)?,
        task_id: row.get(1)?,
        file_name: row.get(2)?,
        file_path: row.get(3)?,
        file_size: row.get(4)?,
        mime_type: row.get(5)?,
        created_at: row.get(6)?,
    })
}

/// 辅助函数：根据文件名扩展名推断 MIME 类型
fn infer_mime_type(filename: &str) -> Option<String> {
    let ext = Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())?;
    let mime = match ext.as_str() {
        // 图片
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        // 文档
        "pdf" => "application/pdf",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt" => "application/vnd.ms-powerpoint",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        // 文本
        "txt" => "text/plain",
        "md" => "text/markdown",
        "json" => "application/json",
        "csv" => "text/csv",
        "html" | "htm" => "text/html",
        // 音频
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "flac" => "audio/flac",
        // 视频
        "mp4" => "video/mp4",
        "avi" => "video/x-msvideo",
        "mkv" => "video/x-matroska",
        // 压缩包
        "zip" => "application/zip",
        "rar" => "application/vnd.rar",
        "7z" => "application/x-7z-compressed",
        _ => return None,
    };
    Some(mime.to_string())
}

/// 辅助函数：生成唯一 ID（基于纳秒时间戳，无需额外依赖）
fn generate_unique_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    now.as_nanos().to_string()
}

/// 查询指定任务的所有附件
#[tauri::command]
pub fn get_attachments(state: State<DbState>, task_id: i64) -> Result<Vec<Attachment>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, task_id, file_name, file_path, file_size, mime_type, created_at
             FROM attachments WHERE task_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let attachments = stmt
        .query_map(params![task_id], row_to_attachment)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(attachments)
}

/// 添加附件：将源文件复制到 {app_data_dir}/attachments/{task_id}/{uuid}_{filename}，
/// 并写入数据库记录，返回附件信息。
#[tauri::command]
pub fn add_attachment(
    state: State<DbState>,
    task_id: i64,
    file_path: String,
    app_data_dir: String,
) -> Result<Attachment, String> {
    let src = PathBuf::from(&file_path);

    // 提取文件名
    let file_name = src
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "无法获取文件名".to_string())?
        .to_string();

    // 读取文件元数据获取大小
    let metadata = fs::metadata(&src).map_err(|e| format!("读取文件信息失败: {}", e))?;
    let file_size = metadata.len() as i64;

    // 推断 MIME 类型
    let mime_type = infer_mime_type(&file_name);

    // 构造目标目录：{app_data_dir}/attachments/{task_id}/
    let dest_dir = PathBuf::from(&app_data_dir)
        .join("attachments")
        .join(task_id.to_string());
    fs::create_dir_all(&dest_dir).map_err(|e| format!("创建附件目录失败: {}", e))?;

    // 构造目标文件名：{uuid}_{filename}
    let unique_id = generate_unique_id();
    let dest_file_name = format!("{}_{}", unique_id, file_name);
    let dest_path = dest_dir.join(&dest_file_name);

    // 复制文件
    fs::copy(&src, &dest_path).map_err(|e| format!("复制文件失败: {}", e))?;

    // 写入数据库
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = now_rfc3339();
    conn.execute(
        "INSERT INTO attachments (task_id, file_name, file_path, file_size, mime_type, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            task_id,
            file_name,
            dest_path.to_string_lossy().to_string(),
            file_size,
            mime_type,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, task_id, file_name, file_path, file_size, mime_type, created_at
         FROM attachments WHERE id = ?1",
        params![id],
        row_to_attachment,
    )
    .map_err(|e| e.to_string())
}

/// 删除附件：查询文件路径 -> 删除数据库记录 -> 删除文件
#[tauri::command]
pub fn delete_attachment(state: State<DbState>, attachment_id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // 查询文件路径
    let file_path: String = conn
        .query_row(
            "SELECT file_path FROM attachments WHERE id = ?1",
            params![attachment_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("查询附件失败: {}", e))?;

    // 删除数据库记录
    conn.execute(
        "DELETE FROM attachments WHERE id = ?1",
        params![attachment_id],
    )
    .map_err(|e| e.to_string())?;

    // 删除文件（忽略文件不存在的错误）
    if !file_path.is_empty() {
        let _ = fs::remove_file(&file_path);
    }

    Ok(())
}

/// 打开附件：使用系统默认程序打开文件
#[tauri::command]
pub fn open_attachment(state: State<DbState>, attachment_id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let file_path: String = conn
        .query_row(
            "SELECT file_path FROM attachments WHERE id = ?1",
            params![attachment_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("查询附件失败: {}", e))?;

    open::that(&file_path).map_err(|e| format!("打开文件失败: {}", e))?;
    Ok(())
}
