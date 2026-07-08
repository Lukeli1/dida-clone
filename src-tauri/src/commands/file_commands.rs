//! 受控文件读写命令（P1-07 安全边界收紧）
//!
//! 取代前端直接通过 `@tauri-apps/plugin-fs` 任意读写文件。
//! 后端通过系统对话框获取用户明确选择的路径，限制扩展名，拒绝目录路径，
//! 从而把文件 IO 收敛到受控入口。

use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, FilePath};

/// 弹出系统保存对话框，将文本内容写入用户选择的文件。
///
/// - `default_name`：默认文件名（如 `dida-export-2026-07-07.json`）
/// - `filters`：扩展名过滤，元素为 `(名称, 扩展名逗号拼接)`，如 `("JSON", "json")`
/// - `content`：待写入的文本
///
/// 返回最终写入的文件路径；用户取消时返回 `null`。
/// 拒绝目录路径，写入失败返回错误字符串。
#[tauri::command]
pub async fn export_text_file(
    app: AppHandle,
    default_name: String,
    filters: Vec<(String, String)>,
    content: String,
) -> Result<Option<String>, String> {
    let mut builder = app.dialog().file().set_file_name(&default_name);
    for (name, exts) in &filters {
        let ext_vec: Vec<&str> = exts.split(',').collect();
        builder = builder.add_filter(name, &ext_vec);
    }

    let file_path = builder.blocking_save_file();

    match file_path {
        Some(FilePath::Path(path)) => {
            if path.is_dir() {
                return Err("不能写入目录路径".to_string());
            }
            std::fs::write(&path, content).map_err(|e| format!("写入文件失败: {}", e))?;
            Ok(Some(path.to_string_lossy().to_string()))
        }
        Some(_) => Err("不支持的平台路径类型".to_string()),
        None => Ok(None),
    }
}

/// 弹出系统打开对话框，读取用户选择的文本文件内容。
///
/// - `filters`：扩展名过滤
///
/// 返回 `(文件名, 文件内容)`；用户取消时返回 `null`。
#[tauri::command]
pub async fn import_text_file(
    app: AppHandle,
    filters: Vec<(String, String)>,
) -> Result<Option<(String, String)>, String> {
    let mut builder = app.dialog().file();
    for (name, exts) in &filters {
        let ext_vec: Vec<&str> = exts.split(',').collect();
        builder = builder.add_filter(name, &ext_vec);
    }

    let file_path = builder.blocking_pick_file();

    match file_path {
        Some(FilePath::Path(path)) => {
            if path.is_dir() {
                return Err("不能读取目录路径".to_string());
            }
            let content =
                std::fs::read_to_string(&path).map_err(|e| format!("读取文件失败: {}", e))?;
            let file_name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path.to_string_lossy().to_string());
            Ok(Some((file_name, content)))
        }
        Some(_) => Err("不支持的平台路径类型".to_string()),
        None => Ok(None),
    }
}
