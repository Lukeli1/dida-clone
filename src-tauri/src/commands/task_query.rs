use rusqlite::{params, Result};
use tauri::State;
use std::collections::HashMap;

use crate::db::{DbState, Task};
use super::super::now_rfc3339;

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
