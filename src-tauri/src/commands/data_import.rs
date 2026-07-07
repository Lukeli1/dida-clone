// 数据导入命令（Data import commands）
//
// 提供 1 个 Tauri command：
//   - import_json  导入 JSON（支持 replace / merge 两种模式）
//
// 本模块为 data_commands 的子模块，通过 data_commands.rs 中的
// `#[path]` 声明挂载到 commands::data_commands::data_import。
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

use super::super::{List, Tag};
use crate::db::*;

// ---------------------------------------------------------------------------
// import_json 专用结构
// ---------------------------------------------------------------------------

/// 导入数据容器（除 version 外所有集合可选，便于增量导入）
#[derive(Deserialize)]
struct ImportData {
    #[allow(dead_code)]
    version: String,
    lists: Option<Vec<List>>,
    tasks: Option<Vec<Task>>,
    tags: Option<Vec<Tag>>,
    habits: Option<Vec<Habit>>,
    habit_records: Option<Vec<HabitRecord>>,
}

/// 导入结果统计
#[derive(Serialize)]
pub struct ImportResult {
    pub lists_imported: usize,
    pub tasks_imported: usize,
    pub tags_imported: usize,
    pub habits_imported: usize,
    pub habit_records_imported: usize,
}

// ---------------------------------------------------------------------------
// import_json — 导入 JSON（replace / merge）
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn import_json(
    state: State<DbState>,
    json: String,
    mode: String,
) -> Result<ImportResult, String> {
    // 解析 JSON
    let data: ImportData = serde_json::from_str(&json).map_err(|e| e.to_string())?;

    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // replace 模式：按依赖顺序清空所有表（含 junction table task_tags）
    if mode == "replace" {
        tx.execute_batch(
            "DELETE FROM task_tags;
             DELETE FROM habit_records;
             DELETE FROM habits;
             DELETE FROM tasks;
             DELETE FROM tags;
             DELETE FROM lists;",
        )
        .map_err(|e| e.to_string())?;
    }

    // 按依赖顺序导入：lists → tags → tasks → habits → habit_records
    let mut lists_imported = 0usize;
    if let Some(ref lists) = data.lists {
        for list in lists {
            let n = tx
                .execute(
                    "INSERT OR IGNORE INTO lists (id, name, color, is_default, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        list.id,
                        list.name,
                        list.color,
                        list.is_default,
                        list.created_at,
                        list.updated_at,
                    ],
                )
                .map_err(|e| e.to_string())?;
            lists_imported += n;
        }
    }

    let mut tags_imported = 0usize;
    if let Some(ref tags) = data.tags {
        for tag in tags {
            let n = tx
                .execute(
                    "INSERT OR IGNORE INTO tags (id, name, color, parent_id, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![tag.id, tag.name, tag.color, tag.parent_id, tag.created_at],
                )
                .map_err(|e| e.to_string())?;
            tags_imported += n;
        }
    }

    let mut tasks_imported = 0usize;
    if let Some(ref tasks) = data.tasks {
        for task in tasks {
            let n = tx
                .execute(
                    "INSERT OR IGNORE INTO tasks (id, title, notes, priority, due_date, end_date, reminder, completed, archived, pinned, list_id, parent_id, repeat_rule, sort_order, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
                    params![
                        task.id,
                        task.title,
                        task.notes,
                        task.priority,
                        task.due_date,
                        task.end_date,
                        task.reminder,
                        task.completed,
                        task.archived,
                        task.pinned,
                        task.list_id,
                        task.parent_id,
                        task.repeat_rule,
                        task.sort_order,
                        task.created_at,
                        task.updated_at,
                    ],
                )
                .map_err(|e| e.to_string())?;
            tasks_imported += n;

            // 导入任务-标签关联
            for tag_id in &task.tag_ids {
                tx.execute(
                    "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
                    params![task.id, tag_id],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    let mut habits_imported = 0usize;
    if let Some(ref habits) = data.habits {
        for habit in habits {
            let n = tx
                .execute(
                    "INSERT OR IGNORE INTO habits (id, name, icon, icon_color, frequency, frequency_days, target_count, unit, start_date, color, sort_order, archived, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
                    params![
                        habit.id,
                        habit.name,
                        habit.icon,
                        habit.icon_color,
                        habit.frequency,
                        habit.frequency_days,
                        habit.target_count,
                        habit.unit,
                        habit.start_date,
                        habit.color,
                        habit.sort_order,
                        habit.archived,
                        habit.created_at,
                        habit.updated_at,
                    ],
                )
                .map_err(|e| e.to_string())?;
            habits_imported += n;
        }
    }

    let mut habit_records_imported = 0usize;
    if let Some(ref habit_records) = data.habit_records {
        for record in habit_records {
            let n = tx
                .execute(
                    "INSERT OR IGNORE INTO habit_records (id, habit_id, date, count, note, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        record.id,
                        record.habit_id,
                        record.date,
                        record.count,
                        record.note,
                        record.created_at,
                    ],
                )
                .map_err(|e| e.to_string())?;
            habit_records_imported += n;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(ImportResult {
        lists_imported,
        tasks_imported,
        tags_imported,
        habits_imported,
        habit_records_imported,
    })
}
