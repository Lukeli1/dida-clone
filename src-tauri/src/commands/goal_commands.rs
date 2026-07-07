// 目标/OKR 管理相关命令（Goal commands）
//
// 负责目标（年度/季度/月度）的 CRUD、状态更新以及目标-任务关联的维护与进度查询。
//
// 注意：
//   - `type` 是 Rust 关键字，在 Goal 结构体中用 `r#type`，serde 序列化后字段名仍为 `type`，与前端约定一致。
//   - `create_goal` 的 Rust 参数名同样不能用 `type`，使用 `goal_type`；Tauri invoke 时前端传
//     `goalType`（camelCase），Tauri 会自动转换为 `goal_type`。
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

use super::now_rfc3339;
use crate::db::DbState;

/// 目标记录（与 goals 表对齐）
///
/// 字段 `type` 因是 Rust 关键字，使用 `r#type` 转义；
/// serde 序列化/反序列化时仍输出为 `type`，与前端约定一致。
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Goal {
    pub id: i64,
    pub title: String,
    pub description: Option<String>,
    pub r#type: String, // 'annual' | 'quarterly' | 'monthly'
    pub period_start: String,
    pub period_end: String,
    pub status: String, // 'active' | 'completed' | 'archived'
    pub color: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// 目标进度统计（关联任务完成率）
#[derive(Debug, Serialize)]
pub struct GoalProgress {
    pub total_tasks: i64,
    pub completed_tasks: i64,
    pub progress_percent: f64,
}

/// 辅助函数：从数据库行构造 Goal
fn row_to_goal(row: &rusqlite::Row) -> rusqlite::Result<Goal> {
    Ok(Goal {
        id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        r#type: row.get(3)?,
        period_start: row.get(4)?,
        period_end: row.get(5)?,
        status: row.get(6)?,
        color: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

/// 获取目标列表：可按 status 过滤，默认按 created_at 倒序返回全部。
///
/// 前端调用：`invoke('get_goals', { status: null })`。
#[tauri::command]
pub fn get_goals(status: Option<String>, state: State<DbState>) -> Result<Vec<Goal>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT id, title, description, type, period_start, period_end, status, color, created_at, updated_at FROM goals",
    );
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(ref s) = status {
        sql.push_str(" WHERE status = ?");
        params_vec.push(Box::new(s.clone()));
    }
    sql.push_str(" ORDER BY created_at DESC");

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let goals = stmt
        .query_map(params_refs.as_slice(), row_to_goal)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(goals)
}

/// 创建目标，返回新记录 id。
///
/// 参数 `goal_type` 对应 goals 表中的 `type` 列（避免使用 Rust 关键字 `type`）。
/// 前端 invoke 时传 `goalType`，Tauri 自动转换为 `goal_type`。
#[tauri::command]
pub fn create_goal(
    title: String,
    description: Option<String>,
    goal_type: String,
    period_start: String,
    period_end: String,
    color: Option<String>,
    state: State<DbState>,
) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = now_rfc3339();

    conn.execute(
        "INSERT INTO goals (title, description, type, period_start, period_end, status, color, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6, ?7, ?8)",
        params![title, description, goal_type, period_start, period_end, color, now, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(conn.last_insert_rowid())
}

/// 更新目标字段（仅更新非 null 字段：title / description / status / color）。
/// 同时刷新 updated_at。
#[tauri::command]
pub fn update_goal(
    id: i64,
    title: Option<String>,
    description: Option<String>,
    status: Option<String>,
    color: Option<String>,
    state: State<DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = now_rfc3339();

    let mut set_clauses: Vec<String> = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(ref title) = title {
        set_clauses.push("title = ?".to_string());
        params_vec.push(Box::new(title.clone()));
    }
    if let Some(ref description) = description {
        set_clauses.push("description = ?".to_string());
        params_vec.push(Box::new(description.clone()));
    }
    if let Some(ref status) = status {
        set_clauses.push("status = ?".to_string());
        params_vec.push(Box::new(status.clone()));
    }
    if let Some(ref color) = color {
        set_clauses.push("color = ?".to_string());
        params_vec.push(Box::new(color.clone()));
    }

    if set_clauses.is_empty() {
        // 没有字段需要更新：直接返回，避免无谓的 UPDATE
        return Ok(());
    }

    set_clauses.push("updated_at = ?".to_string());
    params_vec.push(Box::new(now));

    let sql = format!("UPDATE goals SET {} WHERE id = ?", set_clauses.join(", "));
    params_vec.push(Box::new(id));

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, params_refs.as_slice())
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 删除目标（goal_tasks 因 ON DELETE CASCADE 自动级联删除关联记录）。
#[tauri::command]
pub fn delete_goal(id: i64, state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM goals WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 将任务关联到目标（INSERT OR IGNORE：已存在则忽略，避免重复）。
#[tauri::command]
pub fn link_task_to_goal(goal_id: i64, task_id: i64, state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO goal_tasks (goal_id, task_id) VALUES (?1, ?2)",
        params![goal_id, task_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 解除任务与目标的关联。
#[tauri::command]
pub fn unlink_task_from_goal(
    goal_id: i64,
    task_id: i64,
    state: State<DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM goal_tasks WHERE goal_id = ?1 AND task_id = ?2",
        params![goal_id, task_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 查询目标进度：统计该目标关联的任务总数与已完成数，计算完成百分比。
///
/// 已完成数取 tasks.completed = 1（true）的关联任务数；
/// 若目标无关联任务，进度为 0%（total_tasks = 0 时返回 0.0）。
#[tauri::command]
pub fn get_goal_progress(goal_id: i64, state: State<DbState>) -> Result<GoalProgress, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let (total_tasks, completed_tasks): (i64, i64) = conn
        .query_row(
            "SELECT COUNT(*),
                    COALESCE(SUM(CASE WHEN t.completed = 1 THEN 1 ELSE 0 END), 0)
             FROM goal_tasks gt
             JOIN tasks t ON gt.task_id = t.id
             WHERE gt.goal_id = ?1",
            params![goal_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let progress_percent = if total_tasks == 0 {
        0.0
    } else {
        (completed_tasks as f64 / total_tasks as f64) * 100.0
    };

    Ok(GoalProgress {
        total_tasks,
        completed_tasks,
        progress_percent,
    })
}

/// 查询任务关联的所有目标（用于任务详情中显示"关联目标"）。
#[tauri::command]
pub fn get_task_goals(task_id: i64, state: State<DbState>) -> Result<Vec<Goal>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT g.id, g.title, g.description, g.type, g.period_start, g.period_end, g.status, g.color, g.created_at, g.updated_at
             FROM goals g
             JOIN goal_tasks gt ON g.id = gt.goal_id
             WHERE gt.task_id = ?1
             ORDER BY g.created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let goals = stmt
        .query_map(params![task_id], row_to_goal)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(goals)
}
