use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};
use tauri::State;
use chrono::{Datelike, TimeZone};
use std::collections::HashMap;

use crate::db::{DbState, Task};
use super::now_rfc3339;

#[derive(Debug, Deserialize)]
pub struct CreateTaskRequest {
    pub title: String,
    pub notes: Option<String>,
    pub priority: Option<i64>,
    pub due_date: Option<String>,
    pub end_date: Option<String>,
    pub reminder: Option<String>,
    pub list_id: i64,
    pub parent_id: Option<i64>,
    pub repeat_rule: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTaskRequest {
    pub title: Option<String>,
    pub notes: Option<String>,
    pub priority: Option<i64>,
    pub due_date: Option<String>,
    pub end_date: Option<String>,
    pub reminder: Option<String>,
    pub completed: Option<bool>,
    pub archived: Option<bool>,
    pub pinned: Option<bool>,
    pub list_id: Option<i64>,
    pub parent_id: Option<i64>,
    pub repeat_rule: Option<String>,
    pub sort_order: Option<f64>,
}

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
pub fn get_tasks(
    state: State<DbState>,
    list_id: Option<i64>,
    include_completed: Option<bool>,
    include_archived: Option<bool>,
) -> Result<Vec<Task>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // 动态构建 WHERE 条件：None 表示不过滤，Some 表示按值过滤
    let mut conditions: Vec<String> = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(lid) = list_id {
        conditions.push("list_id = ?".to_string());
        params_vec.push(Box::new(lid));
    }
    if let Some(completed) = include_completed {
        conditions.push("completed = ?".to_string());
        params_vec.push(Box::new(completed));
    }
    if let Some(archived) = include_archived {
        conditions.push("archived = ?".to_string());
        params_vec.push(Box::new(archived));
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let sql = format!(
        "SELECT id, title, notes, priority, due_date, end_date, reminder, completed, archived, pinned, list_id, parent_id, repeat_rule, sort_order, created_at, updated_at FROM tasks {} ORDER BY pinned DESC, sort_order ASC, created_at DESC",
        where_clause
    );

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let mut tasks: Vec<Task> = stmt
        .query_map(params_refs.as_slice(), |row| {
            Ok(Task {
                id: row.get(0)?,
                title: row.get(1)?,
                notes: row.get(2)?,
                priority: row.get(3)?,
                due_date: row.get(4)?,
                end_date: row.get(5)?,
                reminder: row.get(6)?,
                completed: row.get(7)?,
                archived: row.get::<_, i64>(8)? != 0,
                pinned: row.get::<_, i64>(9)? != 0,
                list_id: row.get(10)?,
                parent_id: row.get(11)?,
                repeat_rule: row.get(12)?,
                sort_order: row.get(13)?,
                created_at: row.get(14)?,
                updated_at: row.get(15)?,
                tag_ids: Vec::new(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // 标签合并：使用 HashMap 代替 O(N*M) 线性查找
    let mut tag_stmt = conn
        .prepare("SELECT task_id, tag_id FROM task_tags")
        .map_err(|e| e.to_string())?;
    let tag_rows: Vec<(i64, i64)> = tag_stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut tag_map: HashMap<i64, Vec<i64>> = HashMap::new();
    for (task_id, tag_id) in tag_rows {
        tag_map.entry(task_id).or_default().push(tag_id);
    }
    for task in &mut tasks {
        if let Some(tags) = tag_map.remove(&task.id) {
            task.tag_ids = tags;
        }
    }

    Ok(tasks)
}

#[tauri::command]
pub fn create_task(state: State<DbState>, req: CreateTaskRequest) -> Result<Task, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = now_rfc3339();
    let sort_order = chrono::Local::now().timestamp_millis() as f64;

    conn.execute(
        "INSERT INTO tasks (title, notes, priority, due_date, end_date, reminder, list_id, parent_id, repeat_rule, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            req.title,
            req.notes,
            req.priority.unwrap_or(2),
            req.due_date,
            req.end_date,
            req.reminder,
            req.list_id,
            req.parent_id,
            req.repeat_rule,
            sort_order,
            now,
            now,
        ],
    ).map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    Ok(Task {
        id,
        title: req.title,
        notes: req.notes,
        priority: req.priority.unwrap_or(2),
        due_date: req.due_date,
        end_date: req.end_date,
        reminder: req.reminder,
        completed: false,
        archived: false,
        pinned: false,
        list_id: req.list_id,
        parent_id: req.parent_id,
        repeat_rule: req.repeat_rule,
        sort_order,
        created_at: now.clone(),
        updated_at: now,
        tag_ids: Vec::new(),
    })
}

#[tauri::command]
pub fn update_task(state: State<DbState>, id: i64, updates: UpdateTaskRequest) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = now_rfc3339();

    // 动态构建 UPDATE 语句
    let mut set_clauses: Vec<String> = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(ref title) = updates.title {
        set_clauses.push("title = ?".to_string());
        params_vec.push(Box::new(title.clone()));
    }
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
    if let Some(ref reminder) = updates.reminder {
        set_clauses.push("reminder = ?".to_string());
        params_vec.push(Box::new(reminder.clone()));
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
    if let Some(parent_id) = updates.parent_id {
        set_clauses.push("parent_id = ?".to_string());
        params_vec.push(Box::new(parent_id));
    }
    if let Some(ref repeat_rule) = updates.repeat_rule {
        set_clauses.push("repeat_rule = ?".to_string());
        params_vec.push(Box::new(repeat_rule.clone()));
    }
    if let Some(sort_order) = updates.sort_order {
        set_clauses.push("sort_order = ?".to_string());
        params_vec.push(Box::new(sort_order));
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

#[tauri::command]
pub fn delete_task(state: State<DbState>, id: i64) -> Result<(), String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    // P3-3: 事务包裹，确保级联删除的原子性
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    // 先删除关联的 task_tags，避免外键约束失败
    tx.execute("DELETE FROM task_tags WHERE task_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    // 删除子任务的 task_tags
    tx.execute(
        "DELETE FROM task_tags WHERE task_id IN (SELECT id FROM tasks WHERE parent_id = ?1)",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    // 删除子任务
    tx.execute("DELETE FROM tasks WHERE parent_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    // 最后删除任务本身
    tx.execute("DELETE FROM tasks WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn duplicate_task(state: State<DbState>, id: i64) -> Result<Task, String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = now_rfc3339();
    let sort_order = chrono::Local::now().timestamp_millis() as f64;

    // P3-3: 事务包裹，确保复制 + 标签关联的原子性
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // 查询原任务所有字段
    let task: (String, Option<String>, i64, Option<String>, Option<String>, Option<String>, bool, bool, bool, i64, Option<i64>, Option<String>, f64) = tx
        .query_row(
            "SELECT title, notes, priority, due_date, end_date, reminder, completed, archived, pinned, list_id, parent_id, repeat_rule, sort_order FROM tasks WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?, row.get(10)?, row.get(11)?, row.get(12)?)),
        )
        .map_err(|e| e.to_string())?;

    let (title, notes, priority, due_date, end_date, reminder, _completed, _archived, _pinned, list_id, parent_id, repeat_rule, _sort_order) = task;

    // 插入副本：completed=false, archived=false, pinned=false
    tx.execute(
        "INSERT INTO tasks (title, notes, priority, due_date, end_date, reminder, completed, archived, pinned, list_id, parent_id, repeat_rule, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 0, 0, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![title, notes, priority, due_date, end_date, reminder, list_id, parent_id, repeat_rule, sort_order, now, now],
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

    for tag_id in &tag_ids {
        tx.execute(
            "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
            params![new_id, tag_id],
        ).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(Task {
        id: new_id,
        title,
        notes,
        priority,
        due_date,
        end_date,
        reminder,
        completed: false,
        archived: false,
        pinned: false,
        list_id,
        parent_id,
        repeat_rule,
        sort_order,
        created_at: now.clone(),
        updated_at: now,
        tag_ids,
    })
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
        ).map_err(|e| e.to_string())?;
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
    ).map_err(|e| e.to_string())?;

    // 如果有重复规则，创建下一个周期的任务
    if let Some(ref rule) = repeat_rule {
        if !rule.is_empty() {
            let next_due = due_date.as_ref().and_then(|d| {
                compute_next_due_date(d, rule)
            });

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
                ).map_err(|e| e.to_string())?;
            }

            tx.commit().map_err(|e| e.to_string())?;
            return Ok(CompleteResult { new_task_id: Some(new_id) });
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
    let next = match rule.as_ref() {
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
                    let cand_wd = candidate.weekday().num_days_from_monday() as u32 + 1; // 1=周一
                    if weekdays.contains(&cand_wd) {
                        let cand_monday =
                            candidate.date_naive() - chrono::Duration::days(cand_wd as i64 - 1);
                        let weeks_diff = (cand_monday - local_monday).num_days() / 7;
                        if weeks_diff >= 0 && weeks_diff % interval == 0 {
                            return Some(candidate);
                        }
                    }
                    candidate = candidate + chrono::Duration::days(1);
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
                    let candidate_local =
                        chrono::Local.from_local_datetime(&naive_dt).single()?;
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
