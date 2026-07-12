use rusqlite::{params, Result};
use serde::Deserialize;
use tauri::State;

use super::super::now_rfc3339;
use crate::db::{DbState, Task};

#[derive(Debug, Deserialize, Clone)]
pub struct CreateTaskRequest {
    pub title: String,
    pub notes: Option<String>,
    pub priority: Option<i64>,
    pub due_date: Option<String>,
    pub end_date: Option<String>,
    #[serde(default)]
    pub all_day: bool,
    pub reminder: Option<String>,
    pub reminder_minutes: Option<i64>,
    pub list_id: i64,
    pub parent_id: Option<i64>,
    pub repeat_rule: Option<String>,
}

/// 核心创建逻辑，接受 &Connection 以便在批量执行事务中复用。
pub fn do_create_task(
    conn: &rusqlite::Connection,
    req: &CreateTaskRequest,
) -> Result<Task, String> {
    let now = now_rfc3339();
    let sort_order = chrono::Local::now().timestamp_millis() as f64;

    if let Some(parent_id) = req.parent_id {
        let parent_parent_id: Option<i64> = conn
            .query_row(
                "SELECT parent_id FROM tasks WHERE id = ?1",
                params![parent_id],
                |row| row.get(0),
            )
            .map_err(|e| {
                format!(
                    "创建子任务失败：父任务 #{} 不存在或查询出错: {}",
                    parent_id, e
                )
            })?;
        if parent_parent_id.is_some() {
            return Err("创建子任务失败：当前仅支持一层子任务".to_string());
        }
    }

    conn.execute(
        "INSERT INTO tasks (title, notes, priority, due_date, end_date, all_day, reminder, reminder_minutes, completed_at, status, list_id, parent_id, repeat_rule, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, 'todo', ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            req.title,
            req.notes,
            req.priority.unwrap_or(2),
            req.due_date,
            req.end_date,
            req.all_day,
            req.reminder,
            req.reminder_minutes,
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
        title: req.title.clone(),
        notes: req.notes.clone(),
        priority: req.priority.unwrap_or(2),
        due_date: req.due_date.clone(),
        end_date: req.end_date.clone(),
        all_day: req.all_day,
        reminder: req.reminder.clone(),
        reminder_minutes: req.reminder_minutes,
        completed: false,
        completed_at: None,
        status: "todo".to_string(),
        archived: false,
        pinned: false,
        list_id: req.list_id,
        parent_id: req.parent_id,
        repeat_rule: req.repeat_rule.clone(),
        sort_order,
        created_at: now.clone(),
        updated_at: now,
        tag_ids: Vec::new(),
    })
}

#[tauri::command]
pub fn create_task(state: State<DbState>, req: CreateTaskRequest) -> Result<Task, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    do_create_task(&conn, &req)
}
