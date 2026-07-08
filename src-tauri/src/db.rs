use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
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

/// 习惯结构体
#[derive(Debug, Serialize, Deserialize)]
pub struct Habit {
    pub id: i64,
    pub name: String,
    pub icon: Option<String>,
    pub icon_color: Option<String>,
    pub frequency: Option<String>,
    pub frequency_days: Option<String>,
    pub target_count: i64,
    pub unit: Option<String>,
    pub start_date: Option<String>,
    pub color: Option<String>,
    pub sort_order: f64,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// 习惯打卡记录结构体
#[derive(Debug, Serialize, Deserialize)]
pub struct HabitRecord {
    pub id: i64,
    pub habit_id: i64,
    pub date: String,
    pub count: i64,
    pub note: Option<String>,
    pub created_at: String,
}

/// 辅助函数：检查列是否存在，不存在则添加（消除重复 PRAGMA table_info 代码）
fn add_column_if_not_exists(
    conn: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table))?;
    let exists = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .filter_map(|c| c.ok())
        .any(|name| name == column);
    if !exists {
        conn.execute(
            &format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, definition),
            [],
        )?;
    }
    Ok(())
}

pub fn init_db(app_data_dir: &str) -> Result<Connection> {
    let db_path = std::path::Path::new(app_data_dir).join("dida.db");
    let conn = Connection::open(db_path)?;

    init_schema(&conn)?;

    // 启动性能优化：执行一次简单查询让 SQLite 初始化页缓存，
    // 使后续首屏 get_tasks / get_lists 等查询命中缓存，减少冷启动延迟。
    // 效果有限，失败时忽略（不影响应用正常启动）。
    let _ = conn.execute_batch("SELECT COUNT(*) FROM tasks;");

    Ok(conn)
}

/// 初始化数据库 schema：创建所有表、索引，并写入默认数据（默认清单与标签）。
/// 从 init_db 中提取，便于单元测试使用内存数据库验证。
#[allow(dead_code)]
pub(crate) fn init_schema(conn: &Connection) -> Result<()> {
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
    add_column_if_not_exists(conn, "lists", "color", "TEXT DEFAULT '#6B7280'")?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            notes TEXT,
            priority INTEGER DEFAULT 2,
            due_date TEXT,
            reminder TEXT,
            last_notified TEXT,
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
    add_column_if_not_exists(conn, "tasks", "sort_order", "REAL DEFAULT 0")?;
    add_column_if_not_exists(conn, "tasks", "end_date", "TEXT")?;
    add_column_if_not_exists(conn, "tasks", "archived", "INTEGER DEFAULT 0")?;
    add_column_if_not_exists(conn, "tasks", "pinned", "INTEGER DEFAULT 0")?;
    add_column_if_not_exists(conn, "tasks", "last_notified", "TEXT")?;

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

    add_column_if_not_exists(conn, "tags", "parent_id", "INTEGER")?;

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
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM lists WHERE is_default = 1",
        [],
        |row| row.get(0),
    )?;
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
    let tag_count: i64 = conn.query_row("SELECT COUNT(*) FROM tags", [], |row| row.get(0))?;
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

    // P3-06: habits 习惯表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS habits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            icon TEXT,
            icon_color TEXT,
            frequency TEXT,
            frequency_days TEXT,
            target_count INTEGER DEFAULT 1,
            unit TEXT,
            start_date TEXT,
            color TEXT,
            sort_order REAL DEFAULT 0,
            archived INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;

    // P3-06: habit_records 习惯打卡记录表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS habit_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            habit_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            count INTEGER DEFAULT 1,
            note TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
            UNIQUE(habit_id, date)
        )",
        [],
    )?;

    // P3-06: 习惯记录索引，提升查询性能
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_habit_records_habit_id ON habit_records(habit_id);
         CREATE INDEX IF NOT EXISTS idx_habit_records_date ON habit_records(date);",
    )?;

    // 任务模板表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            icon TEXT,
            title_template TEXT NOT NULL,
            notes_template TEXT,
            priority INTEGER DEFAULT 0,
            reminder_minutes INTEGER,
            sort_order INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;

    // 子任务模板表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS subtask_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0
        )",
        [],
    )?;

    // 子任务模板索引
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_subtask_templates_template_id ON subtask_templates(template_id);"
    )?;

    // 任务附件表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            file_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            mime_type TEXT,
            created_at TEXT NOT NULL
        )",
        [],
    )?;

    // 附件索引，提升按 task_id 查询性能
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_attachments_task_id ON attachments(task_id);",
    )?;

    // P12-04: time_entries 时间追踪记录表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS time_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT,
            duration_secs INTEGER NOT NULL DEFAULT 0,
            note TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // P12-04: 时间追踪索引
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(task_id);
         CREATE INDEX IF NOT EXISTS idx_time_entries_start ON time_entries(start_time);",
    )?;

    // P12-05: reports 周/月报归档表
    // type: 'weekly' | 'monthly'
    // UNIQUE(type, period_start) 保证同一周期只保留一份（INSERT OR REPLACE 时覆盖更新）
    conn.execute(
        "CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            period_start TEXT NOT NULL,
            period_end TEXT NOT NULL,
            content TEXT NOT NULL,
            stats_json TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(type, period_start)
        )",
        [],
    )?;

    // P12-05: reports 索引，提升按 type 与时间倒序查询性能
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);
         CREATE INDEX IF NOT EXISTS idx_reports_period_start ON reports(period_start);",
    )?;

    // P12-06: goals 目标/OKR 表
    // type:    'annual' | 'quarterly' | 'monthly'
    // status:  'active' | 'completed' | 'archived'
    conn.execute(
        "CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            type TEXT NOT NULL DEFAULT 'quarterly',
            period_start TEXT NOT NULL,
            period_end TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            color TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        [],
    )?;

    // P12-06: goal_tasks 目标-任务关联表（多对多）
    // ON DELETE CASCADE：删除目标时自动解除关联；删除任务时自动解除关联
    conn.execute(
        "CREATE TABLE IF NOT EXISTS goal_tasks (
            goal_id INTEGER NOT NULL,
            task_id INTEGER NOT NULL,
            PRIMARY KEY (goal_id, task_id),
            FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // P12-06: goal_tasks 索引，提升按 goal_id / task_id 查询关联性能
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_goal_tasks_goal ON goal_tasks(goal_id);
         CREATE INDEX IF NOT EXISTS idx_goal_tasks_task ON goal_tasks(task_id);",
    )?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    /// 辅助函数：创建内存数据库并初始化 schema
    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        conn
    }

    #[test]
    fn test_init_schema_creates_tables() {
        let conn = setup_db();
        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        for expected in &[
            "lists",
            "tasks",
            "tags",
            "task_tags",
            "habits",
            "habit_records",
            "templates",
            "subtask_templates",
            "attachments",
            "time_entries",
            "reports",
            "goals",
            "goal_tasks",
        ] {
            assert!(
                tables.contains(&expected.to_string()),
                "表 {} 未创建，现有表: {:?}",
                expected,
                tables
            );
        }
    }

    #[test]
    fn test_default_list_created() {
        let conn = setup_db();
        let (name, is_default): (String, i64) = conn
            .query_row(
                "SELECT name, is_default FROM lists WHERE is_default = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(name, "收件箱");
        assert_eq!(is_default, 1);
    }

    #[test]
    fn test_create_and_query_task() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO tasks (title, notes, priority, list_id, created_at, updated_at) \
             VALUES (?1, ?2, ?3, 1, ?4, ?5)",
            params![
                "测试任务",
                "备注内容",
                1,
                "2026-01-01T00:00:00",
                "2026-01-01T00:00:00"
            ],
        )
        .unwrap();
        let task_id = conn.last_insert_rowid();

        let (title, notes, priority): (String, Option<String>, i64) = conn
            .query_row(
                "SELECT title, notes, priority FROM tasks WHERE id = ?1",
                params![task_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(title, "测试任务");
        assert_eq!(notes, Some("备注内容".to_string()));
        assert_eq!(priority, 1);
    }

    #[test]
    fn test_task_foreign_key_list() {
        let conn = setup_db();
        // 向不存在的 list_id 插入任务应因外键约束失败
        let result = conn.execute(
            "INSERT INTO tasks (title, list_id, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4)",
            params![
                "无清单任务",
                99999,
                "2026-01-01T00:00:00",
                "2026-01-01T00:00:00"
            ],
        );
        assert!(result.is_err(), "外键约束未生效，应拒绝插入");
    }

    #[test]
    fn test_task_completion_toggle() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO tasks (title, list_id, created_at, updated_at) \
             VALUES (?1, 1, ?2, ?3)",
            params!["切换任务", "2026-01-01T00:00:00", "2026-01-01T00:00:00"],
        )
        .unwrap();
        let task_id = conn.last_insert_rowid();

        // 初始 completed = 0
        let completed: i64 = conn
            .query_row(
                "SELECT completed FROM tasks WHERE id = ?1",
                params![task_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(completed, 0);

        // 切换为已完成
        conn.execute(
            "UPDATE tasks SET completed = 1 WHERE id = ?1",
            params![task_id],
        )
        .unwrap();
        let completed: i64 = conn
            .query_row(
                "SELECT completed FROM tasks WHERE id = ?1",
                params![task_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(completed, 1);
    }

    #[test]
    fn test_tag_unique_name() {
        let conn = setup_db();
        // 插入一个新标签
        conn.execute(
            "INSERT INTO tags (name, created_at) VALUES (?1, ?2)",
            params!["测试标签", "2026-01-01T00:00:00"],
        )
        .unwrap();

        // 重复插入同名标签应失败（UNIQUE 约束）
        let result = conn.execute(
            "INSERT INTO tags (name, created_at) VALUES (?1, ?2)",
            params!["测试标签", "2026-01-01T00:00:00"],
        );
        assert!(result.is_err(), "UNIQUE 约束未生效，应拒绝重复标签名");
    }

    #[test]
    fn test_subtask_parent_relation() {
        let conn = setup_db();
        // 插入父任务（list_id=1 为默认清单）
        conn.execute(
            "INSERT INTO tasks (title, list_id, created_at, updated_at) \
             VALUES (?1, 1, ?2, ?3)",
            params!["父任务", "2026-01-01T00:00:00", "2026-01-01T00:00:00"],
        )
        .unwrap();
        let parent_id = conn.last_insert_rowid();

        // 插入子任务
        conn.execute(
            "INSERT INTO tasks (title, list_id, parent_id, created_at, updated_at) \
             VALUES (?1, 1, ?2, ?3, ?4)",
            params![
                "子任务",
                parent_id,
                "2026-01-01T00:00:00",
                "2026-01-01T00:00:00"
            ],
        )
        .unwrap();
        let subtask_id = conn.last_insert_rowid();

        // 查询子任务的 parent_id
        let pid: Option<i64> = conn
            .query_row(
                "SELECT parent_id FROM tasks WHERE id = ?1",
                params![subtask_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(pid, Some(parent_id));
    }
}
