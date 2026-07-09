use rusqlite::{params, Result};
use serde::Deserialize;
use tauri::State;

use super::super::now_rfc3339;
use crate::db::{DbState, Task};

#[derive(Debug, Deserialize)]
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

#[tauri::command]
pub fn create_task(state: State<DbState>, req: CreateTaskRequest) -> Result<Task, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = now_rfc3339();
    let sort_order = chrono::Local::now().timestamp_millis() as f64;

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
        title: req.title,
        notes: req.notes,
        priority: req.priority.unwrap_or(2),
        due_date: req.due_date,
        end_date: req.end_date,
        all_day: req.all_day,
        reminder: req.reminder,
        reminder_minutes: req.reminder_minutes,
        completed: false,
        completed_at: None,
        status: "todo".to_string(),
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
