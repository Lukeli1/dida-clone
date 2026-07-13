// 任务模板相关命令（TaskTemplate commands）
//
// 包含模板的 CRUD 以及从模板创建任务（apply_template）。
// apply_template 在事务中完成：查询模板 → 校验清单/标签 → 变量替换 → 插入主任务/子任务/标签。
use std::collections::HashMap;

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

/// 应用模板请求：template_id / list_id 必填；due_date / tag_ids / variables 可选。
/// 旧调用只传 template_id + list_id 时保持原有行为（无日期、无标签、不替换变量）。
#[derive(Debug, Deserialize, Default, Clone)]
pub struct ApplyTemplateOptions {
    pub due_date: Option<String>,
    pub tag_ids: Option<Vec<i64>>,
    pub variables: Option<HashMap<String, String>>,
}

// ============ 辅助函数 ============

/// 将文本中的 `{var}` 按 variables 映射替换。
/// - 映射中存在的变量（含空字符串）一律替换为对应值
/// - 映射中不存在的变量保留原占位符，行为一致且可预测
pub(crate) fn apply_template_variables(text: &str, variables: &HashMap<String, String>) -> String {
    if variables.is_empty() || !text.contains('{') {
        return text.to_string();
    }

    let mut result = String::with_capacity(text.len());
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '{' {
            if let Some(end) = chars[i + 1..].iter().position(|&c| c == '}') {
                let name: String = chars[i + 1..i + 1 + end].iter().collect();
                if !name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
                    if let Some(value) = variables.get(&name) {
                        result.push_str(value);
                        i += end + 2;
                        continue;
                    }
                }
            }
        }
        result.push(chars[i]);
        i += 1;
    }
    result
}

fn ensure_list_exists(
    conn: &rusqlite::Connection,
    list_id: i64,
) -> std::result::Result<(), String> {
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM lists WHERE id = ?1)",
            params![list_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !exists {
        return Err(format!(
            "目标清单不存在（id={}），请重新选择后重试",
            list_id
        ));
    }
    Ok(())
}

fn ensure_tags_exist(
    conn: &rusqlite::Connection,
    tag_ids: &[i64],
) -> std::result::Result<(), String> {
    for tag_id in tag_ids {
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM tags WHERE id = ?1)",
                params![tag_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if !exists {
            return Err(format!("标签不存在（id={}），请重新选择后重试", tag_id));
        }
    }
    Ok(())
}

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

/// 从模板创建任务（含子任务），返回创建的主任务。
///
/// 参数：
/// - `template_id` / `list_id`：必填
/// - `options`：可选增强字段（due_date / tag_ids / variables）
///
/// 兼容策略：旧调用不传 options 时，serde 使用 Default，行为与 v1.39 一致。
#[tauri::command]
pub fn apply_template(
    state: State<DbState>,
    template_id: i64,
    list_id: i64,
    options: Option<ApplyTemplateOptions>,
) -> Result<Task, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let options = options.unwrap_or_default();
    do_apply_template(&conn, template_id, list_id, &options)
}

/// 核心应用逻辑，接受 &Connection 以便单元测试直接调用。
pub(crate) fn do_apply_template(
    conn: &rusqlite::Connection,
    template_id: i64,
    list_id: i64,
    options: &ApplyTemplateOptions,
) -> Result<Task, String> {
    // 开启事务
    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    // 事务辅助闭包：出错时回滚
    let rollback = || {
        let _ = conn.execute_batch("ROLLBACK");
    };

    // 0) 校验目标清单
    if let Err(e) = ensure_list_exists(conn, list_id) {
        rollback();
        return Err(e);
    }

    // 1) 查询模板
    let template = match conn.query_row(
        "SELECT id, name, description, icon, title_template, notes_template, priority, reminder_minutes, sort_order, created_at, updated_at FROM templates WHERE id = ?1",
        params![template_id],
        row_to_template,
    ) {
        Ok(t) => t,
        Err(e) => {
            rollback();
            let msg = e.to_string();
            if msg.contains("no rows") || msg.contains("QueryReturnedNoRows") {
                return Err(format!("模板不存在（id={}）", template_id));
            }
            return Err(msg);
        }
    };

    // 2) 查询子任务模板
    let subtask_templates = match get_subtask_templates(conn, template_id) {
        Ok(s) => s,
        Err(e) => {
            rollback();
            return Err(e);
        }
    };

    // 3) 规范化标签：去重并校验存在性
    let mut tag_ids: Vec<i64> = options.tag_ids.clone().unwrap_or_default();
    tag_ids.sort_unstable();
    tag_ids.dedup();
    if let Err(e) = ensure_tags_exist(conn, &tag_ids) {
        rollback();
        return Err(e);
    }

    // 4) 变量替换（空 map / 未传变量时保持原文）
    let variables = options.variables.clone().unwrap_or_default();
    let title = apply_template_variables(&template.title_template, &variables);
    let notes = template
        .notes_template
        .as_ref()
        .map(|n| apply_template_variables(n, &variables));
    // due_date：None / 空串 都视为未设置日期，保持与现有创建任务语义一致
    let due_date = options
        .due_date
        .as_ref()
        .map(|d| d.trim().to_string())
        .filter(|d| !d.is_empty());

    let now = now_rfc3339();
    let sort_order = chrono::Local::now().timestamp_millis() as f64;
    let priority = template.priority as i64;

    // 5) 插入主任务
    if let Err(e) = conn.execute(
        "INSERT INTO tasks (title, notes, priority, due_date, end_date, all_day, reminder, reminder_minutes, completed, completed_at, status, list_id, parent_id, repeat_rule, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, 0, NULL, 'todo', ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            title,
            notes,
            priority,
            due_date,
            None::<String>, // end_date
            None::<String>, // reminder
            template.reminder_minutes.map(i64::from),
            list_id,
            None::<i64>,    // parent_id
            None::<String>, // repeat_rule
            sort_order,
            now,
            now,
        ],
    ) {
        rollback();
        return Err(e.to_string());
    }

    let task_id = conn.last_insert_rowid();

    // 6) 写入主任务标签（子任务不自动继承标签）
    for tag_id in &tag_ids {
        if let Err(e) = conn.execute(
            "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
            params![task_id, tag_id],
        ) {
            rollback();
            return Err(e.to_string());
        }
    }

    // 7) 为每个子任务模板插入子任务（不继承 due_date / tags）
    for sub in &subtask_templates {
        let sub_title = apply_template_variables(&sub.title, &variables);
        let sub_sort_order = chrono::Local::now().timestamp_millis() as f64;
        if let Err(e) = conn.execute(
            "INSERT INTO tasks (title, notes, priority, due_date, end_date, all_day, reminder, reminder_minutes, completed, completed_at, status, list_id, parent_id, repeat_rule, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, 0, NULL, 'todo', ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                sub_title,
                None::<String>,
                priority,
                None::<String>,
                None::<String>,
                None::<String>,
                None::<i64>,
                list_id,
                task_id, // parent_id
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

    // 8) 提交事务
    if let Err(e) = conn.execute_batch("COMMIT") {
        rollback();
        return Err(e.to_string());
    }

    // 返回创建的主任务
    Ok(Task {
        id: task_id,
        title,
        notes,
        priority,
        due_date,
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
        deleted_at: None,
        tag_ids,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_schema;
    use rusqlite::params;
    use std::collections::HashMap;

    fn setup_db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        conn
    }

    fn insert_list(conn: &rusqlite::Connection, name: &str) -> i64 {
        let now = "2026-01-01T00:00:00";
        conn.execute(
            "INSERT INTO lists (name, color, is_default, created_at, updated_at) VALUES (?1, '#6B7280', 0, ?2, ?3)",
            params![name, now, now],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn insert_tag(conn: &rusqlite::Connection, name: &str) -> i64 {
        conn.execute(
            "INSERT INTO tags (name, color, created_at) VALUES (?1, '#EF4444', ?2)",
            params![name, "2026-01-01T00:00:00"],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn insert_template(
        conn: &rusqlite::Connection,
        title: &str,
        notes: Option<&str>,
        subtasks: &[&str],
    ) -> i64 {
        let now = "2026-01-01T00:00:00";
        conn.execute(
            "INSERT INTO templates (name, description, icon, title_template, notes_template, priority, reminder_minutes, sort_order, created_at, updated_at)
             VALUES (?1, NULL, '📋', ?2, ?3, 1, NULL, 0, ?4, ?5)",
            params![format!("模板-{}", title), title, notes, now, now],
        )
        .unwrap();
        let template_id = conn.last_insert_rowid();
        for (i, sub) in subtasks.iter().enumerate() {
            conn.execute(
                "INSERT INTO subtask_templates (template_id, title, sort_order) VALUES (?1, ?2, ?3)",
                params![template_id, *sub, i as i32],
            )
            .unwrap();
        }
        template_id
    }

    fn count_tasks(conn: &rusqlite::Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM tasks", [], |row| row.get(0))
            .unwrap()
    }

    fn count_task_tags(conn: &rusqlite::Connection, task_id: i64) -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM task_tags WHERE task_id = ?1",
            params![task_id],
            |row| row.get(0),
        )
        .unwrap()
    }

    #[test]
    fn test_apply_template_variables_replaces_known_and_keeps_unknown() {
        let mut vars = HashMap::new();
        vars.insert("project".to_string(), "Alpha".to_string());
        vars.insert("empty".to_string(), "".to_string());

        assert_eq!(
            apply_template_variables("启动 {project} 项目", &vars),
            "启动 Alpha 项目"
        );
        assert_eq!(
            apply_template_variables("备注 {empty} 结束", &vars),
            "备注  结束"
        );
        assert_eq!(
            apply_template_variables("未知 {owner} 保留", &vars),
            "未知 {owner} 保留"
        );
        assert_eq!(
            apply_template_variables("无变量文本", &HashMap::new()),
            "无变量文本"
        );
    }

    #[test]
    fn test_apply_template_success_basic() {
        let conn = setup_db();
        let list_id = insert_list(&conn, "工作");
        let template_id = insert_template(
            &conn,
            "周会准备",
            Some("会前检查"),
            &["准备议程", "同步进度"],
        );

        let task = do_apply_template(
            &conn,
            template_id,
            list_id,
            &ApplyTemplateOptions::default(),
        )
        .expect("应用模板应成功");

        assert_eq!(task.list_id, list_id);
        assert_ne!(task.list_id, 1, "不应静默写入 list_id=1");
        assert_eq!(task.title, "周会准备");
        assert_eq!(task.notes.as_deref(), Some("会前检查"));
        assert!(task.due_date.is_none());
        assert!(task.tag_ids.is_empty());

        let subtask_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM tasks WHERE parent_id = ?1",
                params![task.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(subtask_count, 2);
        assert_eq!(count_tasks(&conn), 3);
    }

    #[test]
    fn test_apply_template_to_selected_list_not_inbox() {
        let conn = setup_db();
        let inbox_id: i64 = conn
            .query_row(
                "SELECT id FROM lists WHERE is_default = 1 LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let work_id = insert_list(&conn, "项目清单");
        let template_id = insert_template(&conn, "项目启动", None, &[]);

        let task = do_apply_template(
            &conn,
            template_id,
            work_id,
            &ApplyTemplateOptions::default(),
        )
        .unwrap();

        assert_eq!(task.list_id, work_id);
        assert_ne!(task.list_id, inbox_id);
        let stored_list: i64 = conn
            .query_row(
                "SELECT list_id FROM tasks WHERE id = ?1",
                params![task.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(stored_list, work_id);
    }

    #[test]
    fn test_apply_template_variable_replacement_parent_notes_subtasks() {
        let conn = setup_db();
        let list_id = insert_list(&conn, "项目");
        let template_id = insert_template(
            &conn,
            "{project} 启动会",
            Some("项目：{project}\n未知：{owner}"),
            &["准备 {project} 材料", "通知 {owner}"],
        );

        let mut variables = HashMap::new();
        variables.insert("project".to_string(), "滴答复刻".to_string());

        let task = do_apply_template(
            &conn,
            template_id,
            list_id,
            &ApplyTemplateOptions {
                variables: Some(variables),
                ..Default::default()
            },
        )
        .unwrap();

        assert_eq!(task.title, "滴答复刻 启动会");
        assert_eq!(task.notes.as_deref(), Some("项目：滴答复刻\n未知：{owner}"));

        let mut stmt = conn
            .prepare("SELECT title FROM tasks WHERE parent_id = ?1 ORDER BY sort_order ASC, id ASC")
            .unwrap();
        let sub_titles: Vec<String> = stmt
            .query_map(params![task.id], |row| row.get(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert_eq!(sub_titles, vec!["准备 滴答复刻 材料", "通知 {owner}"]);
    }

    #[test]
    fn test_apply_template_due_date_and_tags_persist() {
        let conn = setup_db();
        let list_id = insert_list(&conn, "工作");
        // 默认 schema 已有「重要」等标签，测试使用唯一名称避免 UNIQUE 冲突
        let tag_a = insert_tag(&conn, "复盘-重要");
        let tag_b = insert_tag(&conn, "复盘-会议");
        let template_id = insert_template(&conn, "复盘会", None, &["收集反馈"]);

        let task = do_apply_template(
            &conn,
            template_id,
            list_id,
            &ApplyTemplateOptions {
                due_date: Some("2026-07-15T23:59:00".to_string()),
                tag_ids: Some(vec![tag_a, tag_b, tag_a]), // 含重复，应去重
                ..Default::default()
            },
        )
        .unwrap();

        assert_eq!(task.due_date.as_deref(), Some("2026-07-15T23:59:00"));
        assert_eq!(task.tag_ids, vec![tag_a, tag_b]);
        assert_eq!(count_task_tags(&conn, task.id), 2);

        // 子任务不继承日期和标签
        let sub_due: Option<String> = conn
            .query_row(
                "SELECT due_date FROM tasks WHERE parent_id = ?1 LIMIT 1",
                params![task.id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(sub_due.is_none());
        let sub_id: i64 = conn
            .query_row(
                "SELECT id FROM tasks WHERE parent_id = ?1 LIMIT 1",
                params![task.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count_task_tags(&conn, sub_id), 0);
    }

    #[test]
    fn test_apply_template_invalid_list_returns_error_and_no_partial_data() {
        let conn = setup_db();
        let template_id = insert_template(&conn, "无效清单测试", None, &["子任务"]);
        let before = count_tasks(&conn);

        let err = do_apply_template(&conn, template_id, 99999, &ApplyTemplateOptions::default())
            .unwrap_err();
        assert!(err.contains("目标清单不存在"), "错误信息: {}", err);
        assert_eq!(count_tasks(&conn), before, "失败后不得留下部分任务");
    }

    #[test]
    fn test_apply_template_invalid_tag_rolls_back() {
        let conn = setup_db();
        let list_id = insert_list(&conn, "工作");
        let valid_tag = insert_tag(&conn, "回滚-有效标签");
        let template_id = insert_template(&conn, "标签回滚", None, &["子任务"]);
        let before = count_tasks(&conn);

        let err = do_apply_template(
            &conn,
            template_id,
            list_id,
            &ApplyTemplateOptions {
                tag_ids: Some(vec![valid_tag, 88888]),
                ..Default::default()
            },
        )
        .unwrap_err();
        assert!(err.contains("标签不存在"), "错误信息: {}", err);
        assert_eq!(count_tasks(&conn), before);
        assert_eq!(count_task_tags(&conn, 1), 0);
    }

    #[test]
    fn test_apply_template_missing_template_returns_error() {
        let conn = setup_db();
        let list_id = insert_list(&conn, "工作");
        let before = count_tasks(&conn);

        let err = do_apply_template(&conn, 424242, list_id, &ApplyTemplateOptions::default())
            .unwrap_err();
        assert!(
            err.contains("模板不存在")
                || err.contains("no rows")
                || err.contains("QueryReturnedNoRows"),
            "错误信息: {}",
            err
        );
        assert_eq!(count_tasks(&conn), before);
    }

    #[test]
    fn test_apply_template_without_options_keeps_legacy_behavior() {
        let conn = setup_db();
        let list_id = insert_list(&conn, "兼容清单");
        let template_id = insert_template(
            &conn,
            "{project} 遗留调用",
            Some("备注 {project}"),
            &["子任务 {project}"],
        );

        // 模拟旧调用：options 使用 Default
        let task = do_apply_template(
            &conn,
            template_id,
            list_id,
            &ApplyTemplateOptions::default(),
        )
        .unwrap();

        assert_eq!(task.title, "{project} 遗留调用");
        assert_eq!(task.notes.as_deref(), Some("备注 {project}"));
        assert!(task.due_date.is_none());
        assert!(task.tag_ids.is_empty());

        let sub_title: String = conn
            .query_row(
                "SELECT title FROM tasks WHERE parent_id = ?1 LIMIT 1",
                params![task.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(sub_title, "子任务 {project}");
    }

    #[test]
    fn test_apply_template_empty_due_date_treated_as_unset() {
        let conn = setup_db();
        let list_id = insert_list(&conn, "工作");
        let template_id = insert_template(&conn, "空日期", None, &[]);

        let task = do_apply_template(
            &conn,
            template_id,
            list_id,
            &ApplyTemplateOptions {
                due_date: Some("   ".to_string()),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(task.due_date.is_none());
    }
}
