use rusqlite::Result;
use serde::{Deserialize, Deserializer};
use tauri::State;

use super::super::now_rfc3339;
use crate::db::DbState;

fn deserialize_optional_patch_field<'de, D, T>(
    deserializer: D,
) -> std::result::Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

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
    #[serde(default, deserialize_with = "deserialize_optional_patch_field")]
    pub notes: Option<Option<String>>,
    pub priority: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_optional_patch_field")]
    pub due_date: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_optional_patch_field")]
    pub end_date: Option<Option<String>>,
    pub all_day: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_optional_patch_field")]
    pub reminder: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_optional_patch_field")]
    pub reminder_minutes: Option<Option<i64>>,
    pub completed: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_optional_patch_field")]
    pub completed_at: Option<Option<String>>,
    pub status: Option<String>,
    pub archived: Option<bool>,
    pub pinned: Option<bool>,
    pub list_id: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_optional_patch_field")]
    pub parent_id: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_optional_patch_field")]
    pub repeat_rule: Option<Option<String>>,
    pub sort_order: Option<f64>,
}

/// 核心更新逻辑，接受 &Connection 以便在批量执行事务中复用。
pub fn do_update_task(
    conn: &rusqlite::Connection,
    id: i64,
    updates: &UpdateTaskRequest,
) -> Result<(), String> {
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
    if let Some(ref reminder_minutes) = updates.reminder_minutes {
        set_clauses.push("reminder_minutes = ?".to_string());
        params_vec.push(Box::new(*reminder_minutes));
    }
    if let Some(completed) = updates.completed {
        set_clauses.push("completed = ?".to_string());
        params_vec.push(Box::new(completed));

        if updates.completed_at.is_none() {
            set_clauses.push("completed_at = ?".to_string());
            params_vec.push(Box::new(if completed { Some(now.clone()) } else { None }));
        }
        if updates.status.is_none() {
            set_clauses.push("status = ?".to_string());
            params_vec.push(Box::new(if completed { "done" } else { "todo" }));
        }
    }
    if let Some(ref completed_at) = updates.completed_at {
        set_clauses.push("completed_at = ?".to_string());
        params_vec.push(Box::new(completed_at.clone()));
    }
    if let Some(ref status) = updates.status {
        if !matches!(status.as_str(), "todo" | "in_progress" | "done") {
            return Err("invalid task status".to_string());
        }
        if updates.completed.is_none() {
            match status.as_str() {
                "done" => {
                    set_clauses.push("completed = ?".to_string());
                    params_vec.push(Box::new(true));
                    if updates.completed_at.is_none() {
                        set_clauses.push("completed_at = ?".to_string());
                        params_vec.push(Box::new(Some(now.clone())));
                    }
                }
                "todo" | "in_progress" => {
                    set_clauses.push("completed = ?".to_string());
                    params_vec.push(Box::new(false));
                    if updates.completed_at.is_none() {
                        set_clauses.push("completed_at = ?".to_string());
                        params_vec.push(Box::new(None::<String>));
                    }
                }
                _ => {}
            }
        }
        set_clauses.push("status = ?".to_string());
        params_vec.push(Box::new(status.clone()));
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
        if let Some(pid) = *parent_id {
            if pid == id {
                return Err("任务不能成为自己的子任务".to_string());
            }
            let parent_parent_id: Option<i64> = conn
                .query_row(
                    "SELECT parent_id FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
                    rusqlite::params![pid],
                    |row| row.get(0),
                )
                .map_err(|e| {
                    format!("更新任务失败：父任务 #{} 不存在或已移入回收站: {}", pid, e)
                })?;
            if parent_parent_id.is_some() {
                return Err("更新任务失败：当前仅支持一层子任务".to_string());
            }
        }
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

    // 没有任何字段需要更新时，直接返回
    if set_clauses.is_empty() {
        return Ok(());
    }

    set_clauses.push("updated_at = ?".to_string());
    params_vec.push(Box::new(now));

    let sql = format!(
        "UPDATE tasks SET {} WHERE id = ? AND deleted_at IS NULL",
        set_clauses.join(", ")
    );
    params_vec.push(Box::new(id));

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    let affected = conn
        .execute(&sql, params_refs.as_slice())
        .map_err(|e| e.to_string())?;
    if affected == 0 {
        return Err(format!("任务不存在或已移入回收站（#{}）", id));
    }

    Ok(())
}

#[tauri::command]
pub fn update_task(
    state: State<DbState>,
    id: i64,
    updates: UpdateTaskRequest,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    do_update_task(&conn, id, &updates)
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
    fn test_patch_request_distinguishes_missing_null_and_value() {
        let missing: super::UpdateTaskRequest = serde_json::from_str("{}").unwrap();
        assert!(missing.reminder_minutes.is_none());
        assert!(missing.completed_at.is_none());

        let clear: super::UpdateTaskRequest =
            serde_json::from_str(r#"{"reminder_minutes":null,"completed_at":null}"#).unwrap();
        assert_eq!(clear.reminder_minutes, Some(None));
        assert_eq!(clear.completed_at, Some(None));

        let set: super::UpdateTaskRequest =
            serde_json::from_str(r#"{"reminder_minutes":15,"completed_at":"2026-07-07T00:00:00"}"#)
                .unwrap();
        assert_eq!(set.reminder_minutes, Some(Some(15)));
        assert_eq!(
            set.completed_at,
            Some(Some("2026-07-07T00:00:00".to_string()))
        );
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
    fn test_update_completion_semantics() {
        let conn = setup_with_task();
        let task_id = conn.last_insert_rowid();
        let completed_at = "2026-07-07T00:00:00";

        conn.execute(
            "UPDATE tasks SET completed = 1, completed_at = ?1, status = 'done', updated_at = ?1 WHERE id = ?2",
            params![completed_at, task_id],
        )
        .unwrap();

        let (completed, stored_completed_at, status): (i64, Option<String>, String) = conn
            .query_row(
                "SELECT completed, completed_at, status FROM tasks WHERE id = ?1",
                params![task_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(completed, 1);
        assert_eq!(stored_completed_at.as_deref(), Some(completed_at));
        assert_eq!(status, "done");

        conn.execute(
            "UPDATE tasks SET completed = 0, completed_at = NULL, status = 'todo', updated_at = ?1 WHERE id = ?2",
            params!["2026-07-08T00:00:00", task_id],
        )
        .unwrap();

        let (completed, stored_completed_at, status): (i64, Option<String>, String) = conn
            .query_row(
                "SELECT completed, completed_at, status FROM tasks WHERE id = ?1",
                params![task_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(completed, 0);
        assert_eq!(stored_completed_at, None);
        assert_eq!(status, "todo");
    }

    #[test]
    fn test_clear_reminder_minutes_to_null() {
        let conn = setup_with_task();
        let task_id = conn.last_insert_rowid();

        conn.execute(
            "UPDATE tasks SET reminder_minutes = ?1 WHERE id = ?2",
            params![15, task_id],
        )
        .unwrap();
        conn.execute(
            "UPDATE tasks SET reminder_minutes = NULL WHERE id = ?1",
            params![task_id],
        )
        .unwrap();

        let reminder_minutes: Option<i64> = conn
            .query_row(
                "SELECT reminder_minutes FROM tasks WHERE id = ?1",
                params![task_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(reminder_minutes, None);
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

    #[test]
    fn test_update_nonexistent_task_returns_error() {
        let conn = setup_with_task();
        let updates = super::UpdateTaskRequest {
            title: Some("不存在".to_string()),
            notes: None,
            priority: None,
            due_date: None,
            end_date: None,
            all_day: None,
            reminder: None,
            reminder_minutes: None,
            completed: None,
            completed_at: None,
            status: None,
            archived: None,
            pinned: None,
            list_id: None,
            parent_id: None,
            repeat_rule: None,
            sort_order: None,
        };

        let result = super::do_update_task(&conn, 999999, &updates);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("不存在"));
    }

    #[test]
    fn test_update_parent_rejects_nested_subtask() {
        let conn = setup_with_task();
        let parent_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO tasks (title, list_id, parent_id, created_at, updated_at) VALUES (?1, 1, ?2, ?3, ?3)",
            params!["子任务", parent_id, "2026-01-01T00:00:00"],
        )
        .unwrap();
        let subtask_id = conn.last_insert_rowid();
        let moving_task_id = super::super::task_create::do_create_task(
            &conn,
            &super::super::task_create::CreateTaskRequest {
                title: "待移动任务".to_string(),
                notes: None,
                priority: None,
                due_date: None,
                end_date: None,
                all_day: false,
                reminder: None,
                reminder_minutes: None,
                list_id: 1,
                parent_id: None,
                repeat_rule: None,
            },
        )
        .unwrap()
        .id;

        let updates = super::UpdateTaskRequest {
            title: None,
            notes: None,
            priority: None,
            due_date: None,
            end_date: None,
            all_day: None,
            reminder: None,
            reminder_minutes: None,
            completed: None,
            completed_at: None,
            status: None,
            archived: None,
            pinned: None,
            list_id: None,
            parent_id: Some(Some(subtask_id)),
            repeat_rule: None,
            sort_order: None,
        };

        let result = super::do_update_task(&conn, moving_task_id, &updates);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("一层子任务"));
    }

    #[test]
    fn test_update_deleted_task_is_rejected() {
        let conn = setup_with_task();
        let task_id = conn.last_insert_rowid();
        conn.execute(
            "UPDATE tasks SET deleted_at = ?1 WHERE id = ?2",
            params!["2026-07-01T00:00:00Z", task_id],
        )
        .unwrap();

        let updates = super::UpdateTaskRequest {
            title: Some("不该成功".to_string()),
            notes: None,
            priority: None,
            due_date: None,
            end_date: None,
            all_day: None,
            reminder: None,
            reminder_minutes: None,
            completed: None,
            completed_at: None,
            status: None,
            archived: None,
            pinned: None,
            list_id: None,
            parent_id: None,
            repeat_rule: None,
            sort_order: None,
        };

        let err = super::do_update_task(&conn, task_id, &updates).unwrap_err();
        assert!(err.contains("不存在或已移入回收站"));

        let title: String = conn
            .query_row(
                "SELECT title FROM tasks WHERE id = ?1",
                params![task_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(title, "测试任务");
    }

    #[test]
    fn test_update_parent_rejects_deleted_parent() {
        let conn = setup_with_task();
        let parent_id = conn.last_insert_rowid();
        conn.execute(
            "UPDATE tasks SET deleted_at = ?1 WHERE id = ?2",
            params!["2026-07-01T00:00:00Z", parent_id],
        )
        .unwrap();
        let moving = super::super::task_create::do_create_task(
            &conn,
            &super::super::task_create::CreateTaskRequest {
                title: "待挂载".to_string(),
                notes: None,
                priority: None,
                due_date: None,
                end_date: None,
                all_day: false,
                reminder: None,
                reminder_minutes: None,
                list_id: 1,
                parent_id: None,
                repeat_rule: None,
            },
        )
        .unwrap()
        .id;

        let updates = super::UpdateTaskRequest {
            title: None,
            notes: None,
            priority: None,
            due_date: None,
            end_date: None,
            all_day: None,
            reminder: None,
            reminder_minutes: None,
            completed: None,
            completed_at: None,
            status: None,
            archived: None,
            pinned: None,
            list_id: None,
            parent_id: Some(Some(parent_id)),
            repeat_rule: None,
            sort_order: None,
        };
        let err = super::do_update_task(&conn, moving, &updates).unwrap_err();
        assert!(
            err.contains("不存在或已移入回收站") || err.contains("父任务"),
            "err={err}"
        );
    }
}
