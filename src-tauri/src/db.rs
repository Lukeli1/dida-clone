use rusqlite::{Connection, Result};
use serde::{Serialize, Deserialize};
use std::sync::Mutex;

pub struct DbState(pub Mutex<Connection>);

/// 统一的 Task 结构体（commands.rs 通过 use crate::db::Task 引用）
#[derive(Debug, Serialize, Deserialize)]
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
    #[serde(default)]
    pub pinned: bool,
    pub sort_order: f64,
    #[serde(default)]
    pub tag_ids: Vec<i64>,
}

/// 辅助函数：检查列是否存在，不存在则添加（消除重复 PRAGMA table_info 代码）
fn add_column_if_not_exists(conn: &Connection, table: &str, column: &str, definition: &str) -> Result<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table))?;
    let exists = stmt.query_map([], |row| row.get::<_, String>(1))?
        .filter_map(|c| c.ok())
        .any(|name| name == column);
    if !exists {
        conn.execute(&format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, definition), [])?;
    }
    Ok(())
}

pub fn init_db(app_data_dir: &str) -> Result<Connection> {
    let db_path = std::path::Path::new(app_data_dir).join("dida.db");
    let conn = Connection::open(db_path)?;

    // P0-1: 启用外键约束和 WAL 模式
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")?;

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

    // 兼容已有数据库：使用辅助函数检查并添加缺失列
    add_column_if_not_exists(&conn, "lists", "color", "TEXT DEFAULT '#6B7280'")?;

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

    // 兼容已有数据库：使用辅助函数检查并添加缺失列
    add_column_if_not_exists(&conn, "tasks", "sort_order", "REAL DEFAULT 0")?;
    add_column_if_not_exists(&conn, "tasks", "end_date", "TEXT")?;
    add_column_if_not_exists(&conn, "tasks", "archived", "INTEGER DEFAULT 0")?;
    add_column_if_not_exists(&conn, "tasks", "pinned", "INTEGER DEFAULT 0")?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT,
            parent_id INTEGER,
            created_at TEXT NOT NULL,
            FOREIGN KEY (parent_id) REFERENCES tags(id)
        )",
        [],
    )?;

    add_column_if_not_exists(&conn, "tags", "parent_id", "INTEGER")?;

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

    // P0-4: 创建索引，提升查询性能
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_tasks_list_id ON tasks(list_id);
         CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
         CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
         CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks(archived);
         CREATE INDEX IF NOT EXISTS idx_tasks_pinned ON tasks(pinned);
         CREATE INDEX IF NOT EXISTS idx_tasks_sort_order ON tasks(pinned DESC, sort_order ASC, created_at DESC);
         CREATE INDEX IF NOT EXISTS idx_task_tags_task_id ON task_tags(task_id);
         CREATE INDEX IF NOT EXISTS idx_task_tags_tag_id ON task_tags(tag_id);"
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
