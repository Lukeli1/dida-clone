// 数据导入命令（Data import commands）
//
// 提供 2 个 Tauri command：
//   - import_json         导入 JSON（支持 replace / merge 两种模式）
//   - import_json_preview  预览导入结果（不实际写入数据）
//
// 本模块为 data_commands 的子模块，通过 data_commands.rs 中的
// `#[path]` 声明挂载到 commands::data_commands::data_import。
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use tauri::State;

use super::super::{List, Tag};
use crate::commands::snapshot_commands::create_snapshot_internal;
use crate::db::*;

/// 辅助函数：查询所有 ID 到 HashSet
fn query_id_set(conn: &Connection, sql: &str) -> Result<HashSet<i64>, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let ids: HashSet<i64> = stmt
        .query_map([], |row| row.get::<_, i64>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(ids)
}

/// 辅助函数：查询所有标签名称到 HashSet
fn query_tag_names(conn: &Connection) -> Result<HashSet<String>, String> {
    let mut stmt = conn
        .prepare("SELECT name FROM tags")
        .map_err(|e| e.to_string())?;
    let names: HashSet<String> = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(names)
}

/// 辅助函数：查询 habit_records 的 (habit_id, date) 到 HashSet
fn query_habit_record_pairs(conn: &Connection) -> Result<HashSet<(i64, String)>, String> {
    let mut stmt = conn
        .prepare("SELECT habit_id, date FROM habit_records")
        .map_err(|e| e.to_string())?;
    let pairs: HashSet<(i64, String)> = stmt
        .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(pairs)
}

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
// import_json_preview — 预览导入结果（不实际写入）
// ---------------------------------------------------------------------------

/// 单表预览信息
#[derive(Serialize)]
pub struct TablePreview {
    /// JSON 中的总条数
    pub total: usize,
    /// 将实际导入的条数
    pub will_import: usize,
    /// 将跳过的条数
    pub will_skip: usize,
    /// 跳过原因摘要
    pub skip_reasons: Vec<String>,
}

/// 现有数据计数（replace 模式用）
#[derive(Serialize)]
pub struct ExistingCounts {
    pub lists: usize,
    pub tasks: usize,
    pub tags: usize,
    pub habits: usize,
    pub habit_records: usize,
}

/// 导入预览结果
#[derive(Serialize)]
pub struct ImportPreviewResult {
    pub mode: String,
    pub lists: TablePreview,
    pub tags: TablePreview,
    pub tasks: TablePreview,
    pub habits: TablePreview,
    pub habit_records: TablePreview,
    /// replace 模式下将删除的现有数据计数
    pub will_delete_existing: bool,
    pub existing_counts: Option<ExistingCounts>,
    /// 附件记录说明
    pub attachment_note: String,
}

/// 预览导入 JSON：分析 JSON 数据，返回将导入/跳过的统计，不修改数据库
#[tauri::command]
pub fn import_json_preview(
    state: State<DbState>,
    json: String,
    mode: String,
) -> Result<ImportPreviewResult, String> {
    // 解析 JSON
    let data: ImportData = serde_json::from_str(&json).map_err(|e| e.to_string())?;

    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // 查询现有数据
    let existing_list_ids = query_id_set(&conn, "SELECT id FROM lists")?;
    let existing_task_ids = query_id_set(&conn, "SELECT id FROM tasks")?;
    let existing_tag_ids = query_id_set(&conn, "SELECT id FROM tags")?;
    let existing_tag_names = query_tag_names(&conn)?;
    let existing_habit_ids = query_id_set(&conn, "SELECT id FROM habits")?;
    let existing_habit_record_ids = query_id_set(&conn, "SELECT id FROM habit_records")?;
    let existing_habit_records = query_habit_record_pairs(&conn)?;

    // replace 模式下，数据库会被清空，所以现有 ID 不会造成冲突。
    // 只有 JSON 内部自冲突（重复 ID、重复 name）才会导致 INSERT OR IGNORE 跳过。
    let is_replace = mode == "replace";

    // 分析 lists
    let lists_preview = if let Some(ref lists) = data.lists {
        let mut will_import = 0;
        let mut seen_ids: HashSet<i64> = HashSet::new();
        let mut id_conflicts = 0;
        for list in lists {
            if is_replace {
                // replace 模式：只检测 JSON 内部重复
                if seen_ids.contains(&list.id) {
                    id_conflicts += 1;
                } else {
                    seen_ids.insert(list.id);
                    will_import += 1;
                }
            } else {
                // merge 模式：检测与现有库的 ID 冲突
                if existing_list_ids.contains(&list.id) {
                    id_conflicts += 1;
                } else {
                    will_import += 1;
                }
            }
        }
        let mut skip_reasons = Vec::new();
        if id_conflicts > 0 {
            let desc = if is_replace { "JSON 内部 ID 重复" } else { "ID 冲突" };
            skip_reasons.push(format!("{} 个 {}", id_conflicts, desc));
        }
        TablePreview {
            total: lists.len(),
            will_import,
            will_skip: id_conflicts,
            skip_reasons,
        }
    } else {
        TablePreview {
            total: 0,
            will_import: 0,
            will_skip: 0,
            skip_reasons: vec![],
        }
    };

    // 分析 tags（ID 冲突 + name UNIQUE 冲突）
    let tags_preview = if let Some(ref tags) = data.tags {
        let mut will_import = 0;
        let mut id_conflicts = 0;
        let mut name_conflicts = 0;
        let mut seen_ids: HashSet<i64> = HashSet::new();
        let mut seen_names: HashSet<String> = HashSet::new();
        for tag in tags {
            if is_replace {
                // replace 模式：只检测 JSON 内部重复
                if seen_ids.contains(&tag.id) {
                    id_conflicts += 1;
                } else if seen_names.contains(&tag.name) {
                    name_conflicts += 1;
                } else {
                    seen_ids.insert(tag.id);
                    seen_names.insert(tag.name.clone());
                    will_import += 1;
                }
            } else {
                // merge 模式：检测与现有库冲突
                if existing_tag_ids.contains(&tag.id) {
                    id_conflicts += 1;
                } else if existing_tag_names.contains(&tag.name) {
                    name_conflicts += 1;
                } else {
                    will_import += 1;
                }
            }
        }
        let mut skip_reasons = Vec::new();
        if id_conflicts > 0 {
            let desc = if is_replace { "JSON 内部 ID 重复" } else { "ID 冲突" };
            skip_reasons.push(format!("{} 个 {}", id_conflicts, desc));
        }
        if name_conflicts > 0 {
            let desc = if is_replace { "JSON 内部名称重复" } else { "名称冲突" };
            skip_reasons.push(format!("{} 个 {}", name_conflicts, desc));
        }
        TablePreview {
            total: tags.len(),
            will_import,
            will_skip: id_conflicts + name_conflicts,
            skip_reasons,
        }
    } else {
        TablePreview {
            total: 0,
            will_import: 0,
            will_skip: 0,
            skip_reasons: vec![],
        }
    };

    // 分析 tasks
    let tasks_preview = if let Some(ref tasks) = data.tasks {
        let mut will_import = 0;
        let mut id_conflicts = 0;
        let mut seen_ids: HashSet<i64> = HashSet::new();
        for task in tasks {
            if is_replace {
                if seen_ids.contains(&task.id) {
                    id_conflicts += 1;
                } else {
                    seen_ids.insert(task.id);
                    will_import += 1;
                }
            } else {
                if existing_task_ids.contains(&task.id) {
                    id_conflicts += 1;
                } else {
                    will_import += 1;
                }
            }
        }
        let mut skip_reasons = Vec::new();
        if id_conflicts > 0 {
            let desc = if is_replace { "JSON 内部 ID 重复" } else { "ID 冲突" };
            skip_reasons.push(format!("{} 个 {}", id_conflicts, desc));
        }
        TablePreview {
            total: tasks.len(),
            will_import,
            will_skip: id_conflicts,
            skip_reasons,
        }
    } else {
        TablePreview {
            total: 0,
            will_import: 0,
            will_skip: 0,
            skip_reasons: vec![],
        }
    };

    // 分析 habits
    let habits_preview = if let Some(ref habits) = data.habits {
        let mut will_import = 0;
        let mut id_conflicts = 0;
        let mut seen_ids: HashSet<i64> = HashSet::new();
        for habit in habits {
            if is_replace {
                if seen_ids.contains(&habit.id) {
                    id_conflicts += 1;
                } else {
                    seen_ids.insert(habit.id);
                    will_import += 1;
                }
            } else {
                if existing_habit_ids.contains(&habit.id) {
                    id_conflicts += 1;
                } else {
                    will_import += 1;
                }
            }
        }
        let mut skip_reasons = Vec::new();
        if id_conflicts > 0 {
            let desc = if is_replace { "JSON 内部 ID 重复" } else { "ID 冲突" };
            skip_reasons.push(format!("{} 个 {}", id_conflicts, desc));
        }
        TablePreview {
            total: habits.len(),
            will_import,
            will_skip: id_conflicts,
            skip_reasons,
        }
    } else {
        TablePreview {
            total: 0,
            will_import: 0,
            will_skip: 0,
            skip_reasons: vec![],
        }
    };

    // 分析 habit_records（ID 冲突 + (habit_id, date) UNIQUE 冲突）
    let habit_records_preview = if let Some(ref habit_records) = data.habit_records {
        let mut will_import = 0;
        let mut id_conflicts = 0;
        let mut pair_conflicts = 0;
        let mut seen_ids: HashSet<i64> = HashSet::new();
        let mut seen_pairs: HashSet<(i64, String)> = HashSet::new();
        for record in habit_records {
            if is_replace {
                if seen_ids.contains(&record.id) {
                    id_conflicts += 1;
                } else if seen_pairs.contains(&(record.habit_id, record.date.clone())) {
                    pair_conflicts += 1;
                } else {
                    seen_ids.insert(record.id);
                    seen_pairs.insert((record.habit_id, record.date.clone()));
                    will_import += 1;
                }
            } else {
                if existing_habit_record_ids.contains(&record.id) {
                    id_conflicts += 1;
                } else if existing_habit_records.contains(&(record.habit_id, record.date.clone())) {
                    pair_conflicts += 1;
                } else {
                    will_import += 1;
                }
            }
        }
        let mut skip_reasons = Vec::new();
        if id_conflicts > 0 {
            let desc = if is_replace { "JSON 内部 ID 重复" } else { "ID 冲突" };
            skip_reasons.push(format!("{} 个 {}", id_conflicts, desc));
        }
        if pair_conflicts > 0 {
            let desc = if is_replace { "JSON 内部 (habit_id, date) 重复" } else { "(habit_id, date) 冲突" };
            skip_reasons.push(format!("{} 个 {}", pair_conflicts, desc));
        }
        TablePreview {
            total: habit_records.len(),
            will_import,
            will_skip: id_conflicts + pair_conflicts,
            skip_reasons,
        }
    } else {
        TablePreview {
            total: 0,
            will_import: 0,
            will_skip: 0,
            skip_reasons: vec![],
        }
    };

    // replace 模式下计算现有数据量
    let (will_delete_existing, existing_counts) = if mode == "replace" {
        let counts = ExistingCounts {
            lists: existing_list_ids.len(),
            tasks: existing_task_ids.len(),
            tags: existing_tag_ids.len(),
            habits: existing_habit_ids.len(),
            habit_records: existing_habit_record_ids.len(),
        };
        (true, Some(counts))
    } else {
        (false, None)
    };

    Ok(ImportPreviewResult {
        mode,
        lists: lists_preview,
        tags: tags_preview,
        tasks: tasks_preview,
        habits: habits_preview,
        habit_records: habit_records_preview,
        will_delete_existing,
        existing_counts,
        attachment_note: "JSON 导出含附件记录元信息，但不含附件文件本体；导入暂不支持恢复附件记录。".to_string(),
    })
}

// ---------------------------------------------------------------------------
// import_json — 导入 JSON（replace / merge）
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn import_json(
    state: State<DbState>,
    json: String,
    mode: String,
    app_data_dir: String,
) -> Result<ImportResult, String> {
    // 解析 JSON
    let data: ImportData = serde_json::from_str(&json).map_err(|e| e.to_string())?;

    let mut conn = state.0.lock().map_err(|e| e.to_string())?;

    // replace 模式：在清空数据前强制创建快照（后端强制，不依赖前端）
    // 快照失败必须中止导入，防止磁盘满/权限异常导致数据丢失
    if mode == "replace" {
        create_snapshot_internal(&conn, &app_data_dir, "before-import-replace")
            .map_err(|e| format!("替换导入前创建安全快照失败，已中止导入以防数据丢失: {}", e))?;
    }

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
            let status = if task.completed {
                "done"
            } else if matches!(task.status.as_str(), "todo" | "in_progress") {
                task.status.as_str()
            } else {
                "todo"
            };
            let completed_at = if task.completed {
                task.completed_at.as_ref()
            } else {
                None
            };
            let n = tx
                .execute(
                    "INSERT OR IGNORE INTO tasks (id, title, notes, priority, due_date, end_date, all_day, reminder, reminder_minutes, completed, completed_at, status, archived, pinned, list_id, parent_id, repeat_rule, sort_order, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
                    params![
                        task.id,
                        task.title,
                        task.notes,
                        task.priority,
                        task.due_date,
                        task.end_date,
                        task.all_day,
                        task.reminder,
                        task.reminder_minutes,
                        task.completed,
                        completed_at,
                        status,
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
