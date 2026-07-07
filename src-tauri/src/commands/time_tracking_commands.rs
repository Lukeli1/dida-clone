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
#[tauri::command]
pub fn start_time_tracking(task_id: i64, state: State<DbState>) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
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
