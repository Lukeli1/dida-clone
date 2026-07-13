// 时间追踪相关命令（Time tracking commands）
//
// 包含任务级时间追踪的计时开始/停止、记录查询/删除以及按维度统计。
// 每段记录保存 start_time/end_time/duration_secs，用于任务详情与统计面板展示。
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

use super::now_rfc3339;
use crate::db::DbState;

/// 时间追踪记录条目（与 time_entries 表对齐）
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TimeEntry {
    pub id: i64,
    pub task_id: i64,
    pub start_time: String,
    pub end_time: Option<String>,
    pub duration_secs: i64,
    pub note: Option<String>,
    pub created_at: String,
}

/// 时间统计聚合结果项（按 task / list / day 维度分组）
#[derive(Debug, Serialize)]
pub struct TimeStat {
    pub label: String,
    pub seconds: i64,
}

/// 辅助函数：从数据库行构造 TimeEntry
fn row_to_time_entry(row: &rusqlite::Row) -> rusqlite::Result<TimeEntry> {
    Ok(TimeEntry {
        id: row.get(0)?,
        task_id: row.get(1)?,
        start_time: row.get(2)?,
        end_time: row.get(3)?,
        duration_secs: row.get(4)?,
        note: row.get(5)?,
        created_at: row.get(6)?,
    })
}

/// 开始计时：为指定任务插入一条 end_time 为空、duration_secs 为 0 的记录，返回记录 id。
/// 全局只允许一个 active entry（end_time IS NULL），若已存在则返回错误。
#[tauri::command]
pub fn start_time_tracking(task_id: i64, state: State<DbState>) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    do_start_time_tracking(&conn, task_id)
}

/// 内部函数：开始计时（接收 &Connection，便于测试）
pub fn do_start_time_tracking(conn: &rusqlite::Connection, task_id: i64) -> Result<i64, String> {
    // 检查是否已存在未结束的计时记录
    let active: Option<(i64, i64)> = conn
        .query_row(
            "SELECT id, task_id FROM time_entries WHERE end_time IS NULL LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();

    if let Some((_active_id, _active_task_id)) = active {
        return Err("已有任务正在计时，请先停止当前计时".to_string());
    }

    let now = now_rfc3339();
    conn.execute(
        "INSERT INTO time_entries (task_id, start_time, duration_secs, created_at) VALUES (?1, ?2, 0, ?3)",
        params![task_id, now, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

/// 停止计时：根据 start_time 计算时长，写入 end_time 与 duration_secs，返回更新后的条目。
#[tauri::command]
pub fn stop_time_tracking(entry_id: i64, state: State<DbState>) -> Result<TimeEntry, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // 查询 start_time
    let start_time: String = conn
        .query_row(
            "SELECT start_time FROM time_entries WHERE id = ?1",
            params![entry_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("查询计时记录失败: {}", e))?;

    // 计算 duration
    let start_dt = chrono::DateTime::parse_from_rfc3339(&start_time)
        .map_err(|e| format!("解析开始时间失败: {}", e))?
        .with_timezone(&chrono::Local);
    let end_dt = chrono::Local::now();
    let duration_secs = (end_dt - start_dt).num_seconds().max(0);
    let end_time = end_dt.to_rfc3339();

    conn.execute(
        "UPDATE time_entries SET end_time = ?1, duration_secs = ?2 WHERE id = ?3",
        params![end_time, duration_secs, entry_id],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, task_id, start_time, end_time, duration_secs, note, created_at FROM time_entries WHERE id = ?1",
        params![entry_id],
        row_to_time_entry,
    )
    .map_err(|e| e.to_string())
}

/// 查询时间追踪记录，可按 task_id 与日期范围筛选（end_time 非空的已结束记录）。
#[tauri::command]
pub fn get_time_entries(
    task_id: Option<i64>,
    date_start: Option<String>,
    date_end: Option<String>,
    state: State<DbState>,
) -> Result<Vec<TimeEntry>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT id, task_id, start_time, end_time, duration_secs, note, created_at FROM time_entries WHERE end_time IS NOT NULL",
    );
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(tid) = task_id {
        sql.push_str(" AND task_id = ?");
        params_vec.push(Box::new(tid));
    }
    if let Some(ref start) = date_start {
        sql.push_str(" AND start_time >= ?");
        params_vec.push(Box::new(start.clone()));
    }
    if let Some(ref end) = date_end {
        sql.push_str(" AND start_time <= ?");
        params_vec.push(Box::new(end.clone()));
    }
    sql.push_str(" ORDER BY start_time DESC");

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let entries = stmt
        .query_map(params_refs.as_slice(), row_to_time_entry)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(entries)
}

/// 删除指定时间追踪记录。
#[tauri::command]
pub fn delete_time_entry(entry_id: i64, state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM time_entries WHERE id = ?1", params![entry_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 按维度统计时间分布（group_by: "task" | "list" | "day"），可按日期范围筛选。
/// 返回 [{ label, seconds }]，seconds 为已结束记录的 duration_secs 之和。
#[tauri::command]
pub fn get_time_stats(
    group_by: String,
    date_start: Option<String>,
    date_end: Option<String>,
    state: State<DbState>,
) -> Result<Vec<TimeStat>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // 根据 group_by 选择不同的 label 字段
    let (label_expr, extra_join) = match group_by.as_str() {
        "task" => (
            "COALESCE(t.title, '已删除任务')".to_string(),
            "LEFT JOIN tasks t ON te.task_id = t.id",
        ),
        "list" => (
            "COALESCE(l.name, '未分类')".to_string(),
            "LEFT JOIN tasks t ON te.task_id = t.id LEFT JOIN lists l ON t.list_id = l.id",
        ),
        "day" => ("date(te.start_time)".to_string(), ""),
        _ => {
            return Err(format!("不支持的分组维度: {}", group_by));
        }
    };

    let mut sql = format!(
        "SELECT {label} AS label, SUM(te.duration_secs) AS seconds
         FROM time_entries te
         {join}
         WHERE te.end_time IS NOT NULL",
        label = label_expr,
        join = extra_join,
    );

    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    if let Some(ref start) = date_start {
        sql.push_str(" AND te.start_time >= ?");
        params_vec.push(Box::new(start.clone()));
    }
    if let Some(ref end) = date_end {
        sql.push_str(" AND te.start_time <= ?");
        params_vec.push(Box::new(end.clone()));
    }
    sql.push_str(" GROUP BY label ORDER BY seconds DESC");

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let stats = stmt
        .query_map(params_refs.as_slice(), |row| {
            Ok(TimeStat {
                label: row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                seconds: row.get::<_, Option<i64>>(1)?.unwrap_or(0),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(stats)
}

/// 新增历史时间记录（已结束的 time entry），用于番茄钟等场景写入已完成专注。
/// 不影响 active entry 约束，因为此记录 end_time 不为空。
#[tauri::command]
pub fn add_time_entry(
    task_id: i64,
    start_time: String,
    end_time: String,
    duration_secs: i64,
    note: Option<String>,
    state: State<DbState>,
) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    do_add_time_entry(&conn, task_id, &start_time, &end_time, duration_secs, note)
}

/// 内部函数：新增历史时间记录（接收 &Connection，便于测试）
pub fn do_add_time_entry(
    conn: &rusqlite::Connection,
    task_id: i64,
    start_time: &str,
    end_time: &str,
    duration_secs: i64,
    note: Option<String>,
) -> Result<i64, String> {
    // 校验 task_id 存在且未软删除
    let task_exists: bool = conn
        .query_row(
            "SELECT 1 FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
            params![task_id],
            |_| Ok(true),
        )
        .unwrap_or(false);
    if !task_exists {
        return Err(format!("任务不存在: task_id = {}", task_id));
    }

    // 校验 duration_secs > 0
    if duration_secs <= 0 {
        return Err("duration_secs 必须大于 0".to_string());
    }

    let now = now_rfc3339();
    conn.execute(
        "INSERT INTO time_entries (task_id, start_time, end_time, duration_secs, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![task_id, start_time, end_time, duration_secs, note, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_schema;

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

    fn count_active_entries(conn: &rusqlite::Connection) -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM time_entries WHERE end_time IS NULL",
            [],
            |row| row.get(0),
        )
        .unwrap()
    }

    fn stop_entry(conn: &rusqlite::Connection, entry_id: i64) {
        conn.execute(
            "UPDATE time_entries SET end_time = ?1, duration_secs = 60 WHERE id = ?2",
            params!["2026-01-01T00:01:00", entry_id],
        )
        .unwrap();
    }

    // ===== 阶段 3 测试：单活跃记录约束 =====

    #[test]
    fn test_start_time_tracking_first_succeeds() {
        let conn = setup_db();
        let task_id = insert_task(&conn, "任务 A");

        let result = do_start_time_tracking(&conn, task_id);
        assert!(result.is_ok());
        assert!(result.unwrap() > 0);
        assert_eq!(count_active_entries(&conn), 1);
    }

    #[test]
    fn test_start_time_tracking_second_fails() {
        let conn = setup_db();
        let task_a = insert_task(&conn, "任务 A");
        let task_b = insert_task(&conn, "任务 B");

        // 第一次 start 成功
        let first = do_start_time_tracking(&conn, task_a);
        assert!(first.is_ok());

        // 第二次 start 应返回错误
        let second = do_start_time_tracking(&conn, task_b);
        assert!(second.is_err());
        let err_msg = second.unwrap_err();
        assert!(
            err_msg.contains("已有任务正在计时"),
            "错误信息应包含提示: {}",
            err_msg
        );

        // active entry 数量仍为 1
        assert_eq!(count_active_entries(&conn), 1);
    }

    #[test]
    fn test_start_time_tracking_after_stop_succeeds() {
        let conn = setup_db();
        let task_a = insert_task(&conn, "任务 A");
        let task_b = insert_task(&conn, "任务 B");

        // 第一个任务 start
        let entry_id = do_start_time_tracking(&conn, task_a).unwrap();
        assert_eq!(count_active_entries(&conn), 1);

        // 停止当前计时
        stop_entry(&conn, entry_id);
        assert_eq!(count_active_entries(&conn), 0);

        // 另一个任务可以 start
        let result = do_start_time_tracking(&conn, task_b);
        assert!(result.is_ok());
        assert_eq!(count_active_entries(&conn), 1);
    }

    // ===== 阶段 4 测试：add_time_entry =====

    #[test]
    fn test_add_time_entry_normal() {
        let conn = setup_db();
        let task_id = insert_task(&conn, "专注任务");

        let result = do_add_time_entry(
            &conn,
            task_id,
            "2026-01-01T10:00:00+08:00",
            "2026-01-01T10:25:00+08:00",
            1500,
            Some("番茄钟专注".to_string()),
        );
        assert!(result.is_ok());
        let entry_id = result.unwrap();
        assert!(entry_id > 0);

        // 验证记录已插入且 end_time 不为空
        let (duration, note, end_time): (i64, Option<String>, Option<String>) = conn
            .query_row(
                "SELECT duration_secs, note, end_time FROM time_entries WHERE id = ?1",
                params![entry_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(duration, 1500);
        assert_eq!(note, Some("番茄钟专注".to_string()));
        assert!(end_time.is_some());
    }

    #[test]
    fn test_add_time_entry_nonexistent_task() {
        let conn = setup_db();

        let result = do_add_time_entry(
            &conn,
            9999, // 不存在的 task_id
            "2026-01-01T10:00:00+08:00",
            "2026-01-01T10:25:00+08:00",
            1500,
            None,
        );
        assert!(result.is_err());
        let err_msg = result.unwrap_err();
        assert!(
            err_msg.contains("任务不存在"),
            "错误信息应提示任务不存在: {}",
            err_msg
        );
    }

    #[test]
    fn test_add_time_entry_zero_duration_fails() {
        let conn = setup_db();
        let task_id = insert_task(&conn, "任务");

        let result = do_add_time_entry(
            &conn,
            task_id,
            "2026-01-01T10:00:00+08:00",
            "2026-01-01T10:00:00+08:00",
            0,
            None,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("duration_secs"));
    }

    #[test]
    fn test_add_time_entry_negative_duration_fails() {
        let conn = setup_db();
        let task_id = insert_task(&conn, "任务");

        let result = do_add_time_entry(
            &conn,
            task_id,
            "2026-01-01T10:00:00+08:00",
            "2026-01-01T10:00:00+08:00",
            -100,
            None,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("duration_secs"));
    }

    #[test]
    fn test_add_time_entry_does_not_block_active() {
        // add_time_entry 写入的是已结束记录，不应影响 active entry 约束
        let conn = setup_db();
        let task_id = insert_task(&conn, "任务");

        // 先写入一条历史记录
        let hist = do_add_time_entry(
            &conn,
            task_id,
            "2026-01-01T09:00:00+08:00",
            "2026-01-01T09:25:00+08:00",
            1500,
            None,
        );
        assert!(hist.is_ok());

        // 仍然可以 start 新的活跃计时
        let start = do_start_time_tracking(&conn, task_id);
        assert!(start.is_ok());
        assert_eq!(count_active_entries(&conn), 1);
    }
}
