//! AI 批量动作执行命令
//!
//! 在单个数据库事务中执行多个 AI 动作提案，保证原子性：
//! 任一动作失败则全部回滚，不会留下半完成状态。
//!
//! 支持的动作类型与现有 AI ActionOp 完全对齐：
//! - create_task
//! - update_task
//! - delete_task
//! - complete_task
//! - create_subtask

use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use tauri::State;

use super::{do_complete_task, do_create_task, do_update_task, CreateTaskRequest, UpdateTaskRequest};
use crate::db::DbState;

/// AI 批量动作（与前端 ActionOp 对齐，通过 serde tag/content 映射）
#[derive(Debug, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum AiBatchAction {
    #[serde(rename = "create_task")]
    CreateTask(CreateTaskData),
    #[serde(rename = "update_task")]
    UpdateTask(UpdateTaskData),
    #[serde(rename = "delete_task")]
    DeleteTask(DeleteTaskData),
    #[serde(rename = "complete_task")]
    CompleteTask(CompleteTaskData),
    #[serde(rename = "create_subtask")]
    CreateSubtask(CreateSubtaskData),
}

#[derive(Debug, Deserialize)]
pub struct CreateTaskData {
    pub title: String,
    pub due_date: Option<String>,
    pub priority: Option<i64>,
    pub notes: Option<String>,
    pub list_id: i64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTaskData {
    pub task_id: i64,
    pub updates: UpdateTaskRequest,
}

#[derive(Debug, Deserialize)]
pub struct DeleteTaskData {
    pub task_id: i64,
}

#[derive(Debug, Deserialize)]
pub struct CompleteTaskData {
    pub task_id: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateSubtaskData {
    pub parent_id: i64,
    pub title: String,
    pub priority: Option<i64>,
    pub list_id: i64,
}

/// 单个动作的执行结果
#[derive(Debug, Serialize)]
pub struct AiActionResult {
    /// 对应 actions 数组中的索引
    pub index: usize,
    /// 动作类型字符串（与输入一致）
    pub action_type: String,
    /// create_task / create_subtask 返回新创建的任务 ID；
    /// complete_task 在完成重复任务时返回下一周期任务 ID；其余为 None
    pub created_task_id: Option<i64>,
}

/// 批量执行结果
#[derive(Debug, Serialize)]
pub struct AiBatchResult {
    pub success: bool,
    pub results: Vec<AiActionResult>,
    pub error: Option<String>,
}

fn validate_batch_actions(actions: &[AiBatchAction]) -> Result<(), String> {
    let mut touched_existing_tasks: HashSet<i64> = HashSet::new();

    for action in actions {
        match action {
            AiBatchAction::DeleteTask(_) => {
                return Err("AI 删除任务暂不可用：当前删除无法无损恢复附件、时间记录和目标关联，请手动删除".to_string());
            }
            AiBatchAction::UpdateTask(data) => {
                if data.updates.completed.is_some()
                    || data.updates.completed_at.is_some()
                    || data.updates.status.is_some()
                {
                    return Err("AI update_task 不允许修改完成状态字段，请使用 complete_task".to_string());
                }
                if !touched_existing_tasks.insert(data.task_id) {
                    return Err(format!("批量执行失败：任务 #{} 在同一批 AI 操作中被重复修改", data.task_id));
                }
            }
            AiBatchAction::CompleteTask(data) => {
                if !touched_existing_tasks.insert(data.task_id) {
                    return Err(format!("批量执行失败：任务 #{} 在同一批 AI 操作中被重复修改", data.task_id));
                }
            }
            AiBatchAction::CreateTask(_) | AiBatchAction::CreateSubtask(_) => {}
        }
    }

    Ok(())
}

/// 核心批量执行逻辑，接受 &mut Connection 以便单元测试直接调用。
///
/// - 全部通过则提交，任一失败则回滚。
/// - 返回每个动作的执行结果（含新创建任务的 ID）。
pub fn do_execute_ai_batch(
    conn: &mut rusqlite::Connection,
    actions: &[AiBatchAction],
) -> Result<AiBatchResult, String> {
    validate_batch_actions(actions)?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let mut results: Vec<AiActionResult> = Vec::with_capacity(actions.len());

    for (i, action) in actions.iter().enumerate() {
        let result = match action {
            AiBatchAction::CreateTask(data) => {
                let req = CreateTaskRequest {
                    title: data.title.clone(),
                    notes: data.notes.clone(),
                    priority: data.priority,
                    due_date: data.due_date.clone(),
                    end_date: None,
                    all_day: false,
                    reminder: None,
                    reminder_minutes: None,
                    list_id: data.list_id,
                    parent_id: None,
                    repeat_rule: None,
                };
                let task = do_create_task(&tx, &req)?;
                AiActionResult {
                    index: i,
                    action_type: "create_task".to_string(),
                    created_task_id: Some(task.id),
                }
            }
            AiBatchAction::UpdateTask(data) => {
                // 校验目标任务存在，不存在则报错回滚
                let exists: i64 = tx
                    .query_row("SELECT COUNT(*) FROM tasks WHERE id = ?1", rusqlite::params![data.task_id], |row| row.get(0))
                    .map_err(|e| e.to_string())?;
                if exists == 0 {
                    return Err(format!("批量执行失败：update_task 的目标任务 #{} 不存在，已回滚", data.task_id));
                }
                do_update_task(&tx, data.task_id, &data.updates)?;
                AiActionResult {
                    index: i,
                    action_type: "update_task".to_string(),
                    created_task_id: None,
                }
            }
            AiBatchAction::DeleteTask(_) => {
                return Err("AI 删除任务暂不可用：当前删除无法无损恢复附件、时间记录和目标关联，请手动删除".to_string());
            }
            AiBatchAction::CompleteTask(data) => {
                // do_complete_task 内部会检查任务存在性并处理重复任务
                let complete_result = do_complete_task(&tx, data.task_id)?;
                AiActionResult {
                    index: i,
                    action_type: "complete_task".to_string(),
                    created_task_id: complete_result.new_task_id,
                }
            }
            AiBatchAction::CreateSubtask(data) => {
                let parent_parent_id: Option<i64> = tx
                    .query_row(
                        "SELECT parent_id FROM tasks WHERE id = ?1",
                        rusqlite::params![data.parent_id],
                        |row| row.get(0),
                    )
                    .map_err(|e| format!("批量执行失败：create_subtask 的父任务 #{} 不存在或查询出错: {}", data.parent_id, e))?;
                if parent_parent_id.is_some() {
                    return Err("批量执行失败：当前仅支持一层子任务".to_string());
                }

                let req = CreateTaskRequest {
                    title: data.title.clone(),
                    notes: None,
                    priority: data.priority,
                    due_date: None,
                    end_date: None,
                    all_day: false,
                    reminder: None,
                    reminder_minutes: None,
                    list_id: data.list_id,
                    parent_id: Some(data.parent_id),
                    repeat_rule: None,
                };
                let task = do_create_task(&tx, &req)?;
                AiActionResult {
                    index: i,
                    action_type: "create_subtask".to_string(),
                    created_task_id: Some(task.id),
                }
            }
        };
        results.push(result);
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(AiBatchResult {
        success: true,
        results,
        error: None,
    })
}

/// Tauri 命令入口：在单个事务中执行 AI 批量动作。
#[tauri::command]
pub fn execute_ai_batch(
    state: State<DbState>,
    actions: Vec<AiBatchAction>,
) -> Result<AiBatchResult, String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    do_execute_ai_batch(&mut conn, &actions)
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

    fn insert_task(conn: &rusqlite::Connection, title: &str) -> i64 {
        conn.execute(
            "INSERT INTO tasks (title, list_id, created_at, updated_at) VALUES (?1, 1, ?2, ?3)",
            params![title, "2026-01-01T00:00:00", "2026-01-01T00:00:00"],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    #[test]
    fn test_batch_create_task() {
        let mut conn = setup_db();
        let actions = vec![AiBatchAction::CreateTask(CreateTaskData {
            title: "批量创建的任务".to_string(),
            due_date: None,
            priority: Some(1),
            notes: None,
            list_id: 1,
        })];

        let result = do_execute_ai_batch(&mut conn, &actions).unwrap();
        assert!(result.success);
        assert_eq!(result.results.len(), 1);
        assert!(result.results[0].created_task_id.is_some());

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM tasks WHERE title = '批量创建的任务'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_batch_delete_action_is_rejected() {
        // AI 删除无法无损撤销，应在进入事务前拒绝
        let mut conn = setup_db();
        let task_id = insert_task(&conn, "已有任务");

        let actions = vec![
            AiBatchAction::CreateTask(CreateTaskData {
                title: "新任务".to_string(),
                due_date: None,
                priority: None,
                notes: None,
                list_id: 1,
            }),
            AiBatchAction::DeleteTask(DeleteTaskData { task_id }),
        ];

        let result = do_execute_ai_batch(&mut conn, &actions);
        assert!(result.is_err(), "AI delete_task 应被拒绝");
        assert!(result.unwrap_err().contains("AI 删除任务暂不可用"));

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM tasks WHERE title = '新任务'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 0, "拒绝后不应创建新任务");

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM tasks WHERE id = ?1", params![task_id], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 1, "拒绝后原任务不应删除");
    }

    #[test]
    fn test_batch_complete_task() {
        let mut conn = setup_db();
        let task_id = insert_task(&conn, "待完成的任务");

        let actions = vec![AiBatchAction::CompleteTask(CompleteTaskData { task_id })];

        let result = do_execute_ai_batch(&mut conn, &actions).unwrap();
        assert!(result.success);

        let (completed, status): (i64, String) = conn
            .query_row(
                "SELECT completed, status FROM tasks WHERE id = ?1",
                params![task_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(completed, 1);
        assert_eq!(status, "done");
    }

    #[test]
    fn test_batch_complete_recurring_task_creates_next() {
        // 验证：AI 完成重复任务时，会正确创建下一周期任务
        let mut conn = setup_db();
        let now = "2026-07-01T00:00:00+08:00";
        conn.execute(
            "INSERT INTO tasks (title, due_date, reminder_minutes, repeat_rule, list_id, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)",
            params!["每日任务", "2026-07-01T09:00:00+08:00", 15, "daily", now],
        )
        .unwrap();
        let task_id = conn.last_insert_rowid();

        let actions = vec![AiBatchAction::CompleteTask(CompleteTaskData { task_id })];
        let result = do_execute_ai_batch(&mut conn, &actions).unwrap();
        assert!(result.success);

        // 原任务标记为已完成
        let (completed, status): (i64, String) = conn
            .query_row(
                "SELECT completed, status FROM tasks WHERE id = ?1",
                params![task_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(completed, 1);
        assert_eq!(status, "done");

        // 应创建了下一周期任务
        let (title, due_date, completed, repeat_rule): (String, Option<String>, i64, Option<String>) = conn
            .query_row(
                "SELECT title, due_date, completed, repeat_rule FROM tasks WHERE parent_id IS NULL AND completed = 0 AND title = '每日任务'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(title, "每日任务");
        assert_eq!(completed, 0);
        assert!(due_date.is_some());
        assert!(repeat_rule.is_some());
    }

    #[test]
    fn test_batch_duplicate_complete_same_task_is_rejected() {
        let mut conn = setup_db();
        let task_id = insert_task(&conn, "重复完成任务");

        let actions = vec![
            AiBatchAction::CompleteTask(CompleteTaskData { task_id }),
            AiBatchAction::CompleteTask(CompleteTaskData { task_id }),
        ];

        let result = do_execute_ai_batch(&mut conn, &actions);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("重复修改"));

        let completed: i64 = conn
            .query_row("SELECT completed FROM tasks WHERE id = ?1", params![task_id], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(completed, 0, "拒绝后任务不应被完成");
    }

    #[test]
    fn test_batch_complete_then_update_same_task_is_rejected() {
        let mut conn = setup_db();
        let task_id = insert_task(&conn, "冲突任务");
        let updates = UpdateTaskRequest {
            title: Some("冲突更新".to_string()),
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

        let actions = vec![
            AiBatchAction::CompleteTask(CompleteTaskData { task_id }),
            AiBatchAction::UpdateTask(UpdateTaskData { task_id, updates }),
        ];

        let result = do_execute_ai_batch(&mut conn, &actions);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("重复修改"));
    }

    #[test]
    fn test_batch_complete_nonexistent_task_rolls_back() {
        // 完成不存在的任务应该报错并回滚
        let mut conn = setup_db();
        let _task_id = insert_task(&conn, "已有任务");

        let actions = vec![
            AiBatchAction::CreateTask(CreateTaskData {
                title: "新任务".to_string(),
                due_date: None,
                priority: None,
                notes: None,
                list_id: 1,
            }),
            AiBatchAction::CompleteTask(CompleteTaskData { task_id: 999999 }),
        ];

        let result = do_execute_ai_batch(&mut conn, &actions);
        assert!(result.is_err(), "批量执行应该因目标不存在而失败");

        // 回滚后新任务不应存在
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM tasks WHERE title = '新任务'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_batch_update_completion_fields_is_rejected() {
        let mut conn = setup_db();
        let task_id = insert_task(&conn, "完成态绕过任务");

        let updates = UpdateTaskRequest {
            title: None,
            notes: None,
            priority: None,
            due_date: None,
            end_date: None,
            all_day: None,
            reminder: None,
            reminder_minutes: None,
            completed: Some(true),
            completed_at: None,
            status: None,
            archived: None,
            pinned: None,
            list_id: None,
            parent_id: None,
            repeat_rule: None,
            sort_order: None,
        };

        let actions = vec![AiBatchAction::UpdateTask(UpdateTaskData { task_id, updates })];
        let result = do_execute_ai_batch(&mut conn, &actions);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("不允许修改完成状态字段"));
    }

    #[test]
    fn test_batch_complete_already_completed_task_is_rejected() {
        let mut conn = setup_db();
        let task_id = insert_task(&conn, "已完成任务");
        conn.execute(
            "UPDATE tasks SET completed = 1, status = 'done' WHERE id = ?1",
            params![task_id],
        )
        .unwrap();

        let actions = vec![AiBatchAction::CompleteTask(CompleteTaskData { task_id })];
        let result = do_execute_ai_batch(&mut conn, &actions);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("已完成"));
    }

    #[test]
    fn test_batch_update_nonexistent_task_rolls_back() {
        // 更新不存在的任务应该报错并回滚
        let mut conn = setup_db();

        let updates = UpdateTaskRequest {
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

        let actions = vec![
            AiBatchAction::CreateTask(CreateTaskData {
                title: "新任务".to_string(),
                due_date: None,
                priority: None,
                notes: None,
                list_id: 1,
            }),
            AiBatchAction::UpdateTask(UpdateTaskData { task_id: 999999, updates }),
        ];

        let result = do_execute_ai_batch(&mut conn, &actions);
        assert!(result.is_err(), "批量执行应该因目标不存在而失败");

        // 回滚后新任务不应存在
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM tasks WHERE title = '新任务'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_batch_create_subtask() {
        let mut conn = setup_db();
        let parent_id = insert_task(&conn, "父任务");

        let actions = vec![AiBatchAction::CreateSubtask(CreateSubtaskData {
            parent_id,
            title: "子任务".to_string(),
            priority: Some(3),
            list_id: 1,
        })];

        let result = do_execute_ai_batch(&mut conn, &actions).unwrap();
        assert!(result.success);
        let subtask_id = result.results[0].created_task_id.unwrap();

        let (title, pid): (String, i64) = conn
            .query_row(
                "SELECT title, parent_id FROM tasks WHERE id = ?1",
                params![subtask_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(title, "子任务");
        assert_eq!(pid, parent_id);
    }

    #[test]
    fn test_batch_create_subtask_rejects_missing_parent() {
        let mut conn = setup_db();

        let actions = vec![AiBatchAction::CreateSubtask(CreateSubtaskData {
            parent_id: 999999,
            title: "孤儿子任务".to_string(),
            priority: Some(1),
            list_id: 1,
        })];

        let result = do_execute_ai_batch(&mut conn, &actions);
        assert!(result.is_err());
    }

    #[test]
    fn test_batch_create_subtask_rejects_nested_parent() {
        let mut conn = setup_db();
        let parent_id = insert_task(&conn, "父任务");
        conn.execute(
            "INSERT INTO tasks (title, list_id, parent_id, created_at, updated_at) VALUES (?1, 1, ?2, ?3, ?3)",
            params!["子任务", parent_id, "2026-01-01T00:00:00"],
        )
        .unwrap();
        let subtask_id = conn.last_insert_rowid();

        let actions = vec![AiBatchAction::CreateSubtask(CreateSubtaskData {
            parent_id: subtask_id,
            title: "孙任务".to_string(),
            priority: Some(1),
            list_id: 1,
        })];

        let result = do_execute_ai_batch(&mut conn, &actions);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("一层子任务"));
    }

    #[test]
    fn test_batch_update_task() {
        let mut conn = setup_db();
        let task_id = insert_task(&conn, "待更新任务");

        let updates = UpdateTaskRequest {
            title: Some("已更新标题".to_string()),
            notes: None,
            priority: Some(1),
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

        let actions = vec![AiBatchAction::UpdateTask(UpdateTaskData { task_id, updates })];

        let result = do_execute_ai_batch(&mut conn, &actions).unwrap();
        assert!(result.success);

        let (title, priority): (String, i64) = conn
            .query_row(
                "SELECT title, priority FROM tasks WHERE id = ?1",
                params![task_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(title, "已更新标题");
        assert_eq!(priority, 1);
    }

    #[test]
    fn test_batch_mixed_actions() {
        let mut conn = setup_db();
        let t1 = insert_task(&conn, "任务1");
        let t2 = insert_task(&conn, "任务2");

        let updates = UpdateTaskRequest {
            title: Some("任务2已更新".to_string()),
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

        let actions = vec![
            AiBatchAction::CompleteTask(CompleteTaskData { task_id: t1 }),
            AiBatchAction::CreateTask(CreateTaskData {
                title: "新任务".to_string(),
                due_date: None,
                priority: Some(2),
                notes: None,
                list_id: 1,
            }),
            AiBatchAction::UpdateTask(UpdateTaskData { task_id: t2, updates }),
        ];

        let result = do_execute_ai_batch(&mut conn, &actions).unwrap();
        assert!(result.success);
        assert_eq!(result.results.len(), 3);

        // t1 已完成
        let completed: i64 = conn
            .query_row("SELECT completed FROM tasks WHERE id = ?1", params![t1], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(completed, 1);

        // t2 已更新
        let title: String = conn
            .query_row("SELECT title FROM tasks WHERE id = ?1", params![t2], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(title, "任务2已更新");

        // 新任务已创建
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM tasks WHERE title = '新任务'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_batch_delete_task_is_disabled() {
        let mut conn = setup_db();
        let task_id = insert_task(&conn, "待删除任务");

        let actions = vec![AiBatchAction::DeleteTask(DeleteTaskData { task_id })];

        let result = do_execute_ai_batch(&mut conn, &actions);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("AI 删除任务暂不可用"));

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM tasks WHERE id = ?1", params![task_id], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_batch_empty_actions() {
        let mut conn = setup_db();
        let actions: Vec<AiBatchAction> = vec![];

        let result = do_execute_ai_batch(&mut conn, &actions).unwrap();
        assert!(result.success);
        assert_eq!(result.results.len(), 0);
    }

    #[test]
    fn test_batch_complete_expired_recurring_no_next_task() {
        // H1: 重复任务规则已到期（COUNT=1）时，完成不应创建下一周期任务
        let mut conn = setup_db();
        let now = "2026-07-01T00:00:00+08:00";
        conn.execute(
            "INSERT INTO tasks (title, due_date, reminder_minutes, repeat_rule, list_id, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)",
            params!["过期重复任务", "2026-07-01T09:00:00+08:00", 15, "FREQ=DAILY;INTERVAL=1;COUNT=1", now],
        )
        .unwrap();
        let task_id = conn.last_insert_rowid();

        let actions = vec![AiBatchAction::CompleteTask(CompleteTaskData { task_id })];
        let result = do_execute_ai_batch(&mut conn, &actions).unwrap();
        assert!(result.success);

        // 原任务标记为已完成
        let (completed, status): (i64, String) = conn
            .query_row(
                "SELECT completed, status FROM tasks WHERE id = ?1",
                params![task_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(completed, 1);
        assert_eq!(status, "done");

        // 不应创建下一周期任务（只有原任务这一行）
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM tasks WHERE title = '过期重复任务' AND completed = 0",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 0, "不应创建下一周期任务");

        // created_task_id 应为 None
        assert!(result.results[0].created_task_id.is_none());
    }

    #[test]
    fn test_batch_complete_rrule_recurring_creates_next() {
        // H2: RRULE 路径与普通 complete_recurring_task 一致性
        let mut conn = setup_db();
        let now = "2026-07-01T00:00:00+08:00";
        conn.execute(
            "INSERT INTO tasks (title, due_date, reminder_minutes, repeat_rule, list_id, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)",
            params!["RRULE每日任务", "2026-07-01T09:00:00+08:00", 15, "FREQ=DAILY;INTERVAL=1", now],
        )
        .unwrap();
        let task_id = conn.last_insert_rowid();

        let actions = vec![AiBatchAction::CompleteTask(CompleteTaskData { task_id })];
        let result = do_execute_ai_batch(&mut conn, &actions).unwrap();
        assert!(result.success);

        // 应创建了下一周期任务
        let next_due: Option<String> = conn
            .query_row(
                "SELECT due_date FROM tasks WHERE title = 'RRULE每日任务' AND completed = 0",
                [],
                |row| row.get(0),
            )
            .ok();
        assert!(next_due.is_some(), "应创建下一周期任务且有 due_date");

        // 下一周期的 due_date 应为 2026-07-02
        let next_due_str = next_due.unwrap();
        assert!(
            next_due_str.starts_with("2026-07-02"),
            "下一周期 due_date 应为 2026-07-02，实际为 {}",
            next_due_str
        );
    }

    #[test]
    fn test_batch_complete_recurring_subtask_preserves_parent_id() {
        // H1: AI 完成 RRULE 重复子任务时，下一周期任务应保留 parent_id
        let mut conn = setup_db();
        let now = "2026-07-01T00:00:00+08:00";

        // 创建父任务
        conn.execute(
            "INSERT INTO tasks (title, list_id, created_at, updated_at) VALUES (?1, 1, ?2, ?2)",
            params!["父任务", now],
        )
        .unwrap();
        let parent_id = conn.last_insert_rowid();

        // 创建带 RRULE 重复规则的子任务
        conn.execute(
            "INSERT INTO tasks (title, due_date, reminder_minutes, repeat_rule, list_id, parent_id, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, ?6)",
            params!["重复子任务", "2026-07-01T09:00:00+08:00", 15, "FREQ=DAILY;INTERVAL=1", parent_id, now],
        )
        .unwrap();
        let subtask_id = conn.last_insert_rowid();

        let actions = vec![AiBatchAction::CompleteTask(CompleteTaskData { task_id: subtask_id })];
        let result = do_execute_ai_batch(&mut conn, &actions).unwrap();
        assert!(result.success);

        // 下一周期任务应保留 parent_id
        let next_parent_id: Option<i64> = conn
            .query_row(
                "SELECT parent_id FROM tasks WHERE title = '重复子任务' AND completed = 0",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(next_parent_id, Some(parent_id), "下一周期任务应保留 parent_id");
    }
}
