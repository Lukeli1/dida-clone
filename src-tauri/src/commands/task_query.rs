use rusqlite::{params, Result};
use std::collections::{HashMap, HashSet};
use tauri::State;

use super::super::now_rfc3339;
use crate::db::{DbState, Task};

/// 查询任务列表。
///
/// 分页参数（P3-12）：
/// - `limit` / `offset`：None 或 0 表示不分页（返回全部，向后兼容）
/// - `view`：today=今日到期未完成，archived=仅归档，None=按 include_archived
/// - `tag_id`：只返回含该标签的任务
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn get_tasks(
    state: State<DbState>,
    list_id: Option<i64>,
    include_completed: Option<bool>,
    include_archived: Option<bool>,
    limit: Option<i64>,
    offset: Option<i64>,
    view: Option<String>,
    tag_id: Option<i64>,
) -> Result<Vec<Task>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // 动态构建 WHERE 条件：None 表示不过滤，Some 表示按值过滤
    let mut conditions: Vec<String> = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    // 普通业务查询始终排除已软删除任务
    conditions.push("deleted_at IS NULL".to_string());

    // 视图过滤（today/archived）
    if let Some(ref v) = view {
        match v.as_str() {
            "today" => {
                // 今日到期且未完成且未归档：用 RFC3339 格式的今日起止时间
                let now = chrono::Local::now();
                let today_start = now
                    .date_naive()
                    .and_hms_opt(0, 0, 0)
                    .unwrap()
                    .and_local_timezone(chrono::Local)
                    .unwrap();
                let today_end = now
                    .date_naive()
                    .and_hms_opt(23, 59, 59)
                    .unwrap()
                    .and_local_timezone(chrono::Local)
                    .unwrap();
                conditions.push("due_date IS NOT NULL".to_string());
                conditions.push("due_date >= ?".to_string());
                conditions.push("due_date <= ?".to_string());
                conditions.push("completed = 0".to_string());
                conditions.push("archived = 0".to_string());
                params_vec.push(Box::new(today_start.to_rfc3339()));
                params_vec.push(Box::new(today_end.to_rfc3339()));
            }
            "archived" => {
                conditions.push("archived = 1".to_string());
            }
            _ => {}
        }
    } else {
        // 无 view 时按原有 include_archived 过滤
        if let Some(archived) = include_archived {
            conditions.push("archived = ?".to_string());
            params_vec.push(Box::new(archived));
        }
    }

    if let Some(lid) = list_id {
        conditions.push("list_id = ?".to_string());
        params_vec.push(Box::new(lid));
    }
    if let Some(completed) = include_completed {
        conditions.push("completed = ?".to_string());
        params_vec.push(Box::new(completed));
    }

    // 标签过滤：子查询
    if let Some(tid) = tag_id {
        conditions.push("id IN (SELECT task_id FROM task_tags WHERE tag_id = ?)".to_string());
        params_vec.push(Box::new(tid));
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    // 分页：limit 为 Some 且 > 0 时才加 LIMIT/OFFSET
    let limit_clause = match limit {
        Some(l) if l > 0 => {
            let off = offset.unwrap_or(0);
            format!("LIMIT {} OFFSET {}", l, off)
        }
        _ => String::new(),
    };

    let sql = format!(
        "SELECT id, title, notes, priority, due_date, end_date, all_day, reminder, reminder_minutes, completed, completed_at, CASE WHEN completed = 1 THEN 'done' ELSE COALESCE(NULLIF(status, ''), 'todo') END AS status, archived, pinned, list_id, parent_id, repeat_rule, sort_order, created_at, updated_at, deleted_at FROM tasks {} ORDER BY pinned DESC, sort_order ASC, created_at DESC {}",
        where_clause, limit_clause
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
                all_day: row.get::<_, i64>(6)? != 0,
                reminder: row.get(7)?,
                reminder_minutes: row.get(8)?,
                completed: row.get(9)?,
                completed_at: row.get(10)?,
                status: row.get(11)?,
                archived: row.get::<_, i64>(12)? != 0,
                pinned: row.get::<_, i64>(13)? != 0,
                list_id: row.get(14)?,
                parent_id: row.get(15)?,
                repeat_rule: row.get(16)?,
                sort_order: row.get(17)?,
                created_at: row.get(18)?,
                updated_at: row.get(19)?,
                deleted_at: row.get(20)?,
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

/// 软删除任务：设置 deleted_at，递归标记全部后代。
///
/// 契约：
/// - 同一次级联删除使用同一个精确时间字符串；
/// - 已独立删除（deleted_at 非空）的后代不被覆盖；
/// - 不删除标签关联、附件、重复规则、完成记录、时间追踪、目标关联；
/// - parent_id 成环时有限遍历，不挂死；环上节点仍可被软删除。
pub fn do_delete_task(conn: &rusqlite::Connection, id: i64) -> Result<(), String> {
    let now = now_rfc3339();

    // 确认目标任务存在且尚未删除
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if exists == 0 {
        // 已删除或不存在：幂等视为成功
        return Ok(());
    }

    // 应用层 BFS 收集级联目标；visited 防御 parent_id 环导致无限展开
    let mut to_delete: Vec<i64> = Vec::new();
    let mut visited: HashSet<i64> = HashSet::new();
    let mut stack: Vec<i64> = vec![id];
    while let Some(current) = stack.pop() {
        if !visited.insert(current) {
            continue;
        }
        let active: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
                params![current],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if active == 0 {
            continue;
        }
        to_delete.push(current);

        let mut stmt = conn
            .prepare(
                "SELECT id FROM tasks WHERE parent_id = ?1 AND deleted_at IS NULL AND id != ?1",
            )
            .map_err(|e| e.to_string())?;
        let child_ids: Vec<i64> = stmt
            .query_map(params![current], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        for cid in child_ids {
            if !visited.contains(&cid) {
                stack.push(cid);
            }
        }
    }

    for tid in to_delete {
        conn.execute(
            "UPDATE tasks SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1 AND deleted_at IS NULL",
            params![tid, now],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn delete_task(state: State<DbState>, id: i64) -> Result<(), String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    // P3-3: 事务包裹，确保级联软删除的原子性
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    do_delete_task(&tx, id)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// 回收站条目：附带清单名与是否含同次连带子任务
#[derive(Debug, serde::Serialize)]
pub struct TrashedTask {
    #[serde(flatten)]
    pub task: Task,
    pub list_name: Option<String>,
    /// 是否包含与该顶层任务同次级联删除的子任务
    pub has_cascaded_children: bool,
    /// true：独立删除的后代，但任一祖先仍在回收站，当前不可恢复
    pub restore_blocked_by_deleted_ancestor: bool,
}

/// 父链遍历结果：用于环识别与回收站顶层隐藏判定。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ParentChainOutcome {
    /// 从 start 向上能回到 origin（任意长度环，origin 在环上）
    CycleToOrigin,
    /// 向上走到 NULL，是正常开树
    OpenTree,
    /// 撞到不含 origin 的环（例如环外子任务的父链进入环）
    CycleOther,
    /// 深度上限/缺失节点：保守处理
    Unknown,
}

/// 从 start 沿 parent_id 向上遍历，判断是否回到 origin。
fn classify_parent_chain(
    conn: &rusqlite::Connection,
    start: i64,
    origin: i64,
) -> Result<ParentChainOutcome, String> {
    let mut current = start;
    let mut visited: HashSet<i64> = HashSet::new();
    // origin 已视为访问过，避免把 origin 自身再当“普通节点”吞掉环检测
    visited.insert(origin);

    for _ in 0..64 {
        if current == origin {
            return Ok(ParentChainOutcome::CycleToOrigin);
        }
        if !visited.insert(current) {
            // 遇到不含 origin 的环
            return Ok(ParentChainOutcome::CycleOther);
        }
        let parent_id: Option<i64> = match conn.query_row(
            "SELECT parent_id FROM tasks WHERE id = ?1",
            params![current],
            |row| row.get(0),
        ) {
            Ok(pid) => pid,
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                return Ok(ParentChainOutcome::Unknown);
            }
            Err(e) => return Err(e.to_string()),
        };
        match parent_id {
            Some(pid) => current = pid,
            None => return Ok(ParentChainOutcome::OpenTree),
        }
    }
    // 深度上限：不因此隐藏恢复入口
    Ok(ParentChainOutcome::Unknown)
}

/// 从 start 沿 parent_id 向上走，是否能到达 target（用于识别环上的“假祖先”）。
fn parent_chain_reaches(
    conn: &rusqlite::Connection,
    start: i64,
    target: i64,
) -> Result<bool, String> {
    Ok(classify_parent_chain(conn, start, target)? == ParentChainOutcome::CycleToOrigin)
}

/// 判断任务是否存在仍在回收站中的严格祖先（不含自身）。
/// parent_id 成环时有限遍历，不挂死；环上互指的节点不视为阻塞祖先。
fn has_deleted_ancestor(conn: &rusqlite::Connection, task_id: i64) -> Result<bool, String> {
    let mut current = task_id;
    let mut visited: HashSet<i64> = HashSet::new();
    visited.insert(task_id);

    for _ in 0..64 {
        let parent_id: Option<i64> = conn
            .query_row(
                "SELECT parent_id FROM tasks WHERE id = ?1",
                params![current],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        match parent_id {
            Some(pid) => {
                if pid == current || !visited.insert(pid) {
                    // 自环或环：不再有可判定的严格祖先
                    return Ok(false);
                }
                let deleted_at: Option<String> = conn
                    .query_row(
                        "SELECT deleted_at FROM tasks WHERE id = ?1",
                        params![pid],
                        |row| row.get(0),
                    )
                    .map_err(|e| e.to_string())?;
                if deleted_at.is_some() {
                    // 若该“祖先”沿父链又能回到自身，说明是环上同伴，不阻塞恢复
                    if parent_chain_reaches(conn, pid, task_id)? {
                        return Ok(false);
                    }
                    return Ok(true);
                }
                current = pid;
            }
            None => return Ok(false),
        }
    }
    Ok(false)
}

/// 同次级联子任务判定：父任务已删且时间戳相同，且父链不是回到自身的环。
/// 任意长度 parent_id 环（自环/双环/三环+）均不隐藏，保证回收站恢复入口可达。
/// 父链深度超限或无法完整判定时保守展示（不隐藏）。
fn is_same_stamp_cascaded_child(
    conn: &rusqlite::Connection,
    task_id: i64,
    parent_id: Option<i64>,
    deleted_at: &str,
    parent_deleted_at: Option<&str>,
) -> Result<bool, String> {
    let Some(pid) = parent_id else {
        return Ok(false);
    };
    if pid == task_id {
        // 自环：顶层展示
        return Ok(false);
    }
    if parent_deleted_at != Some(deleted_at) {
        return Ok(false);
    }

    match classify_parent_chain(conn, pid, task_id)? {
        // 正常树，或父链进入不含自身的环：同戳子任务隐藏
        ParentChainOutcome::OpenTree | ParentChainOutcome::CycleOther => Ok(true),
        // 自身位于任意长度环：不隐藏
        ParentChainOutcome::CycleToOrigin => Ok(false),
        // 深度上限/缺失节点：保守展示，避免无恢复入口
        ParentChainOutcome::Unknown => Ok(false),
    }
}

/// 查询回收站：仅 deleted_at IS NOT NULL。
/// 不把“由父任务同次连带删除的子任务”作为独立顶层条目展示。
pub fn do_get_trashed_tasks(conn: &rusqlite::Connection) -> Result<Vec<TrashedTask>, String> {
    // 先取全部已删除任务，再在应用层做级联隐藏与环防御。
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.title, t.notes, t.priority, t.due_date, t.end_date, t.all_day,
                    t.reminder, t.reminder_minutes, t.completed, t.completed_at,
                    CASE WHEN t.completed = 1 THEN 'done' ELSE COALESCE(NULLIF(t.status, ''), 'todo') END AS status,
                    t.archived, t.pinned, t.list_id, t.parent_id, t.repeat_rule, t.sort_order,
                    t.created_at, t.updated_at, t.deleted_at, l.name,
                    EXISTS (
                      SELECT 1 FROM tasks c
                      WHERE c.parent_id = t.id
                        AND c.id != t.id
                        AND c.deleted_at IS NOT NULL
                        AND c.deleted_at = t.deleted_at
                    ) AS has_cascaded_children,
                    p.deleted_at AS parent_deleted_at,
                    p.parent_id AS parent_parent_id
             FROM tasks t
             LEFT JOIN lists l ON l.id = t.list_id
             LEFT JOIN tasks p ON p.id = t.parent_id
             WHERE t.deleted_at IS NOT NULL
             ORDER BY t.deleted_at DESC, t.updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let mut all_rows: Vec<(TrashedTask, Option<String>, Option<i64>)> = stmt
        .query_map([], |row| {
            Ok((
                TrashedTask {
                    task: Task {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        notes: row.get(2)?,
                        priority: row.get(3)?,
                        due_date: row.get(4)?,
                        end_date: row.get(5)?,
                        all_day: row.get::<_, i64>(6)? != 0,
                        reminder: row.get(7)?,
                        reminder_minutes: row.get(8)?,
                        completed: row.get(9)?,
                        completed_at: row.get(10)?,
                        status: row.get(11)?,
                        archived: row.get::<_, i64>(12)? != 0,
                        pinned: row.get::<_, i64>(13)? != 0,
                        list_id: row.get(14)?,
                        parent_id: row.get(15)?,
                        repeat_rule: row.get(16)?,
                        sort_order: row.get(17)?,
                        created_at: row.get(18)?,
                        updated_at: row.get(19)?,
                        deleted_at: row.get(20)?,
                        tag_ids: Vec::new(),
                    },
                    list_name: row.get(21)?,
                    has_cascaded_children: row.get::<_, i64>(22)? != 0,
                    restore_blocked_by_deleted_ancestor: false,
                },
                row.get::<_, Option<String>>(23)?,
                row.get::<_, Option<i64>>(24)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut rows: Vec<TrashedTask> = Vec::new();
    for (item, parent_deleted_at, _parent_parent_id) in all_rows.drain(..) {
        let deleted_at = item.task.deleted_at.clone().unwrap_or_default();
        let hide = is_same_stamp_cascaded_child(
            conn,
            item.task.id,
            item.task.parent_id,
            &deleted_at,
            parent_deleted_at.as_deref(),
        )?;
        if !hide {
            rows.push(item);
        }
    }

    // 祖先查询：独立删除的子/孙任务若任一祖先仍在回收站，则标记不可恢复
    for item in &mut rows {
        if item.task.parent_id.is_some() {
            item.restore_blocked_by_deleted_ancestor = has_deleted_ancestor(conn, item.task.id)?;
        }
    }

    Ok(rows)
}

#[tauri::command]
pub fn get_trashed_tasks(state: State<DbState>) -> Result<Vec<TrashedTask>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    do_get_trashed_tasks(&conn)
}

/// 恢复软删除任务。
///
/// - 恢复顶层：恢复自身 + deleted_at 与其完全相同的后代；
/// - 独立删除、时间不同的子任务不连带恢复；
/// - 恢复子任务前，任一祖先仍被删除则返回明确错误；
/// - parent_id 成环时有限遍历，不挂死。
pub fn do_restore_task(conn: &rusqlite::Connection, id: i64) -> Result<(), String> {
    let now = now_rfc3339();

    let (deleted_at, parent_id): (Option<String>, Option<i64>) = conn
        .query_row(
            "SELECT deleted_at, parent_id FROM tasks WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| format!("任务 #{} 不存在", id))?;

    let deleted_at = match deleted_at {
        Some(ts) => ts,
        None => return Err(format!("任务 #{} 不在回收站中", id)),
    };

    // 检查祖先链：任一严格祖先仍删除则拒绝恢复
    if parent_id.is_some() && has_deleted_ancestor(conn, id)? {
        return Err(
            "无法恢复：父任务仍在回收站中。请先恢复父任务，或确认祖先链路均已恢复。"
                .to_string(),
        );
    }

    // 应用层 BFS：恢复自身 + 同时间戳后代；visited 防御环
    let mut to_restore: Vec<i64> = Vec::new();
    let mut visited: HashSet<i64> = HashSet::new();
    let mut stack: Vec<i64> = vec![id];
    while let Some(current) = stack.pop() {
        if !visited.insert(current) {
            continue;
        }
        let stamp: Option<String> = conn
            .query_row(
                "SELECT deleted_at FROM tasks WHERE id = ?1",
                params![current],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if stamp.as_deref() != Some(deleted_at.as_str()) {
            continue;
        }
        to_restore.push(current);

        let mut stmt = conn
            .prepare(
                "SELECT id FROM tasks WHERE parent_id = ?1 AND deleted_at = ?2 AND id != ?1",
            )
            .map_err(|e| e.to_string())?;
        let child_ids: Vec<i64> = stmt
            .query_map(params![current, deleted_at], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        for cid in child_ids {
            if !visited.contains(&cid) {
                stack.push(cid);
            }
        }
    }

    for tid in to_restore {
        conn.execute(
            "UPDATE tasks SET deleted_at = NULL, updated_at = ?2 WHERE id = ?1 AND deleted_at = ?3",
            params![tid, now, deleted_at],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn restore_task(state: State<DbState>, id: i64) -> Result<(), String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    do_restore_task(&tx, id)?;
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

    // 查询原任务所有字段（拒绝回收站任务）
    #[allow(clippy::type_complexity)]
    let task: (String, Option<String>, i64, Option<String>, Option<String>, bool, Option<String>, Option<i64>, bool, bool, bool, i64, Option<i64>, Option<String>, f64) = tx
        .query_row(
            "SELECT title, notes, priority, due_date, end_date, all_day, reminder, reminder_minutes, completed, archived, pinned, list_id, parent_id, repeat_rule, sort_order \
             FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get::<_, i64>(5)? != 0, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?, row.get(10)?, row.get(11)?, row.get(12)?, row.get(13)?, row.get(14)?)),
        )
        .map_err(|_| format!("任务不存在或已移入回收站（#{}）", id))?;

    let (
        title,
        notes,
        priority,
        due_date,
        end_date,
        all_day,
        reminder,
        reminder_minutes,
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
        "INSERT INTO tasks (title, notes, priority, due_date, end_date, all_day, reminder, reminder_minutes, completed, completed_at, status, archived, pinned, list_id, parent_id, repeat_rule, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, NULL, 'todo', 0, 0, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![title, notes, priority, due_date, end_date, all_day, reminder, reminder_minutes, list_id, parent_id, repeat_rule, sort_order, now, now],
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
        all_day,
        reminder,
        reminder_minutes,
        completed: false,
        completed_at: None,
        status: "todo".to_string(),
        archived: false,
        pinned: false,
        list_id,
        parent_id,
        repeat_rule,
        sort_order,
        created_at: now.clone(),
        updated_at: now,
        deleted_at: None,
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

    /// P3-12 分页测试：limit + offset 返回不重复的任务子集
    #[test]
    fn test_pagination_limit_offset() {
        let conn = setup_db();
        // 插入 10 个任务
        for i in 0..10 {
            insert_task(&conn, &format!("任务{}", i));
        }

        // 第 1 页：limit=4, offset=0
        let page1: Vec<i64> = conn
            .prepare("SELECT id FROM tasks ORDER BY id ASC LIMIT 4 OFFSET 0")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        // 第 2 页：limit=4, offset=4
        let page2: Vec<i64> = conn
            .prepare("SELECT id FROM tasks ORDER BY id ASC LIMIT 4 OFFSET 4")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert_eq!(page1.len(), 4);
        assert_eq!(page2.len(), 4);
        // 两页无重复
        let mut all = page1.clone();
        all.extend(page2.iter());
        let unique: std::collections::HashSet<i64> = all.into_iter().collect();
        assert_eq!(unique.len(), 8, "两页任务 ID 不应重复");
    }

    /// P3-12 archived 视图过滤准确
    #[test]
    fn test_archived_view_filter() {
        let conn = setup_db();
        let t1 = insert_task(&conn, "普通任务");
        let t2 = insert_task(&conn, "归档任务");
        // 标记 t2 为归档
        conn.execute("UPDATE tasks SET archived = 1 WHERE id = ?1", params![t2])
            .unwrap();

        let archived_ids: Vec<i64> = conn
            .prepare("SELECT id FROM tasks WHERE archived = 1")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert_eq!(archived_ids, vec![t2]);

        let active_ids: Vec<i64> = conn
            .prepare("SELECT id FROM tasks WHERE archived = 0")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert_eq!(active_ids, vec![t1]);
    }

    /// 软删除：普通删除设置 deleted_at，行仍保留
    #[test]
    fn test_soft_delete_sets_deleted_at() {
        use super::do_delete_task;
        let conn = setup_db();
        let id = insert_task(&conn, "软删除任务");
        do_delete_task(&conn, id).unwrap();

        let deleted_at: Option<String> = conn
            .query_row(
                "SELECT deleted_at FROM tasks WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(deleted_at.is_some());

        let active: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(active, 0);
    }

    /// 删除父任务级联软删除全部后代，且共用同一 deleted_at
    #[test]
    fn test_soft_delete_cascades_descendants_same_timestamp() {
        use super::do_delete_task;
        let conn = setup_db();
        let parent = insert_task(&conn, "父");
        conn.execute(
            "INSERT INTO tasks (title, list_id, parent_id, created_at, updated_at) VALUES (?1, 1, ?2, ?3, ?4)",
            params!["子", parent, "2026-01-01T00:00:00", "2026-01-01T00:00:00"],
        )
        .unwrap();
        let child = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO tasks (title, list_id, parent_id, created_at, updated_at) VALUES (?1, 1, ?2, ?3, ?4)",
            params!["孙", child, "2026-01-01T00:00:00", "2026-01-01T00:00:00"],
        )
        .unwrap();
        let grand = conn.last_insert_rowid();

        do_delete_task(&conn, parent).unwrap();

        let stamps: Vec<Option<String>> = [parent, child, grand]
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
        assert!(stamps.iter().all(|s| s.is_some()));
        assert_eq!(stamps[0], stamps[1]);
        assert_eq!(stamps[1], stamps[2]);
    }

    /// 已独立删除的子任务，父任务删除时不覆盖其 deleted_at
    #[test]
    fn test_soft_delete_does_not_overwrite_existing_deleted_at() {
        use super::do_delete_task;
        let conn = setup_db();
        let parent = insert_task(&conn, "父");
        conn.execute(
            "INSERT INTO tasks (title, list_id, parent_id, created_at, updated_at, deleted_at) VALUES (?1, 1, ?2, ?3, ?4, ?5)",
            params![
                "已删子",
                parent,
                "2026-01-01T00:00:00",
                "2026-01-01T00:00:00",
                "2020-01-01T00:00:00Z"
            ],
        )
        .unwrap();
        let child = conn.last_insert_rowid();

        do_delete_task(&conn, parent).unwrap();

        let child_ts: String = conn
            .query_row(
                "SELECT deleted_at FROM tasks WHERE id = ?1",
                params![child],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(child_ts, "2020-01-01T00:00:00Z");
    }

    /// 恢复父任务仅恢复同次级联删除的后代
    #[test]
    fn test_restore_parent_only_same_timestamp_children() {
        use super::{do_delete_task, do_restore_task};
        let conn = setup_db();
        let parent = insert_task(&conn, "父");
        conn.execute(
            "INSERT INTO tasks (title, list_id, parent_id, created_at, updated_at) VALUES (?1, 1, ?2, ?3, ?4)",
            params!["同次子", parent, "2026-01-01T00:00:00", "2026-01-01T00:00:00"],
        )
        .unwrap();
        let same_child = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO tasks (title, list_id, parent_id, created_at, updated_at, deleted_at) VALUES (?1, 1, ?2, ?3, ?4, ?5)",
            params![
                "独立子",
                parent,
                "2026-01-01T00:00:00",
                "2026-01-01T00:00:00",
                "2019-01-01T00:00:00Z"
            ],
        )
        .unwrap();
        let indep_child = conn.last_insert_rowid();

        do_delete_task(&conn, parent).unwrap();
        do_restore_task(&conn, parent).unwrap();

        let parent_del: Option<String> = conn
            .query_row(
                "SELECT deleted_at FROM tasks WHERE id = ?1",
                params![parent],
                |row| row.get(0),
            )
            .unwrap();
        let same_del: Option<String> = conn
            .query_row(
                "SELECT deleted_at FROM tasks WHERE id = ?1",
                params![same_child],
                |row| row.get(0),
            )
            .unwrap();
        let indep_del: Option<String> = conn
            .query_row(
                "SELECT deleted_at FROM tasks WHERE id = ?1",
                params![indep_child],
                |row| row.get(0),
            )
            .unwrap();
        assert!(parent_del.is_none());
        assert!(same_del.is_none());
        assert_eq!(indep_del.as_deref(), Some("2019-01-01T00:00:00Z"));
    }

    /// 父任务未恢复时，恢复子任务失败
    #[test]
    fn test_restore_child_blocked_when_parent_deleted() {
        use super::{do_delete_task, do_restore_task};
        let conn = setup_db();
        let parent = insert_task(&conn, "父");
        conn.execute(
            "INSERT INTO tasks (title, list_id, parent_id, created_at, updated_at) VALUES (?1, 1, ?2, ?3, ?4)",
            params!["子", parent, "2026-01-01T00:00:00", "2026-01-01T00:00:00"],
        )
        .unwrap();
        let child = conn.last_insert_rowid();
        do_delete_task(&conn, parent).unwrap();

        let err = do_restore_task(&conn, child).unwrap_err();
        assert!(err.contains("父任务仍在回收站"));
    }

    /// 旧库迁移后 deleted_at 默认为空
    #[test]
    fn test_deleted_at_defaults_null_on_migration() {
        let conn = setup_db();
        let id = insert_task(&conn, "旧任务");
        let deleted_at: Option<String> = conn
            .query_row(
                "SELECT deleted_at FROM tasks WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(deleted_at.is_none());
    }

    /// P3-12 completed 过滤准确
    #[test]
    fn test_completed_filter() {
        let conn = setup_db();
        let t1 = insert_task(&conn, "未完成");
        let t2 = insert_task(&conn, "已完成");
        conn.execute("UPDATE tasks SET completed = 1 WHERE id = ?1", params![t2])
            .unwrap();

        let completed: Vec<i64> = conn
            .prepare("SELECT id FROM tasks WHERE completed = 1 AND deleted_at IS NULL")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert_eq!(completed, vec![t2]);

        let incomplete: Vec<i64> = conn
            .prepare("SELECT id FROM tasks WHERE completed = 0 AND deleted_at IS NULL")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert_eq!(incomplete, vec![t1]);
    }

    /// 同次级联删除的子任务不作为独立回收站条目
    #[test]
    fn test_get_trashed_tasks_hides_same_timestamp_cascaded_children() {
        use super::{do_delete_task, do_get_trashed_tasks};
        let conn = setup_db();
        let parent = insert_task(&conn, "父");
        conn.execute(
            "INSERT INTO tasks (title, list_id, parent_id, created_at, updated_at) VALUES (?1, 1, ?2, ?3, ?4)",
            params!["子", parent, "2026-01-01T00:00:00", "2026-01-01T00:00:00"],
        )
        .unwrap();
        let child = conn.last_insert_rowid();

        do_delete_task(&conn, parent).unwrap();
        let trashed = do_get_trashed_tasks(&conn).unwrap();
        let ids: Vec<i64> = trashed.iter().map(|t| t.task.id).collect();
        assert_eq!(ids, vec![parent], "同次级联子任务不应单独展示");
        assert!(!ids.contains(&child));
        assert!(trashed[0].has_cascaded_children);
        assert!(!trashed[0].restore_blocked_by_deleted_ancestor);
    }

    /// 独立删除孙任务后再删除祖/父：孙任务仍独立展示且 blocked
    #[test]
    fn test_get_trashed_tasks_marks_blocked_grandchild_after_parent_delete() {
        use super::{do_delete_task, do_get_trashed_tasks, do_restore_task};
        let conn = setup_db();
        let parent = insert_task(&conn, "父");
        conn.execute(
            "INSERT INTO tasks (title, list_id, parent_id, created_at, updated_at) VALUES (?1, 1, ?2, ?3, ?4)",
            params!["子", parent, "2026-01-01T00:00:00", "2026-01-01T00:00:00"],
        )
        .unwrap();
        let child = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO tasks (title, list_id, parent_id, created_at, updated_at) VALUES (?1, 1, ?2, ?3, ?4)",
            params!["孙", child, "2026-01-01T00:00:00", "2026-01-01T00:00:00"],
        )
        .unwrap();
        let grand = conn.last_insert_rowid();

        // 先独立删除孙任务
        do_delete_task(&conn, grand).unwrap();
        // 再删除父任务（级联删除子任务）
        do_delete_task(&conn, parent).unwrap();

        let trashed = do_get_trashed_tasks(&conn).unwrap();
        let by_id: std::collections::HashMap<i64, &super::TrashedTask> =
            trashed.iter().map(|t| (t.task.id, t)).collect();

        assert!(by_id.contains_key(&parent), "父任务应在回收站");
        assert!(by_id.contains_key(&grand), "独立删除的孙任务应仍独立展示");
        assert!(!by_id.contains_key(&child), "同次级联的子任务不独立展示");

        let grand_item = by_id.get(&grand).unwrap();
        assert!(
            grand_item.restore_blocked_by_deleted_ancestor,
            "祖先仍在回收站时应 blocked"
        );

        let err = do_restore_task(&conn, grand).unwrap_err();
        assert!(err.contains("父任务仍在回收站"));
    }

    /// 恢复后核心字段与完成状态保持不变（仅清除 deleted_at）
    #[test]
    fn test_restore_preserves_fields_and_completed_status() {
        use super::{do_delete_task, do_restore_task};
        let conn = setup_db();
        conn.execute(
            "INSERT INTO tasks (title, notes, priority, due_date, end_date, all_day, reminder, completed, completed_at, status, list_id, repeat_rule, sort_order, created_at, updated_at)
             VALUES (?1, ?2, 1, ?3, ?4, 1, ?5, 1, ?6, 'done', 1, 'FREQ=DAILY', 42.0, ?7, ?7)",
            params![
                "已完成重复任务",
                "备注保留",
                "2026-07-01T09:00:00+08:00",
                "2026-07-01T10:00:00+08:00",
                "2026-07-01T08:45:00+08:00",
                "2026-07-01T09:05:00+08:00",
                "2026-07-01T00:00:00+08:00"
            ],
        )
        .unwrap();
        let id = conn.last_insert_rowid();
        link_tag(&conn, id, 1);

        do_delete_task(&conn, id).unwrap();
        do_restore_task(&conn, id).unwrap();

        let (
            title,
            notes,
            priority,
            due_date,
            end_date,
            all_day,
            reminder,
            completed,
            completed_at,
            status,
            repeat_rule,
            sort_order,
            deleted_at,
        ): (
            String,
            Option<String>,
            i64,
            Option<String>,
            Option<String>,
            i64,
            Option<String>,
            i64,
            Option<String>,
            String,
            Option<String>,
            f64,
            Option<String>,
        ) = conn
            .query_row(
                "SELECT title, notes, priority, due_date, end_date, all_day, reminder, completed, completed_at, status, repeat_rule, sort_order, deleted_at
                 FROM tasks WHERE id = ?1",
                params![id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                        row.get(6)?,
                        row.get(7)?,
                        row.get(8)?,
                        row.get(9)?,
                        row.get(10)?,
                        row.get(11)?,
                        row.get(12)?,
                    ))
                },
            )
            .unwrap();

        assert!(deleted_at.is_none());
        assert_eq!(title, "已完成重复任务");
        assert_eq!(notes.as_deref(), Some("备注保留"));
        assert_eq!(priority, 1);
        assert_eq!(due_date.as_deref(), Some("2026-07-01T09:00:00+08:00"));
        assert_eq!(end_date.as_deref(), Some("2026-07-01T10:00:00+08:00"));
        assert_eq!(all_day, 1);
        assert_eq!(reminder.as_deref(), Some("2026-07-01T08:45:00+08:00"));
        assert_eq!(completed, 1);
        assert_eq!(completed_at.as_deref(), Some("2026-07-01T09:05:00+08:00"));
        assert_eq!(status, "done");
        assert_eq!(repeat_rule.as_deref(), Some("FREQ=DAILY"));
        assert_eq!(sort_order, 42.0);

        let tag_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM task_tags WHERE task_id = ?1 AND tag_id = 1",
                params![id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(tag_count, 1, "恢复不得丢失标签关联");
    }

    /// 软删除不物理删除行，附件引用应保留
    #[test]
    fn test_soft_delete_preserves_attachment_rows() {
        use super::do_delete_task;
        let conn = setup_db();
        let id = insert_task(&conn, "带附件");
        conn.execute(
            "INSERT INTO attachments (task_id, file_name, file_path, file_size, mime_type, created_at)
             VALUES (?1, 'a.txt', '/tmp/a.txt', 12, 'text/plain', ?2)",
            params![id, "2026-07-01T00:00:00Z"],
        )
        .unwrap();

        do_delete_task(&conn, id).unwrap();

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM attachments WHERE task_id = ?1",
                params![id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1, "软删除不得级联物理删除附件行");
    }

    /// 重复恢复活跃任务应明确失败，不能静默复制
    #[test]
    fn test_restore_active_task_is_rejected() {
        use super::do_restore_task;
        let conn = setup_db();
        let id = insert_task(&conn, "活跃");
        let err = do_restore_task(&conn, id).unwrap_err();
        assert!(err.contains("不在回收站"));
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM tasks WHERE title = '活跃'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 1);
    }

    /// 父+子先后独立 delete 会拆开时间戳；恢复父后独立子仍删除（契约回归）
    #[test]
    fn test_separate_parent_child_deletes_split_timestamps() {
        use super::{do_delete_task, do_restore_task};
        let conn = setup_db();
        let parent = insert_task(&conn, "父");
        conn.execute(
            "INSERT INTO tasks (title, list_id, parent_id, created_at, updated_at) VALUES (?1, 1, ?2, ?3, ?4)",
            params!["子", parent, "2026-01-01T00:00:00", "2026-01-01T00:00:00"],
        )
        .unwrap();
        let child = conn.last_insert_rowid();

        do_delete_task(&conn, child).unwrap();
        // 确保时间戳不同
        std::thread::sleep(std::time::Duration::from_millis(5));
        do_delete_task(&conn, parent).unwrap();

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
        assert_ne!(parent_ts, child_ts, "独立删除应保留不同时间戳");

        do_restore_task(&conn, parent).unwrap();
        let child_still: Option<String> = conn
            .query_row(
                "SELECT deleted_at FROM tasks WHERE id = ?1",
                params![child],
                |row| row.get(0),
            )
            .unwrap();
        assert!(
            child_still.is_some(),
            "独立删除的子任务不应随父任务恢复"
        );
    }

    /// 回归：自环 parent_id 不得使软删除挂死，且目标应被软删除并出现在回收站
    #[test]
    fn test_soft_delete_self_loop_parent_terminates() {
        use super::{do_delete_task, do_get_trashed_tasks, do_restore_task};
        let conn = setup_db();
        let id = insert_task(&conn, "自环");
        conn.execute(
            "UPDATE tasks SET parent_id = ?1 WHERE id = ?1",
            params![id],
        )
        .unwrap();

        do_delete_task(&conn, id).unwrap();
        let deleted_at: Option<String> = conn
            .query_row(
                "SELECT deleted_at FROM tasks WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(deleted_at.is_some(), "自环任务也应被软删除");

        let trashed = do_get_trashed_tasks(&conn).unwrap();
        assert!(
            trashed.iter().any(|t| t.task.id == id),
            "自环任务删除后必须出现在回收站顶层，保证可恢复"
        );

        do_restore_task(&conn, id).unwrap();
        let after: Option<String> = conn
            .query_row(
                "SELECT deleted_at FROM tasks WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(after.is_none(), "自环任务应可恢复");
    }

    /// 回归：双节点 parent 环不得使祖先检查挂死，且删除后仍可恢复
    #[test]
    fn test_has_deleted_ancestor_dual_cycle_terminates() {
        use super::{do_delete_task, do_get_trashed_tasks, do_restore_task};
        let conn = setup_db();
        let a = insert_task(&conn, "环A");
        let b = insert_task(&conn, "环B");
        conn.execute("UPDATE tasks SET parent_id = ?1 WHERE id = ?2", params![b, a]).unwrap();
        conn.execute("UPDATE tasks SET parent_id = ?1 WHERE id = ?2", params![a, b]).unwrap();

        // 删除 A 会因 B.parent_id=A 级联到 B（同戳）
        do_delete_task(&conn, a).unwrap();
        let trashed = do_get_trashed_tasks(&conn).unwrap();
        assert!(
            trashed.iter().any(|t| t.task.id == a || t.task.id == b),
            "环任务删除后应至少有一个顶层回收站入口"
        );
        // 环上节点不应因互为父而永久 blocked
        assert!(
            trashed
                .iter()
                .all(|t| !t.restore_blocked_by_deleted_ancestor),
            "双环同戳删除后不应全部 blocked"
        );

        // 恢复任一入口：应可完成，且同戳环同伴一并恢复
        let restore_id = trashed[0].task.id;
        do_restore_task(&conn, restore_id).unwrap();
        for id in [a, b] {
            let deleted_at: Option<String> = conn
                .query_row(
                    "SELECT deleted_at FROM tasks WHERE id = ?1",
                    params![id],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(
                deleted_at.is_none(),
                "恢复环入口后 id={} 应恢复",
                id
            );
        }
    }

    /// 回归：三节点环 A→B→C→A 同次删除后回收站不得空入口，且可恢复全环
    #[test]
    fn test_three_node_cycle_trash_entry_and_restore() {
        use super::{do_delete_task, do_get_trashed_tasks, do_restore_task};
        let conn = setup_db();
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

        // 删除任一节点：BFS 会沿 parent 反向（children）扩展到整环
        do_delete_task(&conn, a).unwrap();

        for id in [a, b, c] {
            let deleted_at: Option<String> = conn
                .query_row(
                    "SELECT deleted_at FROM tasks WHERE id = ?1",
                    params![id],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(deleted_at.is_some(), "三环删除后 id={} 应被软删除", id);
        }

        let trashed = do_get_trashed_tasks(&conn).unwrap();
        let top_ids: Vec<i64> = trashed.iter().map(|t| t.task.id).collect();
        assert!(
            !top_ids.is_empty(),
            "三节点环同戳删除后回收站不得无顶层入口"
        );
        assert!(
            top_ids.iter().any(|id| [a, b, c].contains(id)),
            "顶层入口应来自环上任务，got={:?}",
            top_ids
        );
        // 保守策略：环上节点均可展示（至少不全部隐藏）
        assert!(
            trashed
                .iter()
                .filter(|t| [a, b, c].contains(&t.task.id))
                .all(|t| !t.restore_blocked_by_deleted_ancestor),
            "三环同戳节点不应全部 blocked"
        );

        let restore_id = *top_ids
            .iter()
            .find(|id| [a, b, c].contains(id))
            .expect("应有环上恢复入口");
        do_restore_task(&conn, restore_id).unwrap();

        for id in [a, b, c] {
            let deleted_at: Option<String> = conn
                .query_row(
                    "SELECT deleted_at FROM tasks WHERE id = ?1",
                    params![id],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(
                deleted_at.is_none(),
                "恢复环入口后 id={} 应恢复为活跃",
                id
            );
        }
    }

    /// 回归：环外挂接在环上的同次后代仍可隐藏；环上入口保留
    #[test]
    fn test_cycle_external_same_stamp_child_can_hide() {
        use super::{do_delete_task, do_get_trashed_tasks};
        let conn = setup_db();
        let a = insert_task(&conn, "环A");
        let b = insert_task(&conn, "环B");
        let c = insert_task(&conn, "环C");
        conn.execute("UPDATE tasks SET parent_id = ?1 WHERE id = ?2", params![b, a])
            .unwrap();
        conn.execute("UPDATE tasks SET parent_id = ?1 WHERE id = ?2", params![c, b])
            .unwrap();
        conn.execute("UPDATE tasks SET parent_id = ?1 WHERE id = ?2", params![a, c])
            .unwrap();
        // 环外子任务 D，parent=A
        conn.execute(
            "INSERT INTO tasks (title, list_id, parent_id, created_at, updated_at) VALUES (?1, 1, ?2, ?3, ?3)",
            params!["环外D", a, "2026-01-01T00:00:00"],
        )
        .unwrap();
        let d = conn.last_insert_rowid();

        do_delete_task(&conn, a).unwrap();
        let trashed = do_get_trashed_tasks(&conn).unwrap();
        let top_ids: Vec<i64> = trashed.iter().map(|t| t.task.id).collect();
        assert!(
            top_ids.iter().any(|id| [a, b, c].contains(id)),
            "环上应有入口"
        );
        assert!(
            !top_ids.contains(&d),
            "环外同戳子任务 D 应按正常级联隐藏，got={:?}",
            top_ids
        );
    }
}
