use rusqlite::{Result, params};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::DbState;

#[derive(Debug, Serialize, Deserialize)]
pub struct Task {
    pub id: i64,
    pub title: String,
    pub notes: Option<String>,
    pub priority: i64,
    pub due_date: Option<String>,
    pub reminder: Option<String>,
    pub completed: bool,
    pub list_id: i64,
    pub parent_id: Option<i64>,
    pub repeat_rule: Option<String>,
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
    pub reminder: Option<String>,
    pub completed: Option<bool>,
    pub repeat_rule: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub color: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateTagRequest {
    pub name: String,
    pub color: Option<String>,
}

#[tauri::command]
pub fn get_tasks(state: State<DbState>) -> Result<Vec<Task>, String> {
    let conn = state.0.lock().unwrap();

    let mut stmt = conn
        .prepare("SELECT id, title, notes, priority, due_date, reminder, completed, list_id, parent_id, repeat_rule, created_at, updated_at FROM tasks ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let mut tasks: Vec<Task> = stmt
        .query_map([], |row| {
            Ok(Task {
                id: row.get(0)?,
                title: row.get(1)?,
                notes: row.get(2)?,
                priority: row.get(3)?,
                due_date: row.get(4)?,
                reminder: row.get(5)?,
                completed: row.get(6)?,
                list_id: row.get(7)?,
                parent_id: row.get(8)?,
                repeat_rule: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
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

    conn.execute(
        "INSERT INTO tasks (title, notes, priority, due_date, reminder, list_id, parent_id, repeat_rule, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            req.title,
            req.notes,
            req.priority.unwrap_or(2),
            req.due_date,
            req.reminder,
            req.list_id,
            req.parent_id,
            req.repeat_rule,
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
        reminder: req.reminder,
        completed: false,
        list_id: req.list_id,
        parent_id: req.parent_id,
        repeat_rule: req.repeat_rule,
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
    if let Some(ref reminder) = updates.reminder {
        set_clauses.push("reminder = ?".to_string());
        params_vec.push(Box::new(reminder.clone()));
    }
    if let Some(completed) = updates.completed {
        set_clauses.push("completed = ?".to_string());
        params_vec.push(Box::new(completed));
    }
    if let Some(ref repeat_rule) = updates.repeat_rule {
        set_clauses.push("repeat_rule = ?".to_string());
        params_vec.push(Box::new(repeat_rule.clone()));
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
    conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
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
        .prepare("SELECT id, name, color, created_at FROM tags ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;

    let tags = stmt
        .query_map([], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                created_at: row.get(3)?,
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
        "INSERT INTO tags (name, color, created_at) VALUES (?1, ?2, ?3)",
        params![req.name, req.color, now],
    ).map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    Ok(Tag {
        id,
        name: req.name,
        color: req.color,
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
