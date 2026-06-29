// 数据导出命令（Data export commands）
//
// 提供 3 个 Tauri command：
//   - export_json     导出全部数据为 JSON 字符串
//   - export_csv      导出任务列表为 CSV
//   - export_markdown 导出任务为 Markdown（按清单分组）
//
// 本模块为 data_commands 的子模块，通过 data_commands.rs 中的
// `#[path]` 声明挂载到 commands::data_commands::data_export。
use serde::Serialize;
use std::collections::HashMap;
use tauri::State;

use crate::db::*;
use super::super::{List, Tag, now_rfc3339};

// ---------------------------------------------------------------------------
// 导出数据结构
// ---------------------------------------------------------------------------

/// 导出数据容器（export_json 返回的 JSON 结构）
#[derive(Serialize)]
struct ExportData {
    version: String,
    exported_at: String,
    lists: Vec<List>,
    tasks: Vec<Task>,
    tags: Vec<Tag>,
    habits: Vec<Habit>,
    habit_records: Vec<HabitRecord>,
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/// CSV 字段转义：包含逗号、换行或双引号时用双引号包裹，内部双引号转义为两个双引号
fn csv_escape(field: &str) -> String {
    if field.contains(',') || field.contains('\n') || field.contains('"') {
        format!("\"{}\"", field.replace('"', "\"\""))
    } else {
        field.to_string()
    }
}

/// 优先级数字转中文标签
fn priority_label(p: i64) -> &'static str {
    match p {
        1 => "低",
        2 => "中",
        3 => "高",
        _ => "无",
    }
}

/// 布尔值转 是/否
fn bool_yes_no(b: bool) -> &'static str {
    if b {
        "是"
    } else {
        "否"
    }
}

// ---------------------------------------------------------------------------
// export_json — 导出全部数据为 JSON 字符串
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn export_json(state: State<DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // 1. 查询所有清单
    let mut stmt = conn
        .prepare("SELECT id, name, color, is_default, created_at, updated_at FROM lists ORDER BY is_default DESC, created_at ASC")
        .map_err(|e| e.to_string())?;
    let lists: Vec<List> = stmt
        .query_map([], |row| {
            Ok(List {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                is_default: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    // 2. 查询所有任务（含 tag_ids）
    let mut stmt = conn
        .prepare("SELECT id, title, notes, priority, due_date, end_date, reminder, completed, archived, pinned, list_id, parent_id, repeat_rule, sort_order, created_at, updated_at FROM tasks ORDER BY pinned DESC, sort_order ASC, created_at DESC")
        .map_err(|e| e.to_string())?;
    let mut tasks: Vec<Task> = stmt
        .query_map([], |row| {
            Ok(Task {
                id: row.get(0)?,
                title: row.get(1)?,
                notes: row.get(2)?,
                priority: row.get(3)?,
                due_date: row.get(4)?,
                end_date: row.get(5)?,
                reminder: row.get(6)?,
                completed: row.get(7)?,
                archived: row.get::<_, i64>(8)? != 0,
                pinned: row.get::<_, i64>(9)? != 0,
                list_id: row.get(10)?,
                parent_id: row.get(11)?,
                repeat_rule: row.get(12)?,
                sort_order: row.get(13)?,
                created_at: row.get(14)?,
                updated_at: row.get(15)?,
                tag_ids: Vec::new(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    // 填充 tag_ids（与 task_crud::get_tasks 一致的 HashMap 策略）
    let mut tag_stmt = conn
        .prepare("SELECT task_id, tag_id FROM task_tags")
        .map_err(|e| e.to_string())?;
    let tag_rows: Vec<(i64, i64)> = tag_stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    drop(tag_stmt);

    let mut tag_map: HashMap<i64, Vec<i64>> = HashMap::new();
    for (task_id, tag_id) in tag_rows {
        tag_map.entry(task_id).or_default().push(tag_id);
    }
    for task in &mut tasks {
        if let Some(tags) = tag_map.remove(&task.id) {
            task.tag_ids = tags;
        }
    }

    // 3. 查询所有标签
    let mut stmt = conn
        .prepare("SELECT id, name, color, parent_id, created_at FROM tags ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;
    let tags: Vec<Tag> = stmt
        .query_map([], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                parent_id: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    // 4. 查询所有习惯
    let mut stmt = conn
        .prepare("SELECT id, name, icon, icon_color, frequency, frequency_days, target_count, unit, start_date, color, sort_order, archived, created_at, updated_at FROM habits ORDER BY sort_order ASC, created_at ASC")
        .map_err(|e| e.to_string())?;
    let habits: Vec<Habit> = stmt
        .query_map([], |row| {
            Ok(Habit {
                id: row.get(0)?,
                name: row.get(1)?,
                icon: row.get(2)?,
                icon_color: row.get(3)?,
                frequency: row.get(4)?,
                frequency_days: row.get(5)?,
                target_count: row.get(6)?,
                unit: row.get(7)?,
                start_date: row.get(8)?,
                color: row.get(9)?,
                sort_order: row.get(10)?,
                archived: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    // 5. 查询所有习惯打卡记录
    let mut stmt = conn
        .prepare("SELECT id, habit_id, date, count, note, created_at FROM habit_records ORDER BY date ASC")
        .map_err(|e| e.to_string())?;
    let habit_records: Vec<HabitRecord> = stmt
        .query_map([], |row| {
            Ok(HabitRecord {
                id: row.get(0)?,
                habit_id: row.get(1)?,
                date: row.get(2)?,
                count: row.get(3)?,
                note: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    // 组装 ExportData 并序列化
    let data = ExportData {
        version: "1.0".to_string(),
        exported_at: now_rfc3339(),
        lists,
        tasks,
        tags,
        habits,
        habit_records,
    };

    serde_json::to_string_pretty(&data).map_err(|e| e.to_string())
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
             ORDER BY t.created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<(i64, String, Option<String>, i64, Option<String>, bool, bool, String)> = stmt
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
        .prepare("SELECT id, title, priority, due_date, completed, list_id FROM tasks ORDER BY pinned DESC, sort_order ASC, created_at DESC")
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
                        md.push_str(&format!("- {} {} ({})\n", checkbox, title, parts.join("，")));
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
                        md.push_str(&format!("- {} {} ({})\n", checkbox, title, parts.join("，")));
                    }
                }
            }
        }
    }

    Ok(md)
}
