// 任务模板相关命令（TaskTemplate commands）
//
// 包含模板的 CRUD 以及从模板创建任务（apply_template）。
// apply_template 在事务中完成：查询模板 → 插入主任务 → 插入子任务。
use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};
use tauri::State;

use super::now_rfc3339;
use crate::db::{DbState, Task};

// ============ 结构体 ============

#[derive(Debug, Serialize, Deserialize)]
pub struct TaskTemplate {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub title_template: String,
    pub notes_template: Option<String>,
    pub priority: i32,
    pub reminder_minutes: Option<i32>,
    pub subtask_templates: Vec<SubtaskTemplate>,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SubtaskTemplate {
    pub id: i64,
    pub template_id: i64,
    pub title: String,
    pub sort_order: i32,
}

#[derive(Debug, Deserialize)]
pub struct CreateTemplateRequest {
    pub name: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub title_template: String,
    pub notes_template: Option<String>,
    pub priority: Option<i32>,
    pub reminder_minutes: Option<i32>,
    pub subtask_templates: Vec<SubtaskTemplateInput>,
}

#[derive(Debug, Deserialize)]
pub struct SubtaskTemplateInput {
    pub title: String,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTemplateRequest {
    pub id: i64,
    pub name: Option<String>,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub title_template: Option<String>,
    pub notes_template: Option<String>,
    pub priority: Option<i32>,
    pub reminder_minutes: Option<i32>,
    pub subtask_templates: Option<Vec<SubtaskTemplateInput>>,
}

// ============ 辅助函数 ============

/// 从数据库行构造 SubtaskTemplate
fn row_to_subtask_template(row: &rusqlite::Row) -> rusqlite::Result<SubtaskTemplate> {
    Ok(SubtaskTemplate {
        id: row.get(0)?,
        template_id: row.get(1)?,
        title: row.get(2)?,
        sort_order: row.get(3)?,
    })
}

/// 查询某模板的所有子任务模板
fn get_subtask_templates(
    conn: &rusqlite::Connection,
    template_id: i64,
) -> std::result::Result<Vec<SubtaskTemplate>, String> {
    let mut stmt = conn
        .prepare("SELECT id, template_id, title, sort_order FROM subtask_templates WHERE template_id = ?1 ORDER BY sort_order ASC, id ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![template_id], row_to_subtask_template)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

/// 从数据库行构造 TaskTemplate（不含子任务模板，需单独查询）
fn row_to_template(row: &rusqlite::Row) -> rusqlite::Result<TaskTemplate> {
    Ok(TaskTemplate {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        icon: row.get(3)?,
        title_template: row.get(4)?,
        notes_template: row.get(5)?,
        priority: row.get(6)?,
        reminder_minutes: row.get(7)?,
        sort_order: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
        subtask_templates: Vec::new(),
    })
}

/// 根据 id 查询单个模板（含子任务模板）
fn get_template_by_id(
    conn: &rusqlite::Connection,
    id: i64,
) -> std::result::Result<TaskTemplate, String> {
    let mut template = conn
        .query_row(
            "SELECT id, name, description, icon, title_template, notes_template, priority, reminder_minutes, sort_order, created_at, updated_at FROM templates WHERE id = ?1",
            params![id],
            row_to_template,
        )
        .map_err(|e| e.to_string())?;
    template.subtask_templates = get_subtask_templates(conn, id)?;
    Ok(template)
}

// ============ Commands ============

/// 获取所有模板（含子任务模板）
#[tauri::command]
pub fn get_templates(state: State<DbState>) -> Result<Vec<TaskTemplate>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, name, description, icon, title_template, notes_template, priority, reminder_minutes, sort_order, created_at, updated_at FROM templates ORDER BY sort_order ASC, created_at ASC")
        .map_err(|e| e.to_string())?;

    let mut templates = stmt
        .query_map([], row_to_template)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // 为每个模板加载子任务模板
    for template in &mut templates {
        template.subtask_templates = get_subtask_templates(&conn, template.id)?;
    }

    Ok(templates)
}

/// 创建模板（含子任务模板）
#[tauri::command]
pub fn create_template(
    state: State<DbState>,
    req: CreateTemplateRequest,
) -> Result<TaskTemplate, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = now_rfc3339();

    // 计算排序值：取当前最大值 +1
    let max_sort: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) FROM templates",
            [],
            |row| row.get(0),
        )
        .unwrap_or(-1);

    conn.execute(
        "INSERT INTO templates (name, description, icon, title_template, notes_template, priority, reminder_minutes, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            req.name,
            req.description,
            req.icon,
            req.title_template,
            req.notes_template,
            req.priority.unwrap_or(0),
            req.reminder_minutes,
            max_sort + 1,
            now,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    let template_id = conn.last_insert_rowid();

    // 插入子任务模板
    for (i, sub) in req.subtask_templates.iter().enumerate() {
        conn.execute(
            "INSERT INTO subtask_templates (template_id, title, sort_order) VALUES (?1, ?2, ?3)",
            params![template_id, sub.title, sub.sort_order.unwrap_or(i as i32)],
        )
        .map_err(|e| e.to_string())?;
    }

    get_template_by_id(&conn, template_id)
}

/// 更新模板（含替换子任务模板）
#[tauri::command]
pub fn update_template(
    state: State<DbState>,
    req: UpdateTemplateRequest,
) -> Result<TaskTemplate, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = now_rfc3339();

    let mut set_clauses: Vec<String> = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(ref name) = req.name {
        set_clauses.push("name = ?".to_string());
        params_vec.push(Box::new(name.clone()));
    }
    if let Some(ref description) = req.description {
        set_clauses.push("description = ?".to_string());
        params_vec.push(Box::new(description.clone()));
    }
    if let Some(ref icon) = req.icon {
        set_clauses.push("icon = ?".to_string());
        params_vec.push(Box::new(icon.clone()));
    }
    if let Some(ref title_template) = req.title_template {
        set_clauses.push("title_template = ?".to_string());
        params_vec.push(Box::new(title_template.clone()));
    }
    if let Some(ref notes_template) = req.notes_template {
        set_clauses.push("notes_template = ?".to_string());
        params_vec.push(Box::new(notes_template.clone()));
    }
    if let Some(priority) = req.priority {
        set_clauses.push("priority = ?".to_string());
        params_vec.push(Box::new(priority));
    }
    if let Some(reminder_minutes) = req.reminder_minutes {
        set_clauses.push("reminder_minutes = ?".to_string());
        params_vec.push(Box::new(reminder_minutes));
    }

    // 始终更新 updated_at
    set_clauses.push("updated_at = ?".to_string());
    params_vec.push(Box::new(now));

    let sql = format!(
        "UPDATE templates SET {} WHERE id = ?",
        set_clauses.join(", ")
    );
    params_vec.push(Box::new(req.id));

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    conn.execute(&sql, params_refs.as_slice())
        .map_err(|e| e.to_string())?;

    // 如果提供了子任务模板，则替换（先删后插）
    if let Some(ref subtask_templates) = req.subtask_templates {
        conn.execute(
            "DELETE FROM subtask_templates WHERE template_id = ?1",
            params![req.id],
        )
        .map_err(|e| e.to_string())?;

        for (i, sub) in subtask_templates.iter().enumerate() {
            conn.execute(
                "INSERT INTO subtask_templates (template_id, title, sort_order) VALUES (?1, ?2, ?3)",
                params![req.id, sub.title, sub.sort_order.unwrap_or(i as i32)],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    get_template_by_id(&conn, req.id)
}

/// 删除模板（子任务模板因 ON DELETE CASCADE 自动删除）
#[tauri::command]
pub fn delete_template(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM templates WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 从模板创建任务（含子任务），返回创建的主任务
#[tauri::command]
pub fn apply_template(
    state: State<DbState>,
    template_id: i64,
    list_id: i64,
) -> Result<Task, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // 开启事务
    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    // 事务辅助闭包：出错时回滚
    let rollback = || {
        let _ = conn.execute_batch("ROLLBACK");
    };

    // 1) 查询模板
    let template = match conn.query_row(
        "SELECT id, name, description, icon, title_template, notes_template, priority, reminder_minutes, sort_order, created_at, updated_at FROM templates WHERE id = ?1",
        params![template_id],
        row_to_template,
    ) {
        Ok(t) => t,
        Err(e) => {
            rollback();
            return Err(e.to_string());
        }
    };

    // 2) 查询子任务模板
    let subtask_templates = match get_subtask_templates(&conn, template_id) {
        Ok(s) => s,
        Err(e) => {
            rollback();
            return Err(e);
        }
    };

    let now = now_rfc3339();
    let sort_order = chrono::Local::now().timestamp_millis() as f64;

    // 3) 插入主任务
    let priority = template.priority as i64;
    if let Err(e) = conn.execute(
        "INSERT INTO tasks (title, notes, priority, due_date, end_date, all_day, reminder, reminder_minutes, completed, completed_at, status, list_id, parent_id, repeat_rule, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, 0, NULL, 'todo', ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            template.title_template,
            template.notes_template,
            priority,
            None::<String>,    // due_date
            None::<String>,    // end_date
            None::<String>,    // reminder
            template.reminder_minutes.map(i64::from),
            list_id,
            None::<i64>,       // parent_id
            None::<String>,    // repeat_rule
            sort_order,
            now,
            now,
        ],
    ) {
        rollback();
        return Err(e.to_string());
    }

    let task_id = conn.last_insert_rowid();

    // 4) 为每个子任务模板插入子任务
    for sub in &subtask_templates {
        let sub_sort_order = chrono::Local::now().timestamp_millis() as f64;
        if let Err(e) = conn.execute(
            "INSERT INTO tasks (title, notes, priority, due_date, end_date, all_day, reminder, reminder_minutes, completed, completed_at, status, list_id, parent_id, repeat_rule, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, 0, NULL, 'todo', ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                sub.title,
                None::<String>,
                priority,
                None::<String>,
                None::<String>,
                None::<String>,
                None::<i64>,
                list_id,
                task_id,           // parent_id
                None::<String>,
                sub_sort_order,
                now,
                now,
            ],
        ) {
            rollback();
            return Err(e.to_string());
        }
    }

    // 5) 提交事务
    if let Err(e) = conn.execute_batch("COMMIT") {
        rollback();
        return Err(e.to_string());
    }

    // 返回创建的主任务
    Ok(Task {
        id: task_id,
        title: template.title_template,
        notes: template.notes_template,
        priority,
        due_date: None,
        end_date: None,
        all_day: false,
        reminder: None,
        reminder_minutes: template.reminder_minutes.map(i64::from),
        completed: false,
        completed_at: None,
        status: "todo".to_string(),
        archived: false,
        pinned: false,
        list_id,
        parent_id: None,
        repeat_rule: None,
        sort_order,
        created_at: now.clone(),
        updated_at: now,
        tag_ids: Vec::new(),
    })
}
