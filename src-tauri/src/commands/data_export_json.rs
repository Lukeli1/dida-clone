// export_json — 导出全部数据为 JSON 字符串
//
// 本文件为 data_export 的子模块，通过 data_export.rs 中的
// `#[path = "data_export_json.rs"]` 挂载到
// commands::data_commands::data_export::data_export_json。
//
// 包含 ExportData 结构体与 export_json Tauri command。
use serde::Serialize;
use std::collections::HashMap;
use tauri::State;

use crate::commands::{now_rfc3339, Attachment, List, Tag};
use crate::db::*;

// ---------------------------------------------------------------------------
// 导出数据结构
// ---------------------------------------------------------------------------

/// 导出数据容器（export_json 返回的 JSON 结构）
///
/// 注意：attachments 字段仅包含附件元信息（文件名、大小、MIME 类型等），
/// 不包含附件文件本体。导入时暂不支持恢复附件记录。
#[derive(Serialize)]
pub struct ExportData {
    version: String,
    exported_at: String,
    lists: Vec<List>,
    tasks: Vec<Task>,
    tags: Vec<Tag>,
    habits: Vec<Habit>,
    habit_records: Vec<HabitRecord>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    attachments: Vec<Attachment>,
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
        .prepare("SELECT id, title, notes, priority, due_date, end_date, all_day, reminder, reminder_minutes, completed, completed_at, CASE WHEN completed = 1 THEN 'done' ELSE COALESCE(NULLIF(status, ''), 'todo') END AS status, archived, pinned, list_id, parent_id, repeat_rule, sort_order, created_at, updated_at FROM tasks ORDER BY pinned DESC, sort_order ASC, created_at DESC")
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
                all_day: row.get::<_, i64>(6)? != 0,
                reminder: row.get(7)?,
                reminder_minutes: row.get(8)?,
                completed: row.get(9)?,
                completed_at: row.get(10)?,
                status: row.get(11)?,
                archived: row.get::<_, i64>(12)? != 0,
                pinned: row.get::<_, i64>(13)? != 0,
                list_id: row.get(14)?,
                parent_id: row.get(15)?,
                repeat_rule: row.get(16)?,
                sort_order: row.get(17)?,
                created_at: row.get(18)?,
                updated_at: row.get(19)?,
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

    // 6. 查询所有附件元信息（不含文件本体）
    let mut stmt = conn
        .prepare("SELECT id, task_id, file_name, file_path, file_size, mime_type, created_at FROM attachments ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;
    let attachments: Vec<Attachment> = stmt
        .query_map([], |row| {
            Ok(Attachment {
                id: row.get(0)?,
                task_id: row.get(1)?,
                file_name: row.get(2)?,
                file_path: row.get(3)?,
                file_size: row.get(4)?,
                mime_type: row.get(5)?,
                created_at: row.get(6)?,
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
        attachments,
    };

    serde_json::to_string_pretty(&data).map_err(|e| e.to_string())
}
