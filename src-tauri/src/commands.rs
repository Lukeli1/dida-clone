use rusqlite::{Result, params};
use serde::{Deserialize, Serialize};
use tauri::State;
use chrono::{Datelike, TimeZone};

use crate::db::DbState;

#[derive(Debug, Serialize, Deserialize)]
pub struct Task {
    pub id: i64,
    pub title: String,
    pub notes: Option<String>,
    pub priority: i64,
    pub due_date: Option<String>,
    pub end_date: Option<String>,
    pub reminder: Option<String>,
    pub completed: bool,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub pinned: bool,
    pub list_id: i64,
    pub parent_id: Option<i64>,
    pub repeat_rule: Option<String>,
    pub sort_order: f64,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub tag_ids: Vec<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct List {
    pub id: i64,
    pub name: String,
    pub color: Option<String>,
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateTaskRequest {
    pub title: String,
    pub notes: Option<String>,
    pub priority: Option<i64>,
    pub due_date: Option<String>,
    pub end_date: Option<String>,
    pub reminder: Option<String>,
    pub list_id: i64,
    pub parent_id: Option<i64>,
    pub repeat_rule: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateListRequest {
    pub name: String,
    pub color: Option<String>,
    pub is_default: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateListRequest {
    pub name: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTaskRequest {
    pub title: Option<String>,
    pub notes: Option<String>,
    pub priority: Option<i64>,
    pub due_date: Option<String>,
    pub end_date: Option<String>,
    pub reminder: Option<String>,
    pub completed: Option<bool>,
    pub archived: Option<bool>,
    pub pinned: Option<bool>,
    pub list_id: Option<i64>,
    pub parent_id: Option<i64>,
    pub repeat_rule: Option<String>,
    pub sort_order: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub color: Option<String>,
    pub parent_id: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateTagRequest {
    pub name: String,
    pub color: Option<String>,
    pub parent_id: Option<i64>,
}

#[tauri::command]
pub fn get_tasks(state: State<DbState>) -> Result<Vec<Task>, String> {
    let conn = state.0.lock().unwrap();

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
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // 批量查询所有 task_tags 关联
    let mut tag_stmt = conn
        .prepare("SELECT task_id, tag_id FROM task_tags")
        .map_err(|e| e.to_string())?;
    let tag_rows: Vec<(i64, i64)> = tag_stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // 将 tag_ids 合并到对应的 task
    for (task_id, tag_id) in tag_rows {
        if let Some(task) = tasks.iter_mut().find(|t| t.id == task_id) {
            task.tag_ids.push(tag_id);
        }
    }

    Ok(tasks)
}

#[tauri::command]
pub fn create_task(state: State<DbState>, req: CreateTaskRequest) -> Result<Task, String> {
    let conn = state.0.lock().unwrap();
    let now = chrono::Local::now().to_rfc3339();
    let sort_order = chrono::Local::now().timestamp_millis() as f64;

    conn.execute(
        "INSERT INTO tasks (title, notes, priority, due_date, end_date, reminder, list_id, parent_id, repeat_rule, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            req.title,
            req.notes,
            req.priority.unwrap_or(2),
            req.due_date,
            req.end_date,
            req.reminder,
            req.list_id,
            req.parent_id,
            req.repeat_rule,
            sort_order,
            now,
            now,
        ],
    ).map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    Ok(Task {
        id,
        title: req.title,
        notes: req.notes,
        priority: req.priority.unwrap_or(2),
        due_date: req.due_date,
        end_date: req.end_date,
        reminder: req.reminder,
        completed: false,
        archived: false,
        pinned: false,
        list_id: req.list_id,
        parent_id: req.parent_id,
        repeat_rule: req.repeat_rule,
        sort_order,
        created_at: now.clone(),
        updated_at: now,
        tag_ids: Vec::new(),
    })
}

#[tauri::command]
pub fn update_task(state: State<DbState>, id: i64, updates: UpdateTaskRequest) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    let now = chrono::Local::now().to_rfc3339();

    // 动态构建 UPDATE 语句
    let mut set_clauses: Vec<String> = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(ref title) = updates.title {
        set_clauses.push("title = ?".to_string());
        params_vec.push(Box::new(title.clone()));
    }
    if let Some(ref notes) = updates.notes {
        set_clauses.push("notes = ?".to_string());
        params_vec.push(Box::new(notes.clone()));
    }
    if let Some(priority) = updates.priority {
        set_clauses.push("priority = ?".to_string());
        params_vec.push(Box::new(priority));
    }
    if let Some(ref due_date) = updates.due_date {
        set_clauses.push("due_date = ?".to_string());
        params_vec.push(Box::new(due_date.clone()));
    }
    if let Some(ref end_date) = updates.end_date {
        set_clauses.push("end_date = ?".to_string());
        params_vec.push(Box::new(end_date.clone()));
    }
    if let Some(ref reminder) = updates.reminder {
        set_clauses.push("reminder = ?".to_string());
        params_vec.push(Box::new(reminder.clone()));
    }
    if let Some(completed) = updates.completed {
        set_clauses.push("completed = ?".to_string());
        params_vec.push(Box::new(completed));
    }
    if let Some(archived) = updates.archived {
        set_clauses.push("archived = ?".to_string());
        params_vec.push(Box::new(archived));
    }
    if let Some(pinned) = updates.pinned {
        set_clauses.push("pinned = ?".to_string());
        params_vec.push(Box::new(pinned));
    }
    if let Some(list_id) = updates.list_id {
        set_clauses.push("list_id = ?".to_string());
        params_vec.push(Box::new(list_id));
    }
    if let Some(parent_id) = updates.parent_id {
        set_clauses.push("parent_id = ?".to_string());
        params_vec.push(Box::new(parent_id));
    }
    if let Some(ref repeat_rule) = updates.repeat_rule {
        set_clauses.push("repeat_rule = ?".to_string());
        params_vec.push(Box::new(repeat_rule.clone()));
    }
    if let Some(sort_order) = updates.sort_order {
        set_clauses.push("sort_order = ?".to_string());
        params_vec.push(Box::new(sort_order));
    }

    set_clauses.push("updated_at = ?".to_string());
    params_vec.push(Box::new(now));

    let sql = format!("UPDATE tasks SET {} WHERE id = ?", set_clauses.join(", "));
    params_vec.push(Box::new(id));

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    conn.execute(&sql, params_refs.as_slice())
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn delete_task(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    // 先删除关联的 task_tags，避免外键约束失败
    conn.execute("DELETE FROM task_tags WHERE task_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    // 删除子任务的 task_tags
    conn.execute(
        "DELETE FROM task_tags WHERE task_id IN (SELECT id FROM tasks WHERE parent_id = ?1)",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    // 删除子任务
    conn.execute("DELETE FROM tasks WHERE parent_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    // 最后删除任务本身
    conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn duplicate_task(state: State<DbState>, id: i64) -> Result<Task, String> {
    let conn = state.0.lock().unwrap();
    let now = chrono::Local::now().to_rfc3339();
    let sort_order = chrono::Local::now().timestamp_millis() as f64;

    // 查询原任务所有字段
    let task: (String, Option<String>, i64, Option<String>, Option<String>, Option<String>, bool, bool, bool, i64, Option<i64>, Option<String>, f64) = conn
        .query_row(
            "SELECT title, notes, priority, due_date, end_date, reminder, completed, archived, pinned, list_id, parent_id, repeat_rule, sort_order FROM tasks WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?, row.get(10)?, row.get(11)?, row.get(12)?)),
        )
        .map_err(|e| e.to_string())?;

    let (title, notes, priority, due_date, end_date, reminder, _completed, _archived, _pinned, list_id, parent_id, repeat_rule, _sort_order) = task;

    // 插入副本：completed=false, archived=false, pinned=false
    conn.execute(
        "INSERT INTO tasks (title, notes, priority, due_date, end_date, reminder, completed, archived, pinned, list_id, parent_id, repeat_rule, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 0, 0, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![title, notes, priority, due_date, end_date, reminder, list_id, parent_id, repeat_rule, sort_order, now, now],
    ).map_err(|e| e.to_string())?;

    let new_id = conn.last_insert_rowid();

    // 复制标签关联
    let tag_ids: Vec<i64> = conn
        .prepare("SELECT tag_id FROM task_tags WHERE task_id = ?1")
        .map_err(|e| e.to_string())?
        .query_map(params![id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    for tag_id in &tag_ids {
        conn.execute(
            "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
            params![new_id, tag_id],
        ).map_err(|e| e.to_string())?;
    }

    Ok(Task {
        id: new_id,
        title,
        notes,
        priority,
        due_date,
        end_date,
        reminder,
        completed: false,
        archived: false,
        pinned: false,
        list_id,
        parent_id,
        repeat_rule,
        sort_order,
        created_at: now.clone(),
        updated_at: now,
        tag_ids,
    })
}

#[tauri::command]
pub fn get_lists(state: State<DbState>) -> Result<Vec<List>, String> {
    let conn = state.0.lock().unwrap();

    let mut stmt = conn
        .prepare("SELECT id, name, color, is_default, created_at, updated_at FROM lists ORDER BY is_default DESC, created_at ASC")
        .map_err(|e| e.to_string())?;

    let lists = stmt
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
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(lists)
}

#[tauri::command]
pub fn create_list(state: State<DbState>, req: CreateListRequest) -> Result<List, String> {
    let conn = state.0.lock().unwrap();
    let now = chrono::Local::now().to_rfc3339();
    let color = req.color.unwrap_or_else(|| "#6B7280".to_string());

    conn.execute(
        "INSERT INTO lists (name, color, is_default, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![req.name, color, req.is_default.unwrap_or(false), now, now],
    ).map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    Ok(List {
        id,
        name: req.name,
        color: Some(color),
        is_default: req.is_default.unwrap_or(false),
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub fn update_list(state: State<DbState>, id: i64, updates: UpdateListRequest) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    let now = chrono::Local::now().to_rfc3339();

    let mut set_clauses: Vec<String> = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(ref name) = updates.name {
        set_clauses.push("name = ?".to_string());
        params_vec.push(Box::new(name.clone()));
    }
    if let Some(ref color) = updates.color {
        set_clauses.push("color = ?".to_string());
        params_vec.push(Box::new(color.clone()));
    }

    if set_clauses.is_empty() {
        return Ok(());
    }

    set_clauses.push("updated_at = ?".to_string());
    params_vec.push(Box::new(now));

    let sql = format!("UPDATE lists SET {} WHERE id = ?", set_clauses.join(", "));
    params_vec.push(Box::new(id));

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    conn.execute(&sql, params_refs.as_slice())
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn delete_list(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().unwrap();

    // 不允许删除默认清单
    let is_default: bool = conn
        .query_row("SELECT is_default FROM lists WHERE id = ?1", params![id], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if is_default {
        return Err("无法删除默认清单".to_string());
    }

    // 将该清单下的任务移到默认清单
    let default_id: i64 = conn
        .query_row("SELECT id FROM lists WHERE is_default = 1", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    conn.execute("UPDATE tasks SET list_id = ?1 WHERE list_id = ?2", params![default_id, id])
        .map_err(|e| e.to_string())?;

    // 删除清单
    conn.execute("DELETE FROM lists WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ===== 标签命令 =====

#[tauri::command]
pub fn get_tags(state: State<DbState>) -> Result<Vec<Tag>, String> {
    let conn = state.0.lock().unwrap();

    let mut stmt = conn
        .prepare("SELECT id, name, color, parent_id, created_at FROM tags ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;

    let tags = stmt
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
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(tags)
}

#[tauri::command]
pub fn create_tag(state: State<DbState>, req: CreateTagRequest) -> Result<Tag, String> {
    let conn = state.0.lock().unwrap();
    let now = chrono::Local::now().to_rfc3339();

    conn.execute(
        "INSERT INTO tags (name, color, parent_id, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![req.name, req.color, req.parent_id, now],
    ).map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    Ok(Tag {
        id,
        name: req.name,
        color: req.color,
        parent_id: req.parent_id,
        created_at: now,
    })
}

#[tauri::command]
pub fn delete_tag(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    // 先删除关联的 task_tags
    conn.execute("DELETE FROM task_tags WHERE tag_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tags WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn add_tag_to_task(state: State<DbState>, task_id: i64, tag_id: i64) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
        params![task_id, tag_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn remove_tag_from_task(state: State<DbState>, task_id: i64, tag_id: i64) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "DELETE FROM task_tags WHERE task_id = ?1 AND tag_id = ?2",
        params![task_id, tag_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// ===== 任务排序 =====

#[derive(Debug, Deserialize)]
pub struct ReorderItem {
    pub id: i64,
    pub sort_order: f64,
}

#[tauri::command]
pub fn reorder_tasks(state: State<DbState>, items: Vec<ReorderItem>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    let now = chrono::Local::now().to_rfc3339();
    for item in &items {
        conn.execute(
            "UPDATE tasks SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
            params![item.sort_order, now, item.id],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ===== 重复任务完成 =====

#[derive(Debug, Serialize)]
pub struct CompleteResult {
    pub new_task_id: Option<i64>,
}

#[tauri::command]
pub fn complete_task(state: State<DbState>, id: i64) -> Result<CompleteResult, String> {
    let conn = state.0.lock().unwrap();
    let now = chrono::Local::now().to_rfc3339();

    // 查询任务详情
    let task: (String, Option<String>, i64, Option<String>, Option<String>, i64, Option<String>, f64) = conn
        .query_row(
            "SELECT title, notes, priority, due_date, reminder, list_id, repeat_rule, sort_order FROM tasks WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?)),
        )
        .map_err(|e| e.to_string())?;

    let (title, notes, priority, due_date, reminder, list_id, repeat_rule, _sort_order) = task;

    // 标记当前任务为已完成
    conn.execute(
        "UPDATE tasks SET completed = 1, updated_at = ?1 WHERE id = ?2",
        params![now, id],
    ).map_err(|e| e.to_string())?;

    // 如果有重复规则，创建下一个周期的任务
    if let Some(ref rule) = repeat_rule {
        if !rule.is_empty() {
            let next_due = due_date.as_ref().and_then(|d| {
                compute_next_due_date(d, rule)
            });

            let next_sort_order = chrono::Local::now().timestamp_millis() as f64;

            conn.execute(
                "INSERT INTO tasks (title, notes, priority, due_date, reminder, list_id, repeat_rule, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![title, notes, priority, next_due, reminder, list_id, repeat_rule, next_sort_order, now, now],
            ).map_err(|e| e.to_string())?;

            let new_id = conn.last_insert_rowid();

            // 复制标签关联
            let tag_ids: Vec<i64> = conn
                .prepare("SELECT tag_id FROM task_tags WHERE task_id = ?1")
                .map_err(|e| e.to_string())?
                .query_map(params![id], |row| row.get(0))
                .map_err(|e| e.to_string())?
                .filter_map(|r| r.ok())
                .collect();

            for tag_id in tag_ids {
                conn.execute(
                    "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
                    params![new_id, tag_id],
                ).map_err(|e| e.to_string())?;
            }

            return Ok(CompleteResult { new_task_id: Some(new_id) });
        }
    }

    Ok(CompleteResult { new_task_id: None })
}

fn compute_next_due_date(due_date: &str, rule: &str) -> Option<String> {
    let dt = chrono::DateTime::parse_from_rfc3339(due_date).ok()?;
    let local = dt.with_timezone(&chrono::Local);

    // 先尝试解析为 JSON 规则
    if let Ok(rule_obj) = serde_json::from_str::<serde_json::Value>(rule) {
        let next = compute_next_from_json(&local, &rule_obj)?;

        // 支持 end_date 字段：如果下一个日期超过 end_date 则返回 None
        if let Some(end_date) = rule_obj.get("end_date").and_then(|v| v.as_str()) {
            if let Ok(end_dt) = chrono::DateTime::parse_from_rfc3339(end_date) {
                let end_local = end_dt.with_timezone(&chrono::Local);
                if next > end_local {
                    return None;
                }
            }
        }

        return Some(next.to_rfc3339());
    }

    // 回退到旧的字符串匹配逻辑
    let next = match rule.as_ref() {
        "daily" => local + chrono::Duration::days(1),
        "weekly" => local + chrono::Duration::weeks(1),
        "monthly" => {
            // 简单处理：加 30 天
            local + chrono::Duration::days(30)
        }
        "weekdays" => {
            let tomorrow = local + chrono::Duration::days(1);
            let weekday = tomorrow.weekday();
            if weekday == chrono::Weekday::Sat {
                local + chrono::Duration::days(3)
            } else if weekday == chrono::Weekday::Sun {
                local + chrono::Duration::days(2)
            } else {
                tomorrow
            }
        }
        _ => return None,
    };

    Some(next.to_rfc3339())
}

/// 根据自定义 JSON 重复规则计算下一个到期日期。
///
/// 支持的规则格式：
/// - `{"type": "daily", "interval": 2}` 每 2 天
/// - `{"type": "weekly", "interval": 1, "days": [1, 3, 5]}` 每周一三五（1=周一 ... 7=周日）
/// - `{"type": "monthly", "day": 15}` 每月 15 号
/// - `{"type": "monthly", "interval": 3, "day": 1}` 每 3 个月的 1 号
fn compute_next_from_json(
    local: &chrono::DateTime<chrono::Local>,
    rule: &serde_json::Value,
) -> Option<chrono::DateTime<chrono::Local>> {
    let rule_type = rule.get("type")?.as_str()?;
    let interval = rule
        .get("interval")
        .and_then(|i| i.as_i64())
        .unwrap_or(1)
        .max(1);

    match rule_type {
        "daily" => Some(*local + chrono::Duration::days(interval)),

        "weekly" => {
            if let Some(days) = rule.get("days").and_then(|d| d.as_array()) {
                // 收集星期几 (1=周一 ... 7=周日)
                let weekdays: Vec<u32> = days
                    .iter()
                    .filter_map(|d| d.as_i64().map(|n| n as u32))
                    .collect();

                if weekdays.is_empty() {
                    return Some(*local + chrono::Duration::weeks(interval));
                }

                // 以周一为锚点计算周差
                let local_wd = local.weekday().num_days_from_monday() as i64; // 0=周一
                let local_monday = local.date_naive() - chrono::Duration::days(local_wd);

                let mut candidate = *local + chrono::Duration::days(1);
                // 搜索上限：interval 周 + 一周余量
                let limit = (7 * interval) + 7;
                let mut searched = 0;

                while searched < limit {
                    let cand_wd = candidate.weekday().num_days_from_monday() as u32 + 1; // 1=周一
                    if weekdays.contains(&cand_wd) {
                        let cand_monday =
                            candidate.date_naive() - chrono::Duration::days(cand_wd as i64 - 1);
                        let weeks_diff = (cand_monday - local_monday).num_days() / 7;
                        if weeks_diff >= 0 && weeks_diff % interval == 0 {
                            return Some(candidate);
                        }
                    }
                    candidate = candidate + chrono::Duration::days(1);
                    searched += 1;
                }
                None
            } else {
                Some(*local + chrono::Duration::weeks(interval))
            }
        }

        "monthly" => {
            let day = rule
                .get("day")
                .and_then(|d| d.as_i64())
                .unwrap_or(local.day() as i64) as u32;

            let mut year = local.year();
            // 从下个 interval 周期开始
            let mut month = local.month() + interval as u32;
            while month > 12 {
                month -= 12;
                year += 1;
            }

            // 处理 day 超出该月天数的情况（如 2 月 30 日）：跳到下个 interval 周期
            loop {
                if let Some(naive) = chrono::NaiveDate::from_ymd_opt(year, month, day) {
                    let naive_dt = naive.and_time(local.naive_local().time());
                    let candidate_local =
                        chrono::Local.from_local_datetime(&naive_dt).single()?;
                    return Some(candidate_local);
                }

                month += interval as u32;
                while month > 12 {
                    month -= 12;
                    year += 1;
                }

                // 防止无限循环
                if year > local.year() + 100 {
                    return None;
                }
            }
        }

        _ => None,
    }
}
