// 目标/OKR 管理相关命令（Goal commands）
//
// 负责目标（年度/季度/月度）的 CRUD、状态更新、目标-任务关联、关键结果（KR）维护与进度查询。
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

/// 目标关键结果（KR）
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GoalKeyResult {
    pub id: i64,
    pub goal_id: i64,
    pub title: String,
    pub target_value: f64,
    pub current_value: f64,
    pub unit: Option<String>,
    pub sort_order: i64,
}

/// 目标进度统计
///
/// - 有 KR 时：`progress_percent` 为各 KR 完成度（0–100 封顶）的算术平均；
/// - 无 KR 时：沿用关联任务完成率。
/// `total_tasks` / `completed_tasks` 始终反映关联任务统计，便于 UI 兼容展示。
/// `key_results` 为该目标下的 KR 列表（按 sort_order, id）。
#[derive(Debug, Serialize, Clone)]
pub struct GoalProgress {
    pub total_tasks: i64,
    pub completed_tasks: i64,
    pub progress_percent: f64,
    pub key_results: Vec<GoalKeyResult>,
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

/// 辅助函数：从数据库行构造 GoalKeyResult
fn row_to_key_result(row: &rusqlite::Row) -> rusqlite::Result<GoalKeyResult> {
    Ok(GoalKeyResult {
        id: row.get(0)?,
        goal_id: row.get(1)?,
        title: row.get(2)?,
        target_value: row.get(3)?,
        current_value: row.get(4)?,
        unit: row.get(5)?,
        sort_order: row.get(6)?,
    })
}

/// 校验 KR 数值边界：target_value > 0，current_value >= 0。
fn validate_kr_values(target_value: f64, current_value: f64) -> Result<(), String> {
    if !target_value.is_finite() || target_value <= 0.0 {
        return Err("目标值必须大于 0".to_string());
    }
    if !current_value.is_finite() || current_value < 0.0 {
        return Err("当前值不能为负数".to_string());
    }
    Ok(())
}

/// 单个 KR 完成度（0.0–1.0，封顶不修改原始 current_value）。
fn kr_completion_ratio(current_value: f64, target_value: f64) -> f64 {
    if target_value <= 0.0 {
        return 0.0;
    }
    (current_value / target_value).clamp(0.0, 1.0)
}

/// 按目标读取 KR 列表（sort_order ASC, id ASC）。
pub fn do_get_goal_key_results(
    conn: &rusqlite::Connection,
    goal_id: i64,
) -> Result<Vec<GoalKeyResult>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, goal_id, title, target_value, current_value, unit, sort_order
             FROM goal_key_results
             WHERE goal_id = ?1
             ORDER BY sort_order ASC, id ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![goal_id], row_to_key_result)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

/// 确认目标存在。
fn ensure_goal_exists(conn: &rusqlite::Connection, goal_id: i64) -> Result<(), String> {
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM goals WHERE id = ?1",
            params![goal_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if exists == 0 {
        return Err(format!("目标不存在: {}", goal_id));
    }
    Ok(())
}

/// 计算目标进度：有 KR 时按 KR 平均；无 KR 时按任务完成率。
pub fn do_get_goal_progress(
    conn: &rusqlite::Connection,
    goal_id: i64,
) -> Result<GoalProgress, String> {
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

    let key_results = do_get_goal_key_results(conn, goal_id)?;

    let progress_percent = if !key_results.is_empty() {
        let sum: f64 = key_results
            .iter()
            .map(|kr| kr_completion_ratio(kr.current_value, kr.target_value))
            .sum();
        (sum / key_results.len() as f64) * 100.0
    } else if total_tasks == 0 {
        0.0
    } else {
        (completed_tasks as f64 / total_tasks as f64) * 100.0
    };

    Ok(GoalProgress {
        total_tasks,
        completed_tasks,
        progress_percent,
        key_results,
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

/// 删除目标（goal_tasks / goal_key_results 在同一事务内清理）。
///
/// 显式删除 KR 后再删目标：即便某些连接未启用外键，也不会留下孤儿 KR；
/// 两步放在同一 transaction 中，任一步失败整体回滚，避免“目标还在、KR 已丢”。
#[tauri::command]
pub fn delete_goal(id: i64, state: State<DbState>) -> Result<(), String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    do_delete_goal(&mut conn, id)
}

/// 内部：原子删除目标及其 KR（接收 &mut Connection，便于测试与事务）。
pub fn do_delete_goal(conn: &mut rusqlite::Connection, id: i64) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM goal_key_results WHERE goal_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM goals WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
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

/// 查询目标进度：有 KR 时按 KR 平均进度；无 KR 时按关联任务完成率。
#[tauri::command]
pub fn get_goal_progress(goal_id: i64, state: State<DbState>) -> Result<GoalProgress, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    do_get_goal_progress(&conn, goal_id)
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

/// 查询指定目标的 KR 列表。
#[tauri::command]
pub fn get_goal_key_results(
    goal_id: i64,
    state: State<DbState>,
) -> Result<Vec<GoalKeyResult>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    do_get_goal_key_results(&conn, goal_id)
}

/// 新增 KR，返回新记录 id。
#[tauri::command]
pub fn create_goal_key_result(
    goal_id: i64,
    title: String,
    target_value: f64,
    current_value: f64,
    unit: Option<String>,
    sort_order: Option<i64>,
    state: State<DbState>,
) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    do_create_goal_key_result(
        &conn,
        goal_id,
        title,
        target_value,
        current_value,
        unit,
        sort_order,
    )
}

/// 内部：新增 KR（接收 &Connection，便于测试）。
pub fn do_create_goal_key_result(
    conn: &rusqlite::Connection,
    goal_id: i64,
    title: String,
    target_value: f64,
    current_value: f64,
    unit: Option<String>,
    sort_order: Option<i64>,
) -> Result<i64, String> {
    ensure_goal_exists(conn, goal_id)?;
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err("KR 标题不能为空".to_string());
    }
    validate_kr_values(target_value, current_value)?;

    let order = if let Some(o) = sort_order {
        o
    } else {
        let next: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM goal_key_results WHERE goal_id = ?1",
                params![goal_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        next
    };

    let unit_value = unit
        .map(|u| u.trim().to_string())
        .filter(|u| !u.is_empty());

    conn.execute(
        "INSERT INTO goal_key_results (goal_id, title, target_value, current_value, unit, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            goal_id,
            trimmed,
            target_value,
            current_value,
            unit_value,
            order
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(conn.last_insert_rowid())
}

/// 更新 KR 字段（仅更新非 null 字段）。
#[tauri::command]
pub fn update_goal_key_result(
    id: i64,
    title: Option<String>,
    target_value: Option<f64>,
    current_value: Option<f64>,
    unit: Option<String>,
    sort_order: Option<i64>,
    state: State<DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    do_update_goal_key_result(
        &conn,
        id,
        title,
        target_value,
        current_value,
        unit,
        sort_order,
    )
}

/// 内部：更新 KR。
pub fn do_update_goal_key_result(
    conn: &rusqlite::Connection,
    id: i64,
    title: Option<String>,
    target_value: Option<f64>,
    current_value: Option<f64>,
    unit: Option<String>,
    sort_order: Option<i64>,
) -> Result<(), String> {
    // 读取现有记录，用于合并校验
    let existing: GoalKeyResult = conn
        .query_row(
            "SELECT id, goal_id, title, target_value, current_value, unit, sort_order
             FROM goal_key_results WHERE id = ?1",
            params![id],
            row_to_key_result,
        )
        .map_err(|_| format!("KR 不存在: {}", id))?;

    let new_title = match title {
        Some(ref t) => {
            let trimmed = t.trim();
            if trimmed.is_empty() {
                return Err("KR 标题不能为空".to_string());
            }
            trimmed.to_string()
        }
        None => existing.title.clone(),
    };

    let new_target = target_value.unwrap_or(existing.target_value);
    let new_current = current_value.unwrap_or(existing.current_value);
    validate_kr_values(new_target, new_current)?;

    // unit: Some("") 表示清空；None 表示不修改
    let new_unit: Option<String> = match unit {
        Some(u) => {
            let trimmed = u.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        }
        None => existing.unit.clone(),
    };
    let new_sort = sort_order.unwrap_or(existing.sort_order);

    conn.execute(
        "UPDATE goal_key_results
         SET title = ?1, target_value = ?2, current_value = ?3, unit = ?4, sort_order = ?5
         WHERE id = ?6",
        params![new_title, new_target, new_current, new_unit, new_sort, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// 删除 KR。
#[tauri::command]
pub fn delete_goal_key_result(id: i64, state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    do_delete_goal_key_result(&conn, id)
}

/// 内部：删除 KR。
pub fn do_delete_goal_key_result(conn: &rusqlite::Connection, id: i64) -> Result<(), String> {
    let affected = conn
        .execute("DELETE FROM goal_key_results WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    if affected == 0 {
        return Err(format!("KR 不存在: {}", id));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_schema;
    use rusqlite::params;

    fn setup_db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        conn
    }

    fn insert_goal(conn: &rusqlite::Connection, title: &str) -> i64 {
        let now = "2026-01-01T00:00:00";
        conn.execute(
            "INSERT INTO goals (title, description, type, period_start, period_end, status, color, created_at, updated_at)
             VALUES (?1, NULL, 'quarterly', '2026-01-01', '2026-03-31', 'active', NULL, ?2, ?3)",
            params![title, now, now],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn insert_task(conn: &rusqlite::Connection, title: &str, completed: bool) -> i64 {
        let now = "2026-01-01T00:00:00";
        conn.execute(
            "INSERT INTO tasks (title, completed, list_id, created_at, updated_at)
             VALUES (?1, ?2, 1, ?3, ?4)",
            params![title, completed as i64, now, now],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    #[test]
    fn test_kr_crud_and_sorting() {
        let conn = setup_db();
        let goal_id = insert_goal(&conn, "阅读目标");

        let kr1 = do_create_goal_key_result(
            &conn,
            goal_id,
            "读完 12 本书".into(),
            12.0,
            3.0,
            Some("本".into()),
            Some(10),
        )
        .unwrap();
        let kr2 = do_create_goal_key_result(
            &conn,
            goal_id,
            "写 6 篇笔记".into(),
            6.0,
            6.0,
            Some("篇".into()),
            Some(5),
        )
        .unwrap();

        let list = do_get_goal_key_results(&conn, goal_id).unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, kr2, "应按 sort_order 升序");
        assert_eq!(list[1].id, kr1);
        assert_eq!(list[0].title, "写 6 篇笔记");
        assert_eq!(list[1].unit.as_deref(), Some("本"));

        do_update_goal_key_result(
            &conn,
            kr1,
            Some("读完 15 本书".into()),
            Some(15.0),
            Some(7.5),
            Some("册".into()),
            Some(0),
        )
        .unwrap();

        let updated = do_get_goal_key_results(&conn, goal_id).unwrap();
        assert_eq!(updated[0].id, kr1);
        assert_eq!(updated[0].title, "读完 15 本书");
        assert_eq!(updated[0].target_value, 15.0);
        assert_eq!(updated[0].current_value, 7.5);
        assert_eq!(updated[0].unit.as_deref(), Some("册"));

        do_delete_goal_key_result(&conn, kr2).unwrap();
        let after_delete = do_get_goal_key_results(&conn, goal_id).unwrap();
        assert_eq!(after_delete.len(), 1);
        assert_eq!(after_delete[0].id, kr1);
    }

    #[test]
    fn test_kr_rejects_invalid_values() {
        let conn = setup_db();
        let goal_id = insert_goal(&conn, "营收目标");

        let err = do_create_goal_key_result(
            &conn,
            goal_id,
            "营收".into(),
            0.0,
            1.0,
            None,
            None,
        )
        .unwrap_err();
        assert!(err.contains("目标值必须大于 0"));

        let err = do_create_goal_key_result(
            &conn,
            goal_id,
            "营收".into(),
            100.0,
            -1.0,
            None,
            None,
        )
        .unwrap_err();
        assert!(err.contains("当前值不能为负数"));

        let err = do_create_goal_key_result(
            &conn,
            99999,
            "孤儿".into(),
            10.0,
            1.0,
            None,
            None,
        )
        .unwrap_err();
        assert!(err.contains("目标不存在"));

        let kr_id = do_create_goal_key_result(
            &conn,
            goal_id,
            "营收".into(),
            100.0,
            10.0,
            None,
            None,
        )
        .unwrap();

        let err = do_update_goal_key_result(
            &conn,
            kr_id,
            None,
            Some(-5.0),
            None,
            None,
            None,
        )
        .unwrap_err();
        assert!(err.contains("目标值必须大于 0"));

        let err = do_update_goal_key_result(
            &conn,
            kr_id,
            None,
            None,
            Some(-0.1),
            None,
            None,
        )
        .unwrap_err();
        assert!(err.contains("当前值不能为负数"));
    }

    #[test]
    fn test_progress_average_of_krs_is_75_percent() {
        let conn = setup_db();
        let goal_id = insert_goal(&conn, "双 KR 目标");

        // 50% + 100% => 75%
        do_create_goal_key_result(&conn, goal_id, "A".into(), 100.0, 50.0, None, None).unwrap();
        do_create_goal_key_result(&conn, goal_id, "B".into(), 10.0, 10.0, None, None).unwrap();

        // 关联任务全未完成，确保不会误用任务进度
        let task_id = insert_task(&conn, "无关任务", false);
        conn.execute(
            "INSERT INTO goal_tasks (goal_id, task_id) VALUES (?1, ?2)",
            params![goal_id, task_id],
        )
        .unwrap();

        let progress = do_get_goal_progress(&conn, goal_id).unwrap();
        assert_eq!(progress.key_results.len(), 2);
        assert!((progress.progress_percent - 75.0).abs() < 1e-9);
        assert_eq!(progress.total_tasks, 1);
        assert_eq!(progress.completed_tasks, 0);
    }

    #[test]
    fn test_progress_without_kr_uses_task_completion() {
        let conn = setup_db();
        let goal_id = insert_goal(&conn, "仅任务目标");
        let t1 = insert_task(&conn, "任务1", true);
        let t2 = insert_task(&conn, "任务2", false);
        conn.execute(
            "INSERT INTO goal_tasks (goal_id, task_id) VALUES (?1, ?2), (?1, ?3)",
            params![goal_id, t1, t2],
        )
        .unwrap();

        let progress = do_get_goal_progress(&conn, goal_id).unwrap();
        assert!(progress.key_results.is_empty());
        assert_eq!(progress.total_tasks, 2);
        assert_eq!(progress.completed_tasks, 1);
        assert!((progress.progress_percent - 50.0).abs() < 1e-9);
    }

    #[test]
    fn test_progress_caps_overcomplete_kr_without_mutating_value() {
        let conn = setup_db();
        let goal_id = insert_goal(&conn, "超额目标");
        let kr_id = do_create_goal_key_result(
            &conn,
            goal_id,
            "超额".into(),
            10.0,
            15.0,
            Some("次".into()),
            None,
        )
        .unwrap();

        let progress = do_get_goal_progress(&conn, goal_id).unwrap();
        assert!((progress.progress_percent - 100.0).abs() < 1e-9);
        assert_eq!(progress.key_results[0].current_value, 15.0);
        assert_eq!(progress.key_results[0].id, kr_id);
    }

    #[test]
    fn test_delete_goal_cleans_key_results() {
        let mut conn = setup_db();
        let goal_id = insert_goal(&conn, "待删目标");
        do_create_goal_key_result(&conn, goal_id, "KR1".into(), 1.0, 0.0, None, None).unwrap();
        do_create_goal_key_result(&conn, goal_id, "KR2".into(), 2.0, 1.0, None, None).unwrap();

        // 走生产删除路径，而非手写两条 SQL
        do_delete_goal(&mut conn, goal_id).unwrap();

        let remaining_kr: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM goal_key_results WHERE goal_id = ?1",
                params![goal_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(remaining_kr, 0);

        let remaining_goal: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM goals WHERE id = ?1",
                params![goal_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(remaining_goal, 0);
    }

    #[test]
    fn test_delete_goal_transaction_rolls_back_on_failure() {
        let mut conn = setup_db();
        let goal_id = insert_goal(&conn, "事务回滚目标");
        do_create_goal_key_result(&conn, goal_id, "KR1".into(), 1.0, 0.0, None, None).unwrap();
        do_create_goal_key_result(&conn, goal_id, "KR2".into(), 2.0, 1.0, None, None).unwrap();

        // 在事务中先删 KR，再强制失败：应整体回滚，目标和 KR 均保留
        {
            let tx = conn.transaction().unwrap();
            tx.execute(
                "DELETE FROM goal_key_results WHERE goal_id = ?1",
                params![goal_id],
            )
            .unwrap();
            let mid_kr: i64 = tx
                .query_row(
                    "SELECT COUNT(*) FROM goal_key_results WHERE goal_id = ?1",
                    params![goal_id],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(mid_kr, 0, "事务未提交前 KR 应已删除");
            // 不 commit，主动回滚
            tx.rollback().unwrap();
        }

        let remaining_kr: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM goal_key_results WHERE goal_id = ?1",
                params![goal_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(remaining_kr, 2, "回滚后 KR 必须恢复");

        let remaining_goal: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM goals WHERE id = ?1",
                params![goal_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(remaining_goal, 1, "回滚后目标必须仍在");

        // 成功路径仍可正常原子删除
        do_delete_goal(&mut conn, goal_id).unwrap();
        let after: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM goal_key_results WHERE goal_id = ?1",
                params![goal_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(after, 0);
    }

    #[test]
    fn test_update_kr_unit_empty_string_clears_and_none_keeps() {
        let conn = setup_db();
        let goal_id = insert_goal(&conn, "单位契约");
        let kr_id = do_create_goal_key_result(
            &conn,
            goal_id,
            "阅读".into(),
            12.0,
            1.0,
            Some("本".into()),
            None,
        )
        .unwrap();

        // None = 不修改单位
        do_update_goal_key_result(&conn, kr_id, None, None, Some(2.0), None, None).unwrap();
        let after_none = do_get_goal_key_results(&conn, goal_id).unwrap();
        assert_eq!(after_none[0].current_value, 2.0);
        assert_eq!(after_none[0].unit.as_deref(), Some("本"));

        // Some("") = 清空单位
        do_update_goal_key_result(
            &conn,
            kr_id,
            None,
            None,
            None,
            Some("".into()),
            None,
        )
        .unwrap();
        let after_clear = do_get_goal_key_results(&conn, goal_id).unwrap();
        assert!(after_clear[0].unit.is_none());
    }

    #[test]
    fn test_kr_completion_ratio_helpers() {
        assert!((kr_completion_ratio(50.0, 100.0) - 0.5).abs() < 1e-9);
        assert!((kr_completion_ratio(150.0, 100.0) - 1.0).abs() < 1e-9);
        assert!((kr_completion_ratio(-5.0, 100.0) - 0.0).abs() < 1e-9);
        assert!((kr_completion_ratio(10.0, 0.0) - 0.0).abs() < 1e-9);
    }
}
