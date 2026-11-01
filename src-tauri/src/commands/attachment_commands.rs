// 附件相关命令（Attachment commands）
//
// 包含附件的查询、添加（将源文件复制到应用数据目录）、删除、
// 以及使用系统默认程序打开。
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;

use super::now_rfc3339;
use crate::db::DbState;

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

/// 图片附件大小上限：10MB（与前端校验保持一致，这里是最终防线）
const MAX_IMAGE_ATTACHMENT_BYTES: usize = 10 * 1024 * 1024;

/// 根据文件头识别图片格式，返回（扩展名，MIME）。
/// 不信任前端传入的扩展名 / MIME，避免把伪装文件写入附件目录。
fn detect_image_format(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some(("png", "image/png"));
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some(("jpg", "image/jpeg"));
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some(("gif", "image/gif"));
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some(("webp", "image/webp"));
    }
    if bytes.starts_with(b"BM") {
        return Some(("bmp", "image/bmp"));
    }
    None
}

/// 图片附件文件名安全化：只保留最后一段、替换非法字符、限制长度、
/// 处理 Windows 保留设备名；扩展名由 detect_image_format 强制指定。
fn sanitize_image_file_stem(raw_name: &str) -> String {
    let leaf = Path::new(raw_name)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");
    let stem = Path::new(leaf)
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("");

    let mut sanitized: String = stem
        .chars()
        .map(|ch| {
            if ch.is_control() || matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')
            {
                '_'
            } else {
                ch
            }
        })
        .collect();

    sanitized = sanitized
        .trim()
        .trim_matches('.')
        .trim()
        .trim_end_matches('_')
        .trim()
        .to_string();

    if sanitized.is_empty() {
        sanitized = "image".to_string();
    }
    if sanitized.chars().count() > 80 {
        sanitized = sanitized.chars().take(80).collect();
    }

    let upper = sanitized.to_ascii_uppercase();
    let reserved = matches!(
        upper.as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    );
    if reserved {
        sanitized = format!("_{}", sanitized);
    }

    sanitized
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

/// 从字节数据创建图片附件（剪贴板 / 图片选择器）
///
/// - `bytes` 为 base64 编码的图片字节（避免 Tauri IPC 以数字数组传输大文件）；
/// - 前端校验之外，后端再次校验大小、图片文件头与 MIME；
/// - 文件写入既有 `{app_data_dir}/attachments/{task_id}/` 目录，并插入既有 attachments 表；
/// - 数据库写入失败时清理已落盘文件，避免孤儿文件。
#[tauri::command]
pub fn add_image_attachment(
    state: State<DbState>,
    task_id: i64,
    file_name: String,
    mime_type: String,
    bytes: String,
    app_data_dir: String,
) -> Result<Attachment, String> {
    if !mime_type.trim().to_lowercase().starts_with("image/") {
        return Err("只能添加图片附件".to_string());
    }

    // base64 约膨胀 4/3，先做字符串级上限检查，避免解码超大数据
    if bytes.len() > MAX_IMAGE_ATTACHMENT_BYTES / 3 * 4 + 16 {
        return Err("图片大小不能超过 10MB".to_string());
    }

    let decoded = BASE64_STANDARD
        .decode(bytes.as_bytes())
        .map_err(|_| "图片数据解析失败".to_string())?;

    if decoded.is_empty() {
        return Err("图片内容为空".to_string());
    }
    if decoded.len() > MAX_IMAGE_ATTACHMENT_BYTES {
        return Err("图片大小不能超过 10MB".to_string());
    }

    // 以文件头为准，不信任前端声明的 MIME / 扩展名
    let (extension, detected_mime) = detect_image_format(&decoded)
        .ok_or_else(|| "仅支持 PNG、JPEG、GIF、WebP、BMP 格式的图片".to_string())?;

    let stem = sanitize_image_file_stem(&file_name);
    let final_name = format!("{}.{}", stem, extension);

    let dest_dir = PathBuf::from(&app_data_dir)
        .join("attachments")
        .join(task_id.to_string());
    fs::create_dir_all(&dest_dir).map_err(|e| format!("创建附件目录失败: {}", e))?;

    let unique_id = generate_unique_id();
    let dest_path = dest_dir.join(format!("{}_{}", unique_id, final_name));
    fs::write(&dest_path, &decoded).map_err(|e| format!("写入图片附件失败: {}", e))?;

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = now_rfc3339();
    let insert_result = conn.execute(
        "INSERT INTO attachments (task_id, file_name, file_path, file_size, mime_type, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            task_id,
            &final_name,
            dest_path.to_string_lossy().to_string(),
            decoded.len() as i64,
            Some(detected_mime),
            now,
        ],
    );

    if let Err(error) = insert_result {
        // 数据库失败时清理已写入文件，避免留下无主附件
        let _ = fs::remove_file(&dest_path);
        return Err(error.to_string());
    }

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

#[cfg(test)]
mod tests {
    use super::{detect_image_format, sanitize_image_file_stem};

    #[test]
    fn detects_supported_image_signatures() {
        assert_eq!(
            detect_image_format(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]),
            Some(("png", "image/png"))
        );
        assert_eq!(
            detect_image_format(&[0xFF, 0xD8, 0xFF, 0xE0]),
            Some(("jpg", "image/jpeg"))
        );
        assert_eq!(
            detect_image_format(b"GIF89a-rest"),
            Some(("gif", "image/gif"))
        );
        assert_eq!(
            detect_image_format(b"RIFF\x00\x00\x00\x00WEBPVP8 "),
            Some(("webp", "image/webp"))
        );
        assert_eq!(
            detect_image_format(b"BM\x00\x00"),
            Some(("bmp", "image/bmp"))
        );
    }

    #[test]
    fn rejects_unknown_or_disguised_content() {
        assert_eq!(detect_image_format(b""), None);
        assert_eq!(detect_image_format(b"<html>not an image</html>"), None);
        assert_eq!(detect_image_format(b"RIFF\x00\x00\x00\x00WAVE"), None);
    }

    #[test]
    fn sanitizes_paths_traversal_and_illegal_chars() {
        assert_eq!(sanitize_image_file_stem("../../evil.png"), "evil");
        assert_eq!(sanitize_image_file_stem(r"C:\Users\me\photo.jpg"), "photo");
        assert_eq!(
            sanitize_image_file_stem("a<b>c:d\"e|f?g*.png"),
            "a_b_c_d_e_f_g"
        );
        assert_eq!(sanitize_image_file_stem("   "), "image");
        assert_eq!(sanitize_image_file_stem("CON.png"), "_CON");
    }

    #[test]
    fn limits_file_stem_length() {
        let long_name = format!("{}.png", "a".repeat(200));
        assert_eq!(sanitize_image_file_stem(&long_name).chars().count(), 80);
    }
}
