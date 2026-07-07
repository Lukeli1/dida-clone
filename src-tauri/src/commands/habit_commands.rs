// 习惯相关命令（Habit commands）
//
// 包含习惯的 CRUD、归档以及打卡记录的查询/插入或更新/删除。
use rusqlite::{params, Result};
use serde::Deserialize;
use tauri::State;

use super::now_rfc3339;
use crate::db::{DbState, Habit, HabitRecord};

/// 创建习惯的请求体
#[derive(Debug, Deserialize)]
pub struct CreateHabitRequest {
    pub name: String,
    pub icon: Option<String>,
    pub icon_color: Option<String>,
    pub frequency: Option<String>,
    pub frequency_days: Option<String>,
    pub target_count: Option<i64>,
    pub unit: Option<String>,
    pub start_date: Option<String>,
    pub color: Option<String>,
    pub sort_order: Option<f64>,
}

/// 更新习惯的请求体（所有字段可选）
#[derive(Debug, Deserialize)]
pub struct UpdateHabitRequest {
    pub name: Option<String>,
    pub icon: Option<String>,
    pub icon_color: Option<String>,
    pub frequency: Option<String>,
    pub frequency_days: Option<String>,
    pub target_count: Option<i64>,
    pub unit: Option<String>,
    pub start_date: Option<String>,
    pub color: Option<String>,
    pub sort_order: Option<f64>,
}

/// 辅助函数：从数据库行构造 Habit
fn row_to_habit(row: &rusqlite::Row) -> rusqlite::Result<Habit> {
    Ok(Habit {
        id: row.get(0)?,
        name: row.get(1)?,
        icon: row.get(2)?,
        icon_color: row.get(3)?,
        frequency: row.get(4)?,
        frequency_days: row.get(5)?,
        target_count: row.get(6)?,
        unit: row.get(7)?,
        start_date: row.get(8)?,
        color: row.get(9)?,
        sort_order: row.get(10)?,
        archived: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

/// 辅助函数：从数据库行构造 HabitRecord
fn row_to_habit_record(row: &rusqlite::Row) -> rusqlite::Result<HabitRecord> {
    Ok(HabitRecord {
        id: row.get(0)?,
        habit_id: row.get(1)?,
        date: row.get(2)?,
        count: row.get(3)?,
        note: row.get(4)?,
        created_at: row.get(5)?,
    })
}

/// 辅助函数：根据 id 查询单个习惯
fn get_habit_by_id(conn: &rusqlite::Connection, id: i64) -> std::result::Result<Habit, String> {
    conn.query_row(
        "SELECT id, name, icon, icon_color, frequency, frequency_days, target_count, unit, start_date, color, sort_order, archived, created_at, updated_at FROM habits WHERE id = ?1",
        params![id],
        row_to_habit,
    )
    .map_err(|e| e.to_string())
}

/// 获取习惯列表
#[tauri::command]
pub fn get_habits(
    state: State<DbState>,
    include_archived: Option<bool>,
) -> Result<Vec<Habit>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let sql = if include_archived.unwrap_or(false) {
        "SELECT id, name, icon, icon_color, frequency, frequency_days, target_count, unit, start_date, color, sort_order, archived, created_at, updated_at FROM habits ORDER BY sort_order ASC, created_at ASC"
    } else {
        "SELECT id, name, icon, icon_color, frequency, frequency_days, target_count, unit, start_date, color, sort_order, archived, created_at, updated_at FROM habits WHERE archived = 0 ORDER BY sort_order ASC, created_at ASC"
    };

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;

    let habits = stmt
        .query_map([], row_to_habit)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(habits)
}

/// 创建习惯
#[tauri::command]
pub fn create_habit(state: State<DbState>, req: CreateHabitRequest) -> Result<Habit, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = now_rfc3339();

    conn.execute(
        "INSERT INTO habits (name, icon, icon_color, frequency, frequency_days, target_count, unit, start_date, color, sort_order, archived, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, ?11, ?12)",
        params![
            req.name,
            req.icon,
            req.icon_color,
            req.frequency,
            req.frequency_days,
            req.target_count.unwrap_or(1),
            req.unit,
            req.start_date,
            req.color,
            req.sort_order.unwrap_or(0.0),
            now,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    get_habit_by_id(&conn, id)
}

/// 更新习惯
#[tauri::command]
pub fn update_habit(
    state: State<DbState>,
    id: i64,
    req: UpdateHabitRequest,
) -> Result<Habit, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = now_rfc3339();

    let mut set_clauses: Vec<String> = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(ref name) = req.name {
        set_clauses.push("name = ?".to_string());
        params_vec.push(Box::new(name.clone()));
    }
    if let Some(ref icon) = req.icon {
        set_clauses.push("icon = ?".to_string());
        params_vec.push(Box::new(icon.clone()));
    }
    if let Some(ref icon_color) = req.icon_color {
        set_clauses.push("icon_color = ?".to_string());
        params_vec.push(Box::new(icon_color.clone()));
    }
    if let Some(ref frequency) = req.frequency {
        set_clauses.push("frequency = ?".to_string());
        params_vec.push(Box::new(frequency.clone()));
    }
    if let Some(ref frequency_days) = req.frequency_days {
        set_clauses.push("frequency_days = ?".to_string());
        params_vec.push(Box::new(frequency_days.clone()));
    }
    if let Some(target_count) = req.target_count {
        set_clauses.push("target_count = ?".to_string());
        params_vec.push(Box::new(target_count));
    }
    if let Some(ref unit) = req.unit {
        set_clauses.push("unit = ?".to_string());
        params_vec.push(Box::new(unit.clone()));
    }
    if let Some(ref start_date) = req.start_date {
        set_clauses.push("start_date = ?".to_string());
        params_vec.push(Box::new(start_date.clone()));
    }
    if let Some(ref color) = req.color {
        set_clauses.push("color = ?".to_string());
        params_vec.push(Box::new(color.clone()));
    }
    if let Some(sort_order) = req.sort_order {
        set_clauses.push("sort_order = ?".to_string());
        params_vec.push(Box::new(sort_order));
    }

    if !set_clauses.is_empty() {
        set_clauses.push("updated_at = ?".to_string());
        params_vec.push(Box::new(now));

        let sql = format!("UPDATE habits SET {} WHERE id = ?", set_clauses.join(", "));
        params_vec.push(Box::new(id));

        let params_refs: Vec<&dyn rusqlite::ToSql> =
            params_vec.iter().map(|p| p.as_ref()).collect();

        conn.execute(&sql, params_refs.as_slice())
            .map_err(|e| e.to_string())?;
    }

    get_habit_by_id(&conn, id)
}

/// 删除习惯（关联记录因 ON DELETE CASCADE 自动删除）
#[tauri::command]
pub fn delete_habit(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM habits WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 归档/取消归档习惯
#[tauri::command]
pub fn archive_habit(state: State<DbState>, id: i64, archived: bool) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = now_rfc3339();
    conn.execute(
        "UPDATE habits SET archived = ?1, updated_at = ?2 WHERE id = ?3",
        params![archived, now, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 获取习惯打卡记录（可按日期范围筛选）
#[tauri::command]
pub fn get_habit_records(
    state: State<DbState>,
    habit_id: i64,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<Vec<HabitRecord>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT id, habit_id, date, count, note, created_at FROM habit_records WHERE habit_id = ?1",
    );
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(habit_id)];

    if let Some(ref start) = start_date {
        sql.push_str(" AND date >= ?");
        params_vec.push(Box::new(start.clone()));
    }
    if let Some(ref end) = end_date {
        sql.push_str(" AND date <= ?");
        params_vec.push(Box::new(end.clone()));
    }
    sql.push_str(" ORDER BY date ASC");

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let records = stmt
        .query_map(params_refs.as_slice(), row_to_habit_record)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(records)
}

/// 插入或更新打卡记录（UPSERT）
#[tauri::command]
pub fn upsert_habit_record(
    state: State<DbState>,
    habit_id: i64,
    date: String,
    count: i32,
    note: Option<String>,
) -> Result<HabitRecord, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = now_rfc3339();

    conn.execute(
        "INSERT INTO habit_records (habit_id, date, count, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(habit_id, date) DO UPDATE SET count = ?3, note = ?4",
        params![habit_id, date, count as i64, note, now],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, habit_id, date, count, note, created_at FROM habit_records WHERE habit_id = ?1 AND date = ?2",
        params![habit_id, date],
        row_to_habit_record,
    )
    .map_err(|e| e.to_string())
}

/// 删除打卡记录
#[tauri::command]
pub fn delete_habit_record(
    state: State<DbState>,
    habit_id: i64,
    date: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM habit_records WHERE habit_id = ?1 AND date = ?2",
        params![habit_id, date],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
