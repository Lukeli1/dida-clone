// Git 数据同步 Tauri 命令模块（P6-02）
//
// 封装 sync.rs 核心函数为 Tauri command，供前端调用。
// 配置文件路径使用 Tauri app_data_dir，不硬编码 Windows APPDATA。

use crate::sync::{self, SyncConfig, SyncStatus};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// 同步配置 DTO（前端交互用，不含 local_path）
#[derive(Debug, Serialize, Deserialize)]
pub struct SyncConfigDto {
    pub repo_url: String,
    pub branch: String,
    pub auto_sync: bool,
    pub auto_sync_interval_secs: u64,
}

/// 同步状态 DTO（返回给前端）
#[derive(Debug, Serialize)]
pub struct SyncStatusDto {
    pub enabled: bool,
    pub ahead: usize,
    pub behind: usize,
    pub last_sync: String,
    pub has_conflict: bool,
    pub conflict_message: Option<String>,
}

// ---- 类型转换 ----

impl From<SyncConfigDto> for SyncConfig {
    fn from(dto: SyncConfigDto) -> Self {
        SyncConfig {
            repo_url: dto.repo_url,
            branch: dto.branch,
            local_path: PathBuf::new(), // 运行时填充
            auto_sync: dto.auto_sync,
            auto_sync_interval_secs: dto.auto_sync_interval_secs,
        }
    }
}

impl From<SyncConfig> for SyncConfigDto {
    fn from(config: SyncConfig) -> Self {
        SyncConfigDto {
            repo_url: config.repo_url,
            branch: config.branch,
            auto_sync: config.auto_sync,
            auto_sync_interval_secs: config.auto_sync_interval_secs,
        }
    }
}

// ---- 辅助函数 ----

/// 返回 sync_config.json 的路径（app_data_dir/sync_config.json）
fn get_sync_config_path(app_data_dir: &str) -> PathBuf {
    Path::new(app_data_dir).join("sync_config.json")
}

/// 返回同步仓库的本地目录（app_data_dir/sync_repo）
fn get_sync_dir(app_data_dir: &str) -> PathBuf {
    Path::new(app_data_dir).join("sync_repo")
}

/// 从 sync_config.json 读取同步配置，并填充 local_path
fn load_sync_config(app_data_dir: &str) -> Result<Option<SyncConfig>, String> {
    let path = get_sync_config_path(app_data_dir);
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("读取同步配置失败: {}", e))?;
    let mut config: SyncConfig = serde_json::from_str(&content)
        .map_err(|e| format!("解析同步配置失败: {}", e))?;
    // 运行时填充 local_path
    config.local_path = get_sync_dir(app_data_dir);
    Ok(Some(config))
}

// ---- Tauri Commands ----

/// 读取同步配置
#[tauri::command]
pub fn get_sync_config(app_data_dir: String) -> Result<Option<SyncConfigDto>, String> {
    let config = load_sync_config(&app_data_dir)?;
    Ok(config.map(SyncConfigDto::from))
}

/// 保存同步配置到 sync_config.json
#[tauri::command]
pub fn save_sync_config(config: SyncConfigDto, app_data_dir: String) -> Result<(), String> {
    let path = get_sync_config_path(&app_data_dir);
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("序列化同步配置失败: {}", e))?;
    std::fs::write(&path, content)
        .map_err(|e| format!("写入同步配置失败: {}", e))?;
    Ok(())
}

/// 初始化同步仓库：clone 远程仓库 + 如果有 dida.db 则复制到 app_data_dir
#[tauri::command]
pub fn init_sync_repo(config: SyncConfigDto, app_data_dir: String) -> Result<(), String> {
    // 1. 保存配置
    let path = get_sync_config_path(&app_data_dir);
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("序列化同步配置失败: {}", e))?;
    std::fs::write(&path, content)
        .map_err(|e| format!("写入同步配置失败: {}", e))?;

    // 2. 构造 SyncConfig（填充 local_path）
    let sync_dir = get_sync_dir(&app_data_dir);
    let mut sync_config = SyncConfig::from(config);
    sync_config.local_path = sync_dir.clone();

    // 3. clone / 打开仓库
    let _repo = sync::init_sync_repo(&sync_config)?;

    // 4. 如果同步目录中有 dida.db 且 app_data_dir 中没有，复制到 app_data_dir
    let synced_db = sync_dir.join("dida.db");
    let live_db = Path::new(&app_data_dir).join("dida.db");
    if synced_db.exists() && !live_db.exists() {
        std::fs::copy(&synced_db, &live_db)
            .map_err(|e| format!("复制同步数据库到应用目录失败: {}", e))?;
    }

    Ok(())
}

/// 执行同步：复制 dida.db 到同步目录 → pull → push → 返回状态
#[tauri::command]
pub async fn sync_now(app_data_dir: String) -> Result<SyncStatusDto, String> {
    tokio::task::spawn_blocking(move || do_sync_now(&app_data_dir))
        .await
        .map_err(|e| format!("同步任务执行失败: {}", e))?
}

/// sync_now 的阻塞实现
fn do_sync_now(app_data_dir: &str) -> Result<SyncStatusDto, String> {
    // 1. 加载配置
    let config = load_sync_config(app_data_dir)?
        .ok_or("未配置同步")?;

    // 2. 打开/初始化仓库
    let repo = sync::init_sync_repo(&config)?;

    // 3. 复制 live dida.db 到同步目录
    let live_db = Path::new(app_data_dir).join("dida.db");
    let synced_db = config.local_path.join("dida.db");
    if live_db.exists() {
        std::fs::copy(&live_db, &synced_db)
            .map_err(|e| format!("复制数据库到同步目录失败: {}", e))?;
    }

    // 4. Pull 远程变更
    let mut conflict_msg: Option<String> = None;
    if let Err(e) = sync::pull_changes(&repo, &config.branch) {
        // pull 失败可能是冲突，记录错误信息但继续执行
        conflict_msg = Some(e);
    }

    // 5. Push 本地变更（仅在无冲突时）
    if conflict_msg.is_none() {
        if let Err(e) = sync::push_changes(&repo, &config.branch) {
            // push 失败也记录，但不中断状态返回
            conflict_msg = Some(format!("push 失败: {}", e));
        }
    }

    // 6. 获取同步状态
    let status: SyncStatus = sync::get_sync_status(&repo, &config.branch)?;

    Ok(SyncStatusDto {
        enabled: true,
        ahead: status.ahead,
        behind: status.behind,
        last_sync: status.last_sync,
        has_conflict: status.has_conflict || conflict_msg.is_some(),
        conflict_message: conflict_msg,
    })
}

/// 返回当前同步状态
#[tauri::command]
pub fn get_sync_status_cmd(app_data_dir: String) -> Result<SyncStatusDto, String> {
    // 未配置同步时返回 disabled 状态
    let config = match load_sync_config(&app_data_dir)? {
        Some(c) => c,
        None => {
            return Ok(SyncStatusDto {
                enabled: false,
                ahead: 0,
                behind: 0,
                last_sync: String::new(),
                has_conflict: false,
                conflict_message: None,
            });
        }
    };

    // 仓库不存在时返回 disabled
    if !config.local_path.join(".git").exists() {
        return Ok(SyncStatusDto {
            enabled: false,
            ahead: 0,
            behind: 0,
            last_sync: String::new(),
            has_conflict: false,
            conflict_message: None,
        });
    }

    let repo = sync::init_sync_repo(&config)?;
    let status = sync::get_sync_status(&repo, &config.branch)?;

    Ok(SyncStatusDto {
        enabled: true,
        ahead: status.ahead,
        behind: status.behind,
        last_sync: status.last_sync,
        has_conflict: status.has_conflict,
        conflict_message: None,
    })
}
