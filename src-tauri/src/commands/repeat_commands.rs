//! 重复任务相关的 Tauri 命令。

use rusqlite::{params, Result};
use tauri::State;

use super::{now_rfc3339, task_ops::shift_end_date};
use crate::db::DbState;
use crate::repeat;

/// 完成重复任务。
///
/// 逻辑：
/// 1. 查询任务获取 repeat_rule
/// 2. 解析规则，计算下一个出现日期
/// 3. 若规则已到期（endDate/count 到达）→ 标记当前任务完成，返回 0
/// 4. 否则：创建新任务（复制标题/优先级/notes/repeat_rule，设置 due_date 为下次出现日期）
///    → 标记当前任务完成 → 返回新任务 id
#[tauri::command]
pub fn complete_recurring_task(state: State<DbState>, task_id: i64) -> Result<i64, String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = now_rfc3339();
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // 1. 查询任务详情
    #[allow(clippy::type_complexity)]
    let task: (
        String,         // title
        Option<String>, // notes
        i64,            // priority
        Option<String>, // due_date
        Option<String>, // end_date
        bool,           // all_day
        Option<String>, // reminder
        Option<i64>,    // reminder_minutes
        i64,            // list_id
        Option<i64>,    // parent_id
        Option<String>, // repeat_rule
    ) = tx
        .query_row(
            "SELECT title, notes, priority, due_date, end_date, all_day, reminder, reminder_minutes, list_id, parent_id, repeat_rule
             FROM tasks WHERE id = ?1",
            params![task_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get::<_, i64>(5)? != 0,
                    row.get(6)?,
                    row.get(7)?,
                    row.get(8)?,
                    row.get(9)?,
                    row.get(10)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;

    let (title, notes, priority, due_date, end_date, all_day, reminder, reminder_minutes, list_id, parent_id, repeat_rule) =
        task;

    // 2. 标记当前任务为已完成
    tx.execute(
        "UPDATE tasks SET completed = 1, completed_at = ?1, status = 'done', updated_at = ?1 WHERE id = ?2",
        params![now, task_id],
    )
    .map_err(|e| e.to_string())?;

    // 3. 处理重复规则
    if let Some(ref rule_str) = repeat_rule {
        if let Some(rule) = repeat::parse_rrule(rule_str) {
            // 解析 due_date 作为计算基准（无则用当前时间）
            let from = due_date
                .as_ref()
                .and_then(|d| chrono::DateTime::parse_from_rfc3339(d).ok())
                .map(|dt| dt.with_timezone(&chrono::Local))
                .unwrap_or_else(chrono::Local::now);

            let next = repeat::next_occurrence(&rule, from);

            // 检查 count 是否允许创建下一个（count<=1 表示这是最后一次）
            let can_create_another = rule.count.map(|c| c > 1).unwrap_or(true);

            if let (Some(next_dt), true) = (next, can_create_another) {
                // 4. 创建下一周期任务
                let mut new_rule = rule.clone();
                // count 递减（若设置了 count）
                if let Some(c) = new_rule.count {
                    new_rule.count = Some(c - 1);
                }
                let new_repeat_rule = repeat::serialize_rrule(&new_rule);
                let next_due = next_dt.to_rfc3339();
                let next_end = match (&due_date, &end_date) {
                    (Some(old_due), Some(old_end)) => shift_end_date(old_due, old_end, &next_due),
                    _ => None,
                };
                let sort_order = chrono::Local::now().timestamp_millis() as f64;

                tx.execute(
                    "INSERT INTO tasks
                        (title, notes, priority, due_date, end_date, all_day, reminder, reminder_minutes, list_id, parent_id, repeat_rule, sort_order, completed, completed_at, status, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, NULL, 'todo', ?13, ?14)",
                    params![
                        title,
                        notes,
                        priority,
                        next_due,
                        next_end,
                        all_day,
                        reminder,
                        reminder_minutes,
                        list_id,
                        parent_id,
                        new_repeat_rule,
                        sort_order,
                        now,
                        now
                    ],
                )
                .map_err(|e| e.to_string())?;

                let new_id = tx.last_insert_rowid();

                // 4.1 复制标签关联
                let tag_ids: Vec<i64> = tx
                    .prepare("SELECT tag_id FROM task_tags WHERE task_id = ?1")
                    .map_err(|e| e.to_string())?
                    .query_map(params![task_id], |row| row.get(0))
                    .map_err(|e| e.to_string())?
                    .filter_map(|r| r.ok())
                    .collect();

                for tag_id in tag_ids {
                    tx.execute(
                        "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
                        params![new_id, tag_id],
                    )
                    .map_err(|e| e.to_string())?;
                }

                tx.commit().map_err(|e| e.to_string())?;
                return Ok(new_id);
            }
        }
    }

    // 规则已到期或无重复规则
    tx.commit().map_err(|e| e.to_string())?;
    Ok(0)
}
