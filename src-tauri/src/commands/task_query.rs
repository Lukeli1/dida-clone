use rusqlite::{params, Result};
use std::collections::HashMap;
use tauri::State;

use super::super::now_rfc3339;
use crate::db::{DbState, Task};

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

    // 标签合并（P3-12 优化）：只查询当前返回任务的标签关系，不再全表扫描 task_tags。
    // 旧实现 `SELECT task_id, tag_id FROM task_tags` 会取出全部标签关系，
    // 任务量上升后启动和筛选变慢；现在用 IN (?) 限定到当前任务 ID 集合。
    if tasks.is_empty() {
        return Ok(tasks);
    }
    let task_ids: Vec<i64> = tasks.iter().map(|t| t.id).collect();
    // 构建 IN 占位符：?,?,...
    let placeholders: Vec<String> = task_ids.iter().map(|_| "?".to_string()).collect();
    let in_clause = placeholders.join(",");
    let tag_sql = format!(
        "SELECT task_id, tag_id FROM task_tags WHERE task_id IN ({})",
        in_clause
    );

    let mut tag_stmt = conn.prepare(&tag_sql).map_err(|e| e.to_string())?;
    // IN 子句参数：任务 ID 列表
    let tag_params: Vec<&dyn rusqlite::ToSql> = task_ids
        .iter()
        .map(|id| id as &dyn rusqlite::ToSql)
        .collect();
    let tag_rows: Vec<(i64, i64)> = tag_stmt
        .query_map(tag_params.as_slice(), |row| Ok((row.get(0)?, row.get(1)?)))
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
    #[allow(clippy::type_complexity)]
    let task: (String, Option<String>, i64, Option<String>, Option<String>, Option<String>, bool, bool, bool, i64, Option<i64>, Option<String>, f64) = tx
        .query_row(
            "SELECT title, notes, priority, due_date, end_date, reminder, completed, archived, pinned, list_id, parent_id, repeat_rule, sort_order FROM tasks WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?, row.get(10)?, row.get(11)?, row.get(12)?)),
        )
        .map_err(|e| e.to_string())?;

    let (
        title,
        notes,
        priority,
        due_date,
        end_date,
        reminder,
        _completed,
        _archived,
        _pinned,
        list_id,
        parent_id,
        repeat_rule,
        _sort_order,
    ) = task;

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
        )
        .map_err(|e| e.to_string())?;
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

#[cfg(test)]
mod tests {
    use crate::db::init_schema;
    use rusqlite::params;
    use std::collections::HashMap;

    /// 辅助：创建内存数据库并初始化 schema
    fn setup_db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        conn
    }

    /// 插入一条任务，返回 id
    fn insert_task(conn: &rusqlite::Connection, title: &str) -> i64 {
        conn.execute(
            "INSERT INTO tasks (title, list_id, created_at, updated_at) VALUES (?1, 1, ?2, ?3)",
            params![title, "2026-01-01T00:00:00", "2026-01-01T00:00:00"],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    /// 关联任务与标签
    fn link_tag(conn: &rusqlite::Connection, task_id: i64, tag_id: i64) {
        conn.execute(
            "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
            params![task_id, tag_id],
        )
        .unwrap();
    }

    /// P3-12 验收：1000 任务 + 3000 标签关系，只查 20 个任务时，返回标签关系只包含这 20 个任务。
    #[test]
    fn test_tag_query_only_returns_selected_tasks() {
        let conn = setup_db();
        // 插入 1000 个任务
        let mut all_task_ids: Vec<i64> = Vec::new();
        for i in 0..1000 {
            all_task_ids.push(insert_task(&conn, &format!("任务{}", i)));
        }
        // 每个任务关联 3 个标签（共 3000 条标签关系）
        for &tid in &all_task_ids {
            for tag_id in 1..=3 {
                link_tag(&conn, tid, tag_id);
            }
        }

        // 模拟 get_tasks 只取前 20 个任务的标签关系（IN 子句）
        let selected: Vec<i64> = all_task_ids.iter().take(20).copied().collect();
        let placeholders: Vec<String> = selected.iter().map(|_| "?".to_string()).collect();
        let in_clause = placeholders.join(",");
        let sql = format!(
            "SELECT task_id, tag_id FROM task_tags WHERE task_id IN ({})",
            in_clause
        );
        let tag_params: Vec<&dyn rusqlite::ToSql> = selected
            .iter()
            .map(|id| id as &dyn rusqlite::ToSql)
            .collect();

        let mut stmt = conn.prepare(&sql).unwrap();
        let rows: Vec<(i64, i64)> = stmt
            .query_map(tag_params.as_slice(), |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        // 应只包含 20 个任务，每任务 3 条 = 60 条
        assert_eq!(rows.len(), 60, "应只返回 20 个任务的标签关系");

        // 验证每条记录的 task_id 都在 selected 中
        let selected_set: std::collections::HashSet<i64> = selected.iter().copied().collect();
        for (task_id, _) in &rows {
            assert!(
                selected_set.contains(task_id),
                "返回了未选中的任务 {}",
                task_id
            );
        }

        // 验证未选中的任务（如第 21 个）不在结果中
        let unselected = all_task_ids[20];
        for (task_id, _) in &rows {
            assert_ne!(
                *task_id, unselected,
                "未选中的任务 {} 不应出现在结果中",
                unselected
            );
        }
    }

    /// 验证标签关系正确按任务分组
    #[test]
    fn test_tag_grouping_by_task() {
        let conn = setup_db();
        let t1 = insert_task(&conn, "任务1");
        let t2 = insert_task(&conn, "任务2");
        link_tag(&conn, t1, 1);
        link_tag(&conn, t1, 2);
        link_tag(&conn, t2, 3);

        let selected = [t1, t2];
        let placeholders: Vec<String> = selected.iter().map(|_| "?".to_string()).collect();
        let in_clause = placeholders.join(",");
        let sql = format!(
            "SELECT task_id, tag_id FROM task_tags WHERE task_id IN ({})",
            in_clause
        );
        let tag_params: Vec<&dyn rusqlite::ToSql> = selected
            .iter()
            .map(|id| id as &dyn rusqlite::ToSql)
            .collect();

        let mut stmt = conn.prepare(&sql).unwrap();
        let rows: Vec<(i64, i64)> = stmt
            .query_map(tag_params.as_slice(), |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        let mut tag_map: HashMap<i64, Vec<i64>> = HashMap::new();
        for (task_id, tag_id) in rows {
            tag_map.entry(task_id).or_default().push(tag_id);
        }

        assert_eq!(tag_map.get(&t1).unwrap().len(), 2);
        assert_eq!(tag_map.get(&t2).unwrap().len(), 1);
    }
}
