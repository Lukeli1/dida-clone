use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::DbState;
use super::now_rfc3339;

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

#[tauri::command]
pub fn get_lists(state: State<DbState>) -> Result<Vec<List>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

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
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = now_rfc3339();
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
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = now_rfc3339();

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
    let conn = state.0.lock().map_err(|e| e.to_string())?;

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
