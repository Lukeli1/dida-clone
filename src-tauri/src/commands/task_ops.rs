use chrono::{Datelike, TimeZone};
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

#[tauri::command]
pub fn complete_task(state: State<DbState>, id: i64) -> Result<CompleteResult, String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = now_rfc3339();

    // P3-3: 事务包裹，确保完成 + 创建下一周期 + 复制标签的原子性
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // 查询任务详情
    #[allow(clippy::type_complexity)]
    let task: (String, Option<String>, i64, Option<String>, Option<String>, i64, Option<String>, f64) = tx
        .query_row(
            "SELECT title, notes, priority, due_date, reminder, list_id, repeat_rule, sort_order FROM tasks WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?)),
        )
        .map_err(|e| e.to_string())?;

    let (title, notes, priority, due_date, reminder, list_id, repeat_rule, _sort_order) = task;

    // 标记当前任务为已完成
    tx.execute(
        "UPDATE tasks SET completed = 1, updated_at = ?1 WHERE id = ?2",
        params![now, id],
    )
    .map_err(|e| e.to_string())?;

    // 如果有重复规则，创建下一个周期的任务
    if let Some(ref rule) = repeat_rule {
        if !rule.is_empty() {
            let next_due = due_date
                .as_ref()
                .and_then(|d| compute_next_due_date(d, rule));

            let next_sort_order = chrono::Local::now().timestamp_millis() as f64;

            tx.execute(
                "INSERT INTO tasks (title, notes, priority, due_date, reminder, list_id, repeat_rule, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![title, notes, priority, next_due, reminder, list_id, repeat_rule, next_sort_order, now, now],
            ).map_err(|e| e.to_string())?;

            let new_id = tx.last_insert_rowid();

            // 复制标签关联
            let tag_ids: Vec<i64> = tx
                .prepare("SELECT tag_id FROM task_tags WHERE task_id = ?1")
                .map_err(|e| e.to_string())?
                .query_map(params![id], |row| row.get(0))
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
            return Ok(CompleteResult {
                new_task_id: Some(new_id),
            });
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(CompleteResult { new_task_id: None })
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
