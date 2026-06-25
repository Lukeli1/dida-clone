use rusqlite::{Connection, Result};
use serde::Serialize;
use std::sync::Mutex;

pub struct DbState(pub Mutex<Connection>);

#[derive(Serialize)]
pub struct Task {
    pub id: i64,
    pub title: String,
    pub notes: Option<String>,
    pub priority: i64,
    pub due_date: Option<String>,
    pub end_date: Option<String>,
    pub reminder: Option<String>,
    pub completed: bool,
    pub archived: bool,
    pub list_id: i64,
    pub parent_id: Option<i64>,
    pub repeat_rule: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub fn init_db(app_data_dir: &str) -> Result<Connection> {
    let db_path = std::path::Path::new(app_data_dir).join("dida.db");
    let conn = Connection::open(db_path)?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS lists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            color TEXT DEFAULT '#6B7280',
            is_default INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;

    // 兼容已有数据库：如果 lists 表没有 color 列，则添加
    let has_color: bool = {
        let mut stmt = conn.prepare("PRAGMA table_info(lists)")?;
        let cols: Vec<String> = stmt.query_map([], |row| row.get(1))?.filter_map(|c| c.ok()).collect();
        cols.iter().any(|c| c == "color")
    };
    if !has_color {
        conn.execute("ALTER TABLE lists ADD COLUMN color TEXT DEFAULT '#6B7280'", [])?;
    }

    conn.execute(
        "CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            notes TEXT,
            priority INTEGER DEFAULT 2,
            due_date TEXT,
            reminder TEXT,
            completed INTEGER DEFAULT 0,
            list_id INTEGER NOT NULL,
            parent_id INTEGER,
            repeat_rule TEXT,
            sort_order REAL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (list_id) REFERENCES lists(id),
            FOREIGN KEY (parent_id) REFERENCES tasks(id)
        )",
        [],
    )?;

    // 兼容已有数据库：如果 tasks 表没有 sort_order 列，则添加
    let has_sort_order: bool = {
        let mut stmt = conn.prepare("PRAGMA table_info(tasks)")?;
        let cols: Vec<String> = stmt.query_map([], |row| row.get(1))?.filter_map(|c| c.ok()).collect();
        cols.iter().any(|c| c == "sort_order")
    };
    if !has_sort_order {
        conn.execute("ALTER TABLE tasks ADD COLUMN sort_order REAL DEFAULT 0", [])?;
    }

    // 兼容已有数据库：如果 tasks 表没有 end_date 列，则添加
    let has_end_date: bool = {
        let mut stmt = conn.prepare("PRAGMA table_info(tasks)")?;
        let cols: Vec<String> = stmt.query_map([], |row| row.get(1))?.filter_map(|c| c.ok()).collect();
        cols.iter().any(|c| c == "end_date")
    };
    if !has_end_date {
        conn.execute("ALTER TABLE tasks ADD COLUMN end_date TEXT", [])?;
    }

    // 兼容已有数据库：如果 tasks 表没有 archived 列，则添加
    let has_archived: bool = {
        let mut stmt = conn.prepare("PRAGMA table_info(tasks)")?;
        let cols: Vec<String> = stmt.query_map([], |row| row.get(1))?.filter_map(|c| c.ok()).collect();
        cols.iter().any(|c| c == "archived")
    };
    if !has_archived {
        conn.execute("ALTER TABLE tasks ADD COLUMN archived INTEGER DEFAULT 0", [])?;
    }

    conn.execute(
        "CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT,
            created_at TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS task_tags (
            task_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (task_id, tag_id),
            FOREIGN KEY (task_id) REFERENCES tasks(id),
            FOREIGN KEY (tag_id) REFERENCES tags(id)
        )",
        [],
    )?;

    // 如果没有默认清单，创建一个"收件箱"
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM lists WHERE is_default = 1", [], |row| row.get(0))?;
    if count == 0 {
        let now = chrono::Local::now().to_rfc3339();
        conn.execute(
            "INSERT INTO lists (name, color, is_default, created_at, updated_at) VALUES (?1, ?2, 1, ?3, ?4)",
            rusqlite::params!["收件箱", "#3B82F6", now, now],
        )?;
    } else {
        // 确保默认清单颜色为蓝色
        conn.execute(
            "UPDATE lists SET color = '#3B82F6' WHERE is_default = 1 AND (color IS NULL OR color = '#6B7280')",
            [],
        )?;
    }

    // 如果没有标签，创建默认标签
    let tag_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM tags", [], |row| row.get(0))?;
    if tag_count == 0 {
        let now = chrono::Local::now().to_rfc3339();
        conn.execute(
            "INSERT INTO tags (name, color, created_at) VALUES (?1, ?2, ?3)",
            rusqlite::params!["工作", "#3B82F6", now],
        )?;
        conn.execute(
            "INSERT INTO tags (name, color, created_at) VALUES (?1, ?2, ?3)",
            rusqlite::params!["生活", "#10B981", now],
        )?;
        conn.execute(
            "INSERT INTO tags (name, color, created_at) VALUES (?1, ?2, ?3)",
            rusqlite::params!["重要", "#EF4444", now],
        )?;
    }

    Ok(conn)
}
