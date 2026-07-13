// export_csv — 导出任务列表为 CSV
//
// 本文件为 data_export 的子模块，通过 data_export.rs 中的
// `#[path = "data_export_csv.rs"]` 挂载到
// commands::data_commands::data_export::data_export_csv。
//
// 包含 export_csv Tauri command 与三个辅助函数（csv_escape / priority_label / bool_yes_no）。
// 辅助函数声明为 pub(crate) 以供 data_export_markdown 复用，但不被 glob re-export 暴露到
// 模块公开 API（glob `pub use` 仅会 re-export `pub` 项）。
use tauri::State;

use crate::db::*;

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/// CSV 字段转义：包含逗号、换行或双引号时用双引号包裹，内部双引号转义为两个双引号
pub(crate) fn csv_escape(field: &str) -> String {
    if field.contains(',') || field.contains('\n') || field.contains('"') {
        format!("\"{}\"", field.replace('"', "\"\""))
    } else {
        field.to_string()
    }
}

/// 优先级数字转中文标签
pub(crate) fn priority_label(p: i64) -> &'static str {
    match p {
        1 => "低",
        2 => "中",
        3 => "高",
        _ => "无",
    }
}

/// 布尔值转 是/否
pub(crate) fn bool_yes_no(b: bool) -> &'static str {
    if b {
        "是"
    } else {
        "否"
    }
}

// ---------------------------------------------------------------------------
// export_csv — 导出任务列表为 CSV
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn export_csv(state: State<DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.title, l.name, t.priority, t.due_date, t.completed, t.archived, t.created_at
             FROM tasks t
             LEFT JOIN lists l ON t.list_id = l.id
             WHERE t.deleted_at IS NULL
             ORDER BY t.created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    #[allow(clippy::type_complexity)]
    let rows: Vec<(
        i64,
        String,
        Option<String>,
        i64,
        Option<String>,
        bool,
        bool,
        String,
    )> = stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get::<_, i64>(5)? != 0,
                row.get::<_, i64>(6)? != 0,
                row.get(7)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    // 构造 CSV
    let header = "ID,标题,清单,优先级,截止日期,完成,归档,创建时间";
    let mut lines: Vec<String> = vec![header.to_string()];

    for (id, title, list_name, priority, due_date, completed, archived, created_at) in rows {
        let row = format!(
            "{},{},{},{},{},{},{},{}",
            id,
            csv_escape(&title),
            csv_escape(list_name.as_deref().unwrap_or("")),
            priority_label(priority),
            csv_escape(due_date.as_deref().unwrap_or("")),
            bool_yes_no(completed),
            bool_yes_no(archived),
            csv_escape(&created_at),
        );
        lines.push(row);
    }

    Ok(lines.join("\n"))
}
