// export_markdown — 导出任务为 Markdown（按清单分组）
//
// 本文件为 data_export 的子模块，通过 data_export.rs 中的
// `#[path = "data_export_markdown.rs"]` 挂载到
// commands::data_commands::data_export::data_export_markdown。
//
// 复用 data_export_csv 中的 priority_label 辅助函数（pub(crate) 可见）。
use std::collections::HashMap;
use tauri::State;

use super::data_export_csv::priority_label;
use crate::db::*;

// ---------------------------------------------------------------------------
// export_markdown — 导出任务为 Markdown（按清单分组）
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn export_markdown(state: State<DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // 查询所有清单（按默认优先、创建时间升序）
    let mut stmt = conn
        .prepare("SELECT id, name FROM lists ORDER BY is_default DESC, created_at ASC")
        .map_err(|e| e.to_string())?;
    let lists: Vec<(i64, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    // 查询所有任务
    let mut stmt = conn
        .prepare("SELECT id, title, priority, due_date, completed, list_id FROM tasks WHERE deleted_at IS NULL ORDER BY pinned DESC, sort_order ASC, created_at DESC")
        .map_err(|e| e.to_string())?;
    let tasks: Vec<(i64, String, i64, Option<String>, bool, i64)> = stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get::<_, i64>(4)? != 0,
                row.get(5)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    // 按 list_id 分组
    #[allow(clippy::type_complexity)]
    let mut grouped: HashMap<i64, Vec<&(i64, String, i64, Option<String>, bool, i64)>> =
        HashMap::new();
    for task in &tasks {
        grouped.entry(task.5).or_default().push(task);
    }

    // 构造 Markdown
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let mut md = format!("# 任务导出 — {}\n\n", today);

    for (list_id, list_name) in &lists {
        md.push_str(&format!("## {}\n", list_name));
        if let Some(list_tasks) = grouped.remove(list_id) {
            for (_id, title, priority, due_date, completed, _list_id) in list_tasks {
                let checkbox = if *completed { "[x]" } else { "[ ]" };
                if *completed {
                    md.push_str(&format!("- {} {} (已完成)\n", checkbox, title));
                } else {
                    // 构造可选的元信息
                    let mut parts: Vec<String> = Vec::new();
                    if *priority > 0 {
                        parts.push(format!("优先级：{}", priority_label(*priority)));
                    }
                    if let Some(d) = due_date {
                        parts.push(format!("截止：{}", d));
                    }
                    if parts.is_empty() {
                        md.push_str(&format!("- {} {}\n", checkbox, title));
                    } else {
                        md.push_str(&format!(
                            "- {} {} ({})\n",
                            checkbox,
                            title,
                            parts.join("，")
                        ));
                    }
                }
            }
        }
        md.push('\n');
    }

    // 处理未匹配到清单的任务（理论上 FK 约束下不会出现，防御性处理）
    if !grouped.is_empty() {
        md.push_str("## 收件箱\n");
        for tasks in grouped.values() {
            for (_id, title, priority, due_date, completed, _list_id) in tasks {
                let checkbox = if *completed { "[x]" } else { "[ ]" };
                if *completed {
                    md.push_str(&format!("- {} {} (已完成)\n", checkbox, title));
                } else {
                    let mut parts: Vec<String> = Vec::new();
                    if *priority > 0 {
                        parts.push(format!("优先级：{}", priority_label(*priority)));
                    }
                    if let Some(d) = due_date {
                        parts.push(format!("截止：{}", d));
                    }
                    if parts.is_empty() {
                        md.push_str(&format!("- {} {}\n", checkbox, title));
                    } else {
                        md.push_str(&format!(
                            "- {} {} ({})\n",
                            checkbox,
                            title,
                            parts.join("，")
                        ));
                    }
                }
            }
        }
    }

    Ok(md)
}
