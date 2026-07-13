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

use super::{
    do_complete_task, do_create_task, do_delete_task, do_update_task, CreateTaskRequest,
    UpdateTaskRequest,
};
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
            // v1.43.0：AI 删除改走软删除（回收站），允许纳入批量事务
            AiBatchAction::DeleteTask(data) => {
                if !touched_existing_tasks.insert(data.task_id) {
                    return Err(format!(
                        "批量执行失败：任务 #{} 在同一批 AI 操作中被重复修改",
                        data.task_id
                    ));
                }
            }
            AiBatchAction::UpdateTask(data) => {
                if data.updates.completed.is_some()
                    || data.updates.completed_at.is_some()
                    || data.updates.status.is_some()
                {
                    return Err(
                        "AI update_task 不允许修改完成状态字段，请使用 complete_task".to_string(),
                    );
                }
                if !touched_existing_tasks.insert(data.task_id) {
                    return Err(format!(
                        "批量执行失败：任务 #{} 在同一批 AI 操作中被重复修改",
                        data.task_id
                    ));
                }
            }
            AiBatchAction::CompleteTask(data) => {
                if !touched_existing_tasks.insert(data.task_id) {
                    return Err(format!(
                        "批量执行失败：任务 #{} 在同一批 AI 操作中被重复修改",
                        data.task_id
                    ));
                }
            }
            AiBatchAction::CreateTask(_) | AiBatchAction::CreateSubtask(_) => {}
        }
    }

    Ok(())
}

/// 若 task_id 的任一严格祖先也在同批删除集合中，则本条删除会被祖先级联覆盖。
/// 与前端 pruneRedundantCascadeDeleteIds 对齐：父链成环时不剪枝，交由 do_delete_task 幂等处理。
fn has_deleted_ancestor_in_set(
    conn: &rusqlite::Connection,
    task_id: i64,
    delete_ids: &HashSet<i64>,
) -> Result<bool, String> {
    let mut current = task_id;
    let mut visited: HashSet<i64> = HashSet::new();
    visited.insert(task_id);
    let mut ancestors: Vec<i64> = Vec::new();

    // 防御：祖先链异常环时最多走 64 层；检测到环则不剪枝
    for _ in 0..64 {
        let parent_id: Option<i64> = conn
            .query_row(
                "SELECT parent_id FROM tasks WHERE id = ?1",
                rusqlite::params![current],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        match parent_id {
            Some(pid) => {
                if !visited.insert(pid) {
                    // 自环/互环：保守不剪，避免整批删除被静默跳过
                    return Ok(false);
                }
                ancestors.push(pid);
                current = pid;
            }
            None => break,
        }
    }

    Ok(ancestors.iter().any(|pid| delete_ids.contains(pid)))
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

    // 同批 delete 目标集合：用于剪掉可被祖先级联覆盖的后代删除，避免拆开 deleted_at
    let delete_ids_in_batch: HashSet<i64> = actions
        .iter()
        .filter_map(|a| match a {
            AiBatchAction::DeleteTask(d) => Some(d.task_id),
            _ => None,
        })
        .collect();

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
                // 校验目标任务存在且未软删除；do_update_task 也会再次限制 deleted_at
                let exists: i64 = tx
                    .query_row(
                        "SELECT COUNT(*) FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
                        rusqlite::params![data.task_id],
                        |row| row.get(0),
                    )
                    .map_err(|e| e.to_string())?;
                if exists == 0 {
                    return Err(format!(
                        "批量执行失败：任务不存在或已移入回收站（#{}），已回滚",
                        data.task_id
                    ));
                }
                do_update_task(&tx, data.task_id, &data.updates)?;
                AiActionResult {
                    index: i,
                    action_type: "update_task".to_string(),
                    created_task_id: None,
                }
            }
            AiBatchAction::DeleteTask(data) => {
                // 软删除：移入回收站，保留附件/标签/时间记录等关联。
                // 若同批已包含祖先删除，跳过本条，避免后代先独立删除导致时间戳不一致。
                if !has_deleted_ancestor_in_set(&tx, data.task_id, &delete_ids_in_batch)? {
                    do_delete_task(&tx, data.task_id)?;
                }
                AiActionResult {
                    index: i,
                    action_type: "delete_task".to_string(),
                    created_task_id: None,
                }
            }
            AiBatchAction::CompleteTask(data) => {
                // do_complete_task 内部会检查任务存在性/软删除并处理重复任务
                let complete_result = do_complete_task(&tx, data.task_id).map_err(|e| {
                    if e.contains("不存在或已移入回收站") {
                        format!("批量执行失败：{}，已回滚", e)
                    } else {
                        e
                    }
                })?;
                AiActionResult {
                    index: i,
                    action_type: "complete_task".to_string(),
                    created_task_id: complete_result.new_task_id,
                }
            }
            AiBatchAction::CreateSubtask(data) => {
                let parent_parent_id: Option<i64> = tx
                    .query_row(
                        "SELECT parent_id FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
                        rusqlite::params![data.parent_id],
                        |row| row.get(0),
                    )
                    .map_err(|_| {
                        format!(
                            "批量执行失败：任务不存在或已移入回收站（#{}），已回滚",
                            data.parent_id
                        )
                    })?;
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
            .query_row(
                "SELECT COUNT(*) FROM tasks WHERE title = '批量创建的任务'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_batch_delete_action_soft_deletes_in_transaction() {
        // v1.43.0：AI 删除改为软删除，批量事务内应成功
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

        let result = do_execute_ai_batch(&mut conn, &actions).unwrap();
        assert!(result.success);

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM tasks WHERE title = '新任务' AND deleted_at IS NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1, "创建动作应成功");

        let deleted_at: Option<String> = conn
            .query_row(
                "SELECT deleted_at FROM tasks WHERE id = ?1",
                params![task_id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(deleted_at.is_some(), "原任务应被软删除");
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
            .query_row(
                "SELECT completed FROM tasks WHERE id = ?1",
                params![task_id],
                |row| row.get(0),
            )
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
            .query_row(
                "SELECT COUNT(*) FROM tasks WHERE title = '新任务'",
                [],
                |row| row.get(0),
            )
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

        let actions = vec![AiBatchAction::UpdateTask(UpdateTaskData {
            task_id,
            updates,
        })];
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
            AiBatchAction::UpdateTask(UpdateTaskData {
                task_id: 999999,
                updates,
            }),
        ];

        let result = do_execute_ai_batch(&mut conn, &actions);
        assert!(result.is_err(), "批量执行应该因目标不存在而失败");

        // 回滚后新任务不应存在
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM tasks WHERE title = '新任务'",
                [],
                |row| row.get(0),
            )
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

        let actions = vec![AiBatchAction::UpdateTask(UpdateTaskData {
            task_id,
            updates,
        })];

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
            AiBatchAction::UpdateTask(UpdateTaskData {
                task_id: t2,
                updates,
            }),
        ];

        let result = do_execute_ai_batch(&mut conn, &actions).unwrap();
        assert!(result.success);
        assert_eq!(result.results.len(), 3);

        // t1 已完成
        let completed: i64 = conn
            .query_row(
                "SELECT completed FROM tasks WHERE id = ?1",
                params![t1],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(completed, 1);

        // t2 已更新
        let title: String = conn
            .query_row(
                "SELECT title FROM tasks WHERE id = ?1",
                params![t2],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(title, "任务2已更新");

        // 新任务已创建
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM tasks WHERE title = '新任务'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_batch_delete_task_is_soft_delete() {
        let mut conn = setup_db();
        let task_id = insert_task(&conn, "待删除任务");

        let actions = vec![AiBatchAction::DeleteTask(DeleteTaskData { task_id })];

        let result = do_execute_ai_batch(&mut conn, &actions).unwrap();
        assert!(result.success);

        // 行仍在库中，但已软删除
        let deleted_at: Option<String> = conn
            .query_row(
                "SELECT deleted_at FROM tasks WHERE id = ?1",
                params![task_id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(deleted_at.is_some(), "AI delete_task 应走软删除");

        let active: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
                params![task_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(active, 0);
    }

    /// 同批同时删除父+子：剪枝后代删除，父子共用同一 deleted_at，恢复父可连带恢复子
    #[test]
    fn test_batch_delete_parent_and_child_share_timestamp() {
        use super::super::do_restore_task;
        let mut conn = setup_db();
        let parent = insert_task(&conn, "父");
        conn.execute(
            "INSERT INTO tasks (title, list_id, parent_id, created_at, updated_at) VALUES (?1, 1, ?2, ?3, ?4)",
            params!["子", parent, "2026-01-01T00:00:00", "2026-01-01T00:00:00"],
        )
        .unwrap();
        let child = conn.last_insert_rowid();

        // 故意把子放在父前面，验证剪枝与顺序无关
        let actions = vec![
            AiBatchAction::DeleteTask(DeleteTaskData { task_id: child }),
            AiBatchAction::DeleteTask(DeleteTaskData { task_id: parent }),
        ];
        let result = do_execute_ai_batch(&mut conn, &actions).unwrap();
        assert!(result.success);
        assert_eq!(result.results.len(), 2);

        let parent_ts: String = conn
            .query_row(
                "SELECT deleted_at FROM tasks WHERE id = ?1",
                params![parent],
                |row| row.get(0),
            )
            .unwrap();
        let child_ts: String = conn
            .query_row(
                "SELECT deleted_at FROM tasks WHERE id = ?1",
                params![child],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            parent_ts, child_ts,
            "同批父子删除应共用级联时间戳"
        );

        do_restore_task(&conn, parent).unwrap();
        let child_active: Option<String> = conn
            .query_row(
                "SELECT deleted_at FROM tasks WHERE id = ?1",
                params![child],
                |row| row.get(0),
            )
            .unwrap();
        assert!(child_active.is_none(), "恢复父任务应连带恢复同次级联子任务");
    }

    /// 同批祖/父/孙乱序删除：三者共用同一次级联时间戳，恢复祖先后全部恢复
    #[test]
    fn test_batch_delete_parent_child_grandchild_share_timestamp() {
        use super::super::do_restore_task;
        let mut conn = setup_db();
        let parent = insert_task(&conn, "祖");
        conn.execute(
            "INSERT INTO tasks (title, list_id, parent_id, created_at, updated_at) VALUES (?1, 1, ?2, ?3, ?4)",
            params!["父", parent, "2026-01-01T00:00:00", "2026-01-01T00:00:00"],
        )
        .unwrap();
        let child = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO tasks (title, list_id, parent_id, created_at, updated_at) VALUES (?1, 1, ?2, ?3, ?4)",
            params!["孙", child, "2026-01-01T00:00:00", "2026-01-01T00:00:00"],
        )
        .unwrap();
        let grand = conn.last_insert_rowid();

        // 故意乱序：孙 → 祖 → 父
        let actions = vec![
            AiBatchAction::DeleteTask(DeleteTaskData { task_id: grand }),
            AiBatchAction::DeleteTask(DeleteTaskData { task_id: parent }),
            AiBatchAction::DeleteTask(DeleteTaskData { task_id: child }),
        ];
        let result = do_execute_ai_batch(&mut conn, &actions).unwrap();
        assert!(result.success);
        assert_eq!(result.results.len(), 3);

        let stamps: Vec<String> = [parent, child, grand]
            .iter()
            .map(|id| {
                conn.query_row(
                    "SELECT deleted_at FROM tasks WHERE id = ?1",
                    params![id],
                    |row| row.get(0),
                )
                .unwrap()
            })
            .collect();
        assert_eq!(stamps[0], stamps[1], "祖/父应共用级联时间戳");
        assert_eq!(stamps[1], stamps[2], "父/孙应共用级联时间戳");

        do_restore_task(&conn, parent).unwrap();
        for id in [parent, child, grand] {
            let deleted_at: Option<String> = conn
                .query_row(
                    "SELECT deleted_at FROM tasks WHERE id = ?1",
                    params![id],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(
                deleted_at.is_none(),
                "恢复祖先后 id={} 应恢复",
                id
            );
        }
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

        let actions = vec![AiBatchAction::CompleteTask(CompleteTaskData {
            task_id: subtask_id,
        })];
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
        assert_eq!(
            next_parent_id,
            Some(parent_id),
            "下一周期任务应保留 parent_id"
        );
    }

    #[test]
    fn test_batch_delete_then_update_same_task_is_rejected() {
        let mut conn = setup_db();
        let task_id = insert_task(&conn, "先删后改");

        let actions = vec![
            AiBatchAction::DeleteTask(DeleteTaskData { task_id }),
            AiBatchAction::UpdateTask(UpdateTaskData {
                task_id,
                updates: UpdateTaskRequest {
                    title: Some("不该写入".to_string()),
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
                },
            }),
        ];

        let err = do_execute_ai_batch(&mut conn, &actions).unwrap_err();
        assert!(
            err.contains("重复修改") || err.contains("已移入回收站"),
            "err={err}"
        );

        let (title, deleted_at): (String, Option<String>) = conn
            .query_row(
                "SELECT title, deleted_at FROM tasks WHERE id = ?1",
                params![task_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(title, "先删后改");
        assert!(deleted_at.is_none(), "整批应拒绝，不得软删除半完成");
    }

    #[test]
    fn test_batch_update_already_deleted_task_is_rejected() {
        let mut conn = setup_db();
        let task_id = insert_task(&conn, "已在回收站");
        conn.execute(
            "UPDATE tasks SET deleted_at = ?1 WHERE id = ?2",
            params!["2026-07-01T00:00:00Z", task_id],
        )
        .unwrap();

        let actions = vec![AiBatchAction::UpdateTask(UpdateTaskData {
            task_id,
            updates: UpdateTaskRequest {
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
            },
        })];

        let err = do_execute_ai_batch(&mut conn, &actions).unwrap_err();
        assert!(err.contains("不存在或已移入回收站"), "err={err}");

        let title: String = conn
            .query_row(
                "SELECT title FROM tasks WHERE id = ?1",
                params![task_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(title, "已在回收站");
    }

    #[test]
    fn test_batch_complete_already_deleted_task_is_rejected() {
        let mut conn = setup_db();
        let task_id = insert_task(&conn, "已删待完成");
        conn.execute(
            "UPDATE tasks SET deleted_at = ?1 WHERE id = ?2",
            params!["2026-07-01T00:00:00Z", task_id],
        )
        .unwrap();

        let actions = vec![AiBatchAction::CompleteTask(CompleteTaskData { task_id })];
        let err = do_execute_ai_batch(&mut conn, &actions).unwrap_err();
        assert!(err.contains("不存在或已移入回收站"), "err={err}");

        let completed: i64 = conn
            .query_row(
                "SELECT completed FROM tasks WHERE id = ?1",
                params![task_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(completed, 0);
    }

    /// 回归：自环 parent_id 不得被 has_deleted_ancestor_in_set 误判而静默跳过删除
    #[test]
    fn test_batch_delete_self_loop_is_not_silently_skipped() {
        let mut conn = setup_db();
        let id = insert_task(&conn, "自环");
        conn.execute(
            "UPDATE tasks SET parent_id = ?1 WHERE id = ?1",
            params![id],
        )
        .unwrap();

        let actions = vec![AiBatchAction::DeleteTask(DeleteTaskData { task_id: id })];
        let result = do_execute_ai_batch(&mut conn, &actions).unwrap();
        assert!(result.success);

        let deleted_at: Option<String> = conn
            .query_row(
                "SELECT deleted_at FROM tasks WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(deleted_at.is_some(), "自环任务 AI 删除不得静默跳过");
    }

    /// 回归：双节点环且双方均在同批删除时，不得两条都静默跳过
    #[test]
    fn test_batch_delete_dual_cycle_both_selected_not_skipped() {
        let mut conn = setup_db();
        let a = insert_task(&conn, "环A");
        let b = insert_task(&conn, "环B");
        conn.execute("UPDATE tasks SET parent_id = ?1 WHERE id = ?2", params![b, a]).unwrap();
        conn.execute("UPDATE tasks SET parent_id = ?1 WHERE id = ?2", params![a, b]).unwrap();

        let actions = vec![
            AiBatchAction::DeleteTask(DeleteTaskData { task_id: a }),
            AiBatchAction::DeleteTask(DeleteTaskData { task_id: b }),
        ];
        let result = do_execute_ai_batch(&mut conn, &actions).unwrap();
        assert!(result.success);

        for id in [a, b] {
            let deleted_at: Option<String> = conn
                .query_row(
                    "SELECT deleted_at FROM tasks WHERE id = ?1",
                    params![id],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(
                deleted_at.is_some(),
                "双环同批删除 id={} 不得静默跳过",
                id
            );
        }
    }

    /// 回归：三节点环 AI 单删与全选均不得静默跳过
    #[test]
    fn test_batch_delete_three_node_cycle_not_skipped() {
        let mut conn = setup_db();
        let a = insert_task(&conn, "环A");
        let b = insert_task(&conn, "环B");
        let c = insert_task(&conn, "环C");
        // A → B → C → A
        conn.execute("UPDATE tasks SET parent_id = ?1 WHERE id = ?2", params![b, a])
            .unwrap();
        conn.execute("UPDATE tasks SET parent_id = ?1 WHERE id = ?2", params![c, b])
            .unwrap();
        conn.execute("UPDATE tasks SET parent_id = ?1 WHERE id = ?2", params![a, c])
            .unwrap();

        // 单删一个环节点
        let actions = vec![AiBatchAction::DeleteTask(DeleteTaskData { task_id: a })];
        let result = do_execute_ai_batch(&mut conn, &actions).unwrap();
        assert!(result.success);
        for id in [a, b, c] {
            let deleted_at: Option<String> = conn
                .query_row(
                    "SELECT deleted_at FROM tasks WHERE id = ?1",
                    params![id],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(
                deleted_at.is_some(),
                "三环 AI 单删后 id={} 应被级联软删除",
                id
            );
        }

        // 恢复后验证全选也不被剪枝成空操作
        for id in [a, b, c] {
            conn.execute(
                "UPDATE tasks SET deleted_at = NULL WHERE id = ?1",
                params![id],
            )
            .unwrap();
        }
        let actions_all = vec![
            AiBatchAction::DeleteTask(DeleteTaskData { task_id: c }),
            AiBatchAction::DeleteTask(DeleteTaskData { task_id: a }),
            AiBatchAction::DeleteTask(DeleteTaskData { task_id: b }),
        ];
        let result_all = do_execute_ai_batch(&mut conn, &actions_all).unwrap();
        assert!(result_all.success);
        for id in [a, b, c] {
            let deleted_at: Option<String> = conn
                .query_row(
                    "SELECT deleted_at FROM tasks WHERE id = ?1",
                    params![id],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(
                deleted_at.is_some(),
                "三环 AI 全选删除 id={} 不得静默跳过",
                id
            );
        }
    }
}
