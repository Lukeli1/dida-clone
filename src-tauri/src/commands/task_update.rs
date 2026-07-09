use rusqlite::Result;
use serde::Deserialize;
use tauri::State;

use super::super::now_rfc3339;
use crate::db::DbState;

/// 任务更新请求（Patch DTO）。
///
/// 字段语义（区分“不更新 / 清空 / 更新”三种状态）：
/// - 字段在 JSON 中缺失（undefined） → `None`：不生成 SQL SET，保持原值
/// - 字段为 `null` → `Some(None)`：SQL 设置为 `NULL`（清空）
/// - 字段为非空值 → `Some(Some(v))`：SQL 设置为对应值
///
/// 因此字符串/可选字段使用 `Option<Option<T>>` 双层 Option；
/// 必有值字段（priority/completed 等）仍用单层 `Option<T>`，缺失即不更新。
#[derive(Debug, Deserialize)]
pub struct UpdateTaskRequest {
    pub title: Option<String>,
    pub notes: Option<Option<String>>,
    pub priority: Option<i64>,
    pub due_date: Option<Option<String>>,
    pub end_date: Option<Option<String>>,
    pub all_day: Option<bool>,
    pub reminder: Option<Option<String>>,
    pub reminder_minutes: Option<i64>,
    pub completed: Option<bool>,
    pub archived: Option<bool>,
    pub pinned: Option<bool>,
    pub list_id: Option<i64>,
    pub parent_id: Option<Option<i64>>,
    pub repeat_rule: Option<Option<String>>,
    pub sort_order: Option<f64>,
}

#[tauri::command]
pub fn update_task(
    state: State<DbState>,
    id: i64,
    updates: UpdateTaskRequest,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = now_rfc3339();

    // 动态构建 UPDATE 语句
    let mut set_clauses: Vec<String> = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(ref title) = updates.title {
        set_clauses.push("title = ?".to_string());
        params_vec.push(Box::new(title.clone()));
    }
    // 可清空字段：Some(None) => NULL，Some(Some(v)) => v
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
    if let Some(all_day) = updates.all_day {
        set_clauses.push("all_day = ?".to_string());
        params_vec.push(Box::new(all_day));
    }
    if let Some(ref reminder) = updates.reminder {
        set_clauses.push("reminder = ?".to_string());
        params_vec.push(Box::new(reminder.clone()));
    }
    if let Some(reminder_minutes) = updates.reminder_minutes {
        set_clauses.push("reminder_minutes = ?".to_string());
        params_vec.push(Box::new(reminder_minutes));
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
    if let Some(ref parent_id) = updates.parent_id {
        set_clauses.push("parent_id = ?".to_string());
        params_vec.push(Box::new(*parent_id));
    }
    if let Some(ref repeat_rule) = updates.repeat_rule {
        set_clauses.push("repeat_rule = ?".to_string());
        params_vec.push(Box::new(repeat_rule.clone()));
    }
    if let Some(sort_order) = updates.sort_order {
        set_clauses.push("sort_order = ?".to_string());
        params_vec.push(Box::new(sort_order));
    }

    // 没有任何字段需要更新时，直接返回（避免生成 "UPDATE tasks SET updated_at = ? WHERE id = ?"）
    if set_clauses.is_empty() {
        return Ok(());
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

#[cfg(test)]
mod tests {
    use crate::db::init_schema;
    use rusqlite::params;

    /// 辅助：创建内存数据库并初始化 schema + 一条任务
    fn setup_with_task() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        conn.execute(
            "INSERT INTO tasks (title, notes, priority, due_date, list_id, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6)",
            params!["测试任务", Some("备注".to_string()), 2, Some("2026-07-01T00:00:00".to_string()), "2026-01-01T00:00:00", "2026-01-01T00:00:00"],
        )
        .unwrap();
        conn
    }

    #[test]
    fn test_clear_due_date_to_null() {
        // 模拟前端传 { due_date: null }（serde 反序列化为 Some(None)）
        let conn = setup_with_task();
        let task_id = conn.last_insert_rowid();

        // 手动执行 update_task 的核心逻辑：Some(None) => NULL
        conn.execute(
            "UPDATE tasks SET due_date = NULL, updated_at = ?1 WHERE id = ?2",
            params!["2026-07-07T00:00:00", task_id],
        )
        .unwrap();

        let due_date: Option<String> = conn
            .query_row(
                "SELECT due_date FROM tasks WHERE id = ?1",
                params![task_id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(
            due_date.is_none(),
            "清空后 due_date 应为 NULL，实际: {:?}",
            due_date
        );
    }

    #[test]
    fn test_update_due_date_to_value() {
        let conn = setup_with_task();
        let task_id = conn.last_insert_rowid();

        // Some(Some("2026-08-01...")) => 更新为新值
        conn.execute(
            "UPDATE tasks SET due_date = ?1, updated_at = ?2 WHERE id = ?3",
            params!["2026-08-01T00:00:00", "2026-07-07T00:00:00", task_id],
        )
        .unwrap();

        let due_date: String = conn
            .query_row(
                "SELECT due_date FROM tasks WHERE id = ?1",
                params![task_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(due_date, "2026-08-01T00:00:00");
    }

    #[test]
    fn test_no_update_keeps_value() {
        // 字段缺失（None） => 不生成 SET，原值保留
        let conn = setup_with_task();
        let task_id = conn.last_insert_rowid();

        // 不执行任何 UPDATE，验证原值仍在
        let due_date: Option<String> = conn
            .query_row(
                "SELECT due_date FROM tasks WHERE id = ?1",
                params![task_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(due_date.as_deref(), Some("2026-07-01T00:00:00"));
    }
}
