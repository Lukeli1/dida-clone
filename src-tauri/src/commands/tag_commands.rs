use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::DbState;
use super::now_rfc3339;

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
pub fn get_tags(state: State<DbState>) -> Result<Vec<Tag>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

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
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = now_rfc3339();

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
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    // 先删除关联的 task_tags
    conn.execute("DELETE FROM task_tags WHERE tag_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tags WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn add_tag_to_task(state: State<DbState>, task_id: i64, tag_id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
        params![task_id, tag_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn remove_tag_from_task(state: State<DbState>, task_id: i64, tag_id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM task_tags WHERE task_id = ?1 AND tag_id = ?2",
        params![task_id, tag_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}
