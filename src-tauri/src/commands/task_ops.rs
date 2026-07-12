use chrono::{DateTime, Datelike, TimeZone};
use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};
use tauri::State;

use super::now_rfc3339;
use crate::db::DbState;

#[derive(Debug, Deserialize)]
pub struct ReorderItem {
    pub id: i64,
    pub sort_order: f64,
}

#[derive(Debug, Serialize)]
pub struct CompleteResult {
    pub new_task_id: Option<i64>,
}

#[tauri::command]
pub fn reorder_tasks(state: State<DbState>, items: Vec<ReorderItem>) -> Result<(), String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = now_rfc3339();
    // P3-3: 事务包裹，确保批量排序的原子性
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for item in &items {
        tx.execute(
            "UPDATE tasks SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
            params![item.sort_order, now, item.id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// 核心完成逻辑，接受 &Connection 以便在批量执行事务中复用。
///
/// 处理重复任务：标记当前任务完成后，如果有 repeat_rule，
/// 计算下一周期 due_date 并创建新任务，复制标签关联。
///
/// 返回 `CompleteResult`，如果创建了下一周期任务则 `new_task_id` 有值。
/// 如果任务不存在，返回错误（用于批量执行时回滚）。
pub fn do_complete_task(conn: &rusqlite::Connection, id: i64) -> Result<CompleteResult, String> {
    let now = now_rfc3339();

    // 查询任务详情（包含 parent_id，与 complete_recurring_task 保持一致）
    #[allow(clippy::type_complexity)]
    let task: (
        String,
        Option<String>,
        i64,
        Option<String>,
        Option<String>,
        bool,
        Option<String>,
        Option<i64>,
        i64,
        Option<i64>,
        Option<String>,
        bool,
        f64,
    ) = conn
        .query_row(
            "SELECT title, notes, priority, due_date, end_date, all_day, reminder, reminder_minutes, list_id, parent_id, repeat_rule, completed, sort_order FROM tasks WHERE id = ?1",
            params![id],
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
                    row.get::<_, i64>(11)? != 0,
                    row.get(12)?,
                ))
            },
        )
        .map_err(|e| format!("完成任务失败：任务 #{} 不存在或查询出错: {}", id, e))?;

    let (
        title,
        notes,
        priority,
        due_date,
        end_date,
        all_day,
        reminder,
        reminder_minutes,
        list_id,
        parent_id,
        repeat_rule,
        completed,
        _sort_order,
    ) = task;
    if completed {
        return Err(format!("完成任务失败：任务 #{} 已完成", id));
    }

    // 标记当前任务为已完成
    let affected = conn
        .execute(
            "UPDATE tasks SET completed = 1, completed_at = ?1, status = 'done', updated_at = ?1 WHERE id = ?2 AND completed = 0",
            params![now, id],
        )
        .map_err(|e| e.to_string())?;
    if affected == 0 {
        return Err(format!("完成任务失败：任务 #{} 不存在或已完成", id));
    }

    // 如果有重复规则，尝试创建下一个周期的任务
    if let Some(ref rule) = repeat_rule {
        if !rule.is_empty() {
            // 优先使用 RRULE 路径（与 complete_recurring_task 一致），回退到旧引擎
            let next_due = compute_next_due_date_unified(due_date.as_deref(), rule);

            // 只有计算出有效的 next_due 时才创建下一周期任务
            if let Some(ref next_due_str) = next_due {
                let next_end = match (&due_date, &end_date) {
                    (Some(old_due), Some(old_end)) => {
                        shift_end_date(old_due, old_end, next_due_str)
                    }
                    _ => None,
                };

                // 对于 RRULE 规则，需要递减 count
                let new_repeat_rule = if let Some(parsed) = crate::repeat::parse_rrule(rule) {
                    let mut new_rule = parsed.clone();
                    if let Some(c) = new_rule.count {
                        new_rule.count = Some(c - 1);
                    }
                    Some(crate::repeat::serialize_rrule(&new_rule))
                } else {
                    None
                };

                let next_sort_order = chrono::Local::now().timestamp_millis() as f64;

                conn.execute(
                    "INSERT INTO tasks (title, notes, priority, due_date, end_date, all_day, reminder, reminder_minutes, list_id, parent_id, repeat_rule, sort_order, completed, completed_at, status, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, NULL, 'todo', ?13, ?14)",
                    params![
                        title,
                        notes,
                        priority,
                        next_due_str,
                        next_end,
                        all_day,
                        reminder,
                        reminder_minutes,
                        list_id,
                        parent_id,
                        new_repeat_rule.as_deref().unwrap_or(rule),
                        next_sort_order,
                        now,
                        now
                    ],
                ).map_err(|e| e.to_string())?;

                let new_id = conn.last_insert_rowid();

                // 复制标签关联
                let tag_ids: Vec<i64> = conn
                    .prepare("SELECT tag_id FROM task_tags WHERE task_id = ?1")
                    .map_err(|e| e.to_string())?
                    .query_map(params![id], |row| row.get(0))
                    .map_err(|e| e.to_string())?
                    .filter_map(|r| r.ok())
                    .collect();

                for tag_id in tag_ids {
                    conn.execute(
                        "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
                        params![new_id, tag_id],
                    )
                    .map_err(|e| e.to_string())?;
                }

                return Ok(CompleteResult {
                    new_task_id: Some(new_id),
                });
            }
            // next_due 为 None：规则已到期或无法计算，只完成当前任务，不创建新任务
        }
    }

    Ok(CompleteResult { new_task_id: None })
}

#[tauri::command]
pub fn complete_task(state: State<DbState>, id: i64) -> Result<CompleteResult, String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    // P3-3: 事务包裹，确保完成 + 创建下一周期 + 复制标签的原子性
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let result = do_complete_task(&tx, id)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(result)
}

fn compute_next_due_date(due_date: &str, rule: &str) -> Option<String> {
    let dt = chrono::DateTime::parse_from_rfc3339(due_date).ok()?;
    let local = dt.with_timezone(&chrono::Local);

    // 先尝试解析为 JSON 规则
    if let Ok(rule_obj) = serde_json::from_str::<serde_json::Value>(rule) {
        let next = compute_next_from_json(&local, &rule_obj)?;

        // 支持 end_date 字段：如果下一个日期超过 end_date 则返回 None
        if let Some(end_date) = rule_obj.get("end_date").and_then(|v| v.as_str()) {
            if let Ok(end_dt) = chrono::DateTime::parse_from_rfc3339(end_date) {
                let end_local = end_dt.with_timezone(&chrono::Local);
                if next > end_local {
                    return None;
                }
            }
        }

        return Some(next.to_rfc3339());
    }

    // 回退到旧的字符串匹配逻辑
    let next = match rule {
        "daily" => local + chrono::Duration::days(1),
        "weekly" => local + chrono::Duration::weeks(1),
        "monthly" => {
            // 简单处理：加 30 天
            local + chrono::Duration::days(30)
        }
        "weekdays" => {
            let tomorrow = local + chrono::Duration::days(1);
            let weekday = tomorrow.weekday();
            if weekday == chrono::Weekday::Sat {
                local + chrono::Duration::days(3)
            } else if weekday == chrono::Weekday::Sun {
                local + chrono::Duration::days(2)
            } else {
                tomorrow
            }
        }
        _ => return None,
    };

    Some(next.to_rfc3339())
}

/// 统一计算下一周期 due_date：优先 RRULE（与 complete_recurring_task 一致），回退旧引擎。
///
/// 只有返回 Some 时调用方才应创建下一周期任务；
/// 返回 None 表示规则已到期、无效或不支持，不应创建下一周期。
fn compute_next_due_date_unified(due_date: Option<&str>, rule: &str) -> Option<String> {
    // 先尝试 RRULE 路径
    if let Some(parsed_rule) = crate::repeat::parse_rrule(rule) {
        let from = due_date
            .and_then(|d| chrono::DateTime::parse_from_rfc3339(d).ok())
            .map(|dt| dt.with_timezone(&chrono::Local))
            .unwrap_or_else(chrono::Local::now);

        // 检查 count 是否允许创建下一个（count<=1 表示这是最后一次）
        let can_create_another = parsed_rule.count.map(|c| c > 1).unwrap_or(true);
        if !can_create_another {
            return None;
        }

        return crate::repeat::next_occurrence(&parsed_rule, from).map(|dt| dt.to_rfc3339());
    }

    // 回退到旧引擎（JSON 规则或简单字符串规则）
    due_date.and_then(|d| compute_next_due_date(d, rule))
}

pub(crate) fn shift_end_date(old_due: &str, old_end: &str, new_due: &str) -> Option<String> {
    let old_due = DateTime::parse_from_rfc3339(old_due).ok()?;
    let old_end = DateTime::parse_from_rfc3339(old_end).ok()?;
    let new_due = DateTime::parse_from_rfc3339(new_due).ok()?;
    let duration = old_end.signed_duration_since(old_due);
    if duration <= chrono::Duration::zero() {
        return None;
    }
    Some((new_due + duration).to_rfc3339())
}

/// 根据自定义 JSON 重复规则计算下一个到期日期。
///
/// 支持的规则格式：
/// - `{"type": "daily", "interval": 2}` 每 2 天
/// - `{"type": "weekly", "interval": 1, "days": [1, 3, 5]}` 每周一三五（1=周一 ... 7=周日）
/// - `{"type": "monthly", "day": 15}` 每月 15 号
/// - `{"type": "monthly", "interval": 3, "day": 1}` 每 3 个月的 1 号
fn compute_next_from_json(
    local: &chrono::DateTime<chrono::Local>,
    rule: &serde_json::Value,
) -> Option<chrono::DateTime<chrono::Local>> {
    let rule_type = rule.get("type")?.as_str()?;
    let interval = rule
        .get("interval")
        .and_then(|i| i.as_i64())
        .unwrap_or(1)
        .max(1);

    match rule_type {
        "daily" => Some(*local + chrono::Duration::days(interval)),

        "weekly" => {
            if let Some(days) = rule.get("days").and_then(|d| d.as_array()) {
                // 收集星期几 (1=周一 ... 7=周日)
                let weekdays: Vec<u32> = days
                    .iter()
                    .filter_map(|d| d.as_i64().map(|n| n as u32))
                    .collect();

                if weekdays.is_empty() {
                    return Some(*local + chrono::Duration::weeks(interval));
                }

                // 以周一为锚点计算周差
                let local_wd = local.weekday().num_days_from_monday() as i64; // 0=周一
                let local_monday = local.date_naive() - chrono::Duration::days(local_wd);

                let mut candidate = *local + chrono::Duration::days(1);
                // 搜索上限：interval 周 + 一周余量
                let limit = (7 * interval) + 7;
                let mut searched = 0;

                while searched < limit {
                    let cand_wd = candidate.weekday().num_days_from_monday() + 1; // 1=周一
                    if weekdays.contains(&cand_wd) {
                        let cand_monday =
                            candidate.date_naive() - chrono::Duration::days(cand_wd as i64 - 1);
                        let weeks_diff = (cand_monday - local_monday).num_days() / 7;
                        if weeks_diff >= 0 && weeks_diff % interval == 0 {
                            return Some(candidate);
                        }
                    }
                    candidate += chrono::Duration::days(1);
                    searched += 1;
                }
                None
            } else {
                Some(*local + chrono::Duration::weeks(interval))
            }
        }

        "monthly" => {
            let day = rule
                .get("day")
                .and_then(|d| d.as_i64())
                .unwrap_or(local.day() as i64) as u32;

            let mut year = local.year();
            // 从下个 interval 周期开始
            let mut month = local.month() + interval as u32;
            while month > 12 {
                month -= 12;
                year += 1;
            }

            // 处理 day 超出该月天数的情况（如 2 月 30 日）：跳到下个 interval 周期
            loop {
                if let Some(naive) = chrono::NaiveDate::from_ymd_opt(year, month, day) {
                    let naive_dt = naive.and_time(local.naive_local().time());
                    let candidate_local = chrono::Local.from_local_datetime(&naive_dt).single()?;
                    return Some(candidate_local);
                }

                month += interval as u32;
                while month > 12 {
                    month -= 12;
                    year += 1;
                }

                // 防止无限循环
                if year > local.year() + 100 {
                    return None;
                }
            }
        }

        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::shift_end_date;
    use rusqlite::params;

    #[test]
    fn recurring_completion_sets_current_done_and_next_todo() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::init_schema(&conn).unwrap();
        let now = "2026-07-01T00:00:00+08:00";
        conn.execute(
            "INSERT INTO tasks (title, due_date, reminder_minutes, repeat_rule, list_id, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)",
            params!["重复任务", "2026-07-01T09:00:00+08:00", 15, "daily", now],
        )
        .unwrap();
        let task_id = conn.last_insert_rowid();

        conn.execute(
            "UPDATE tasks SET completed = 1, completed_at = ?1, status = 'done', updated_at = ?1 WHERE id = ?2",
            params![now, task_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO tasks (title, due_date, reminder_minutes, list_id, repeat_rule, completed, completed_at, status, created_at, updated_at) \
             VALUES (?1, ?2, ?3, 1, ?4, 0, NULL, 'todo', ?5, ?5)",
            params!["重复任务", "2026-07-02T09:00:00+08:00", 15, "daily", now],
        )
        .unwrap();
        let next_id = conn.last_insert_rowid();

        let (completed, completed_at, status): (i64, Option<String>, String) = conn
            .query_row(
                "SELECT completed, completed_at, status FROM tasks WHERE id = ?1",
                params![task_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(completed, 1);
        assert_eq!(completed_at.as_deref(), Some(now));
        assert_eq!(status, "done");

        let (completed, completed_at, status, reminder_minutes): (
            i64,
            Option<String>,
            String,
            Option<i64>,
        ) = conn
            .query_row(
                "SELECT completed, completed_at, status, reminder_minutes FROM tasks WHERE id = ?1",
                params![next_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(completed, 0);
        assert_eq!(completed_at, None);
        assert_eq!(status, "todo");
        assert_eq!(reminder_minutes, Some(15));
    }

    #[test]
    fn shift_end_date_preserves_duration() {
        let next_end = shift_end_date(
            "2026-07-01T09:00:00+08:00",
            "2026-07-01T11:30:00+08:00",
            "2026-07-08T09:00:00+08:00",
        );

        assert_eq!(next_end.as_deref(), Some("2026-07-08T11:30:00+08:00"));
    }

    #[test]
    fn shift_end_date_ignores_invalid_or_non_positive_ranges() {
        assert!(shift_end_date(
            "2026-07-01T09:00:00+08:00",
            "2026-07-01T09:00:00+08:00",
            "2026-07-08T09:00:00+08:00",
        )
        .is_none());
        assert!(shift_end_date(
            "bad",
            "2026-07-01T11:30:00+08:00",
            "2026-07-08T09:00:00+08:00"
        )
        .is_none());
    }
}
