// 周/月报归档相关命令（Report commands）
//
// 负责周报/月报的保存、查询、删除。
// 报告内容为 markdown 字符串，附带可选的 stats_json（统计快照）。
// UNIQUE(type, period_start) 保证同一周期只保留一份：保存时用 INSERT OR REPLACE 覆盖。
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::DbState;

/// 报告记录（与 reports 表对齐）
///
/// 注意：`type` 是 Rust 关键字，因此字段使用 `r#type`，
/// 序列化/反序列化时 serde 会输出为 `type`，与前端约定一致。
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReportRecord {
    pub id: i64,
    pub r#type: String,
    pub period_start: String,
    pub period_end: String,
    pub content: String,
    pub stats_json: Option<String>,
    pub created_at: String,
}

/// 辅助函数：从数据库行构造 ReportRecord
fn row_to_report(row: &rusqlite::Row) -> rusqlite::Result<ReportRecord> {
    Ok(ReportRecord {
        id: row.get(0)?,
        r#type: row.get(1)?,
        period_start: row.get(2)?,
        period_end: row.get(3)?,
        content: row.get(4)?,
        stats_json: row.get(5)?,
        created_at: row.get(6)?,
    })
}

/// 保存周报/月报（INSERT OR REPLACE：同 type + period_start 覆盖更新），返回记录 id。
#[tauri::command]
pub fn save_report(
    r#type: String,
    period_start: String,
    period_end: String,
    content: String,
    stats_json: Option<String>,
    state: State<DbState>,
) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO reports (type, period_start, period_end, content, stats_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
        params![r#type, period_start, period_end, content, stats_json],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

/// 查询报告列表：可按 type 过滤，按 created_at 倒序，默认返回 20 条。
#[tauri::command]
pub fn get_reports(
    r#type: Option<String>,
    limit: Option<i64>,
    state: State<DbState>,
) -> Result<Vec<ReportRecord>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(20);

    let mut sql = String::from(
        "SELECT id, type, period_start, period_end, content, stats_json, created_at FROM reports",
    );
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(ref t) = r#type {
        sql.push_str(" WHERE type = ?");
        params_vec.push(Box::new(t.clone()));
    }
    sql.push_str(" ORDER BY created_at DESC LIMIT ?");
    params_vec.push(Box::new(limit));

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let reports = stmt
        .query_map(params_refs.as_slice(), row_to_report)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(reports)
}

/// 删除指定 id 的报告。
#[tauri::command]
pub fn delete_report(id: i64, state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM reports WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
