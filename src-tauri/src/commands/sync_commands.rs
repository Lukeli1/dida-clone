// Git 数据同步 Tauri 命令模块（P6-02）
//
// 封装 sync.rs 核心函数为 Tauri command，供前端调用。
// 配置文件路径使用 Tauri app_data_dir，不硬编码 Windows APPDATA。

use crate::commands::secret_commands::get_secret_internal;
use crate::sync::{self, SyncConfig, SyncStatus};
use crate::webdav_sync::{WebDavClient, WebDavConfig};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

/// 同步配置 DTO（前端交互用，不含 local_path）
#[derive(Debug, Serialize, Deserialize)]
pub struct SyncConfigDto {
    #[serde(default)]
    pub repo_url: String,
    #[serde(default)]
    pub branch: String,
    #[serde(default)]
    pub auto_sync: bool,
    #[serde(default)]
    pub auto_sync_interval_secs: u64,
    /// 同步方式："git" 或 "webdav"
    #[serde(default)]
    pub sync_type: String,
    #[serde(default)]
    pub webdav_url: Option<String>,
    #[serde(default)]
    pub webdav_username: Option<String>,
    #[serde(default)]
    pub webdav_password: Option<String>,
    #[serde(default)]
    pub webdav_remote_path: Option<String>,
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
            sync_type: dto.sync_type,
            webdav_url: dto.webdav_url,
            webdav_username: dto.webdav_username,
            webdav_password: dto.webdav_password,
            webdav_remote_path: dto.webdav_remote_path,
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
            sync_type: config.sync_type,
            webdav_url: config.webdav_url,
            webdav_username: config.webdav_username,
            // 敏感字段不返回给前端，避免旧 sync_config.json 中的明文密码再次泄漏到 UI/IPC。
            webdav_password: None,
            webdav_remote_path: config.webdav_remote_path,
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

/// 同步配置落盘前的安全净化：WebDAV 密码必须走 secret 存储，不能写入 sync_config.json。
fn sanitize_sync_config_for_persist(mut config: SyncConfigDto) -> SyncConfigDto {
    config.webdav_password = None;
    config
}

/// 从 sync_config.json 读取同步配置，并填充 local_path
pub(crate) fn load_sync_config(app_data_dir: &str) -> Result<Option<SyncConfig>, String> {
    let path = get_sync_config_path(app_data_dir);
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path).map_err(|e| format!("读取同步配置失败: {}", e))?;
    let mut config: SyncConfig =
        serde_json::from_str(&content).map_err(|e| format!("解析同步配置失败: {}", e))?;
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
    let config = sanitize_sync_config_for_persist(config);
    let content =
        serde_json::to_string_pretty(&config).map_err(|e| format!("序列化同步配置失败: {}", e))?;
    std::fs::write(&path, content).map_err(|e| format!("写入同步配置失败: {}", e))?;
    Ok(())
}

/// 初始化同步仓库：clone 远程仓库 + 如果有 dida.db 则复制到 app_data_dir
#[tauri::command]
pub fn init_sync_repo(config: SyncConfigDto, app_data_dir: String) -> Result<(), String> {
    // 1. 保存配置（落盘前剔除 WebDAV 密码，密码必须走 secret 存储）
    let path = get_sync_config_path(&app_data_dir);
    let config = sanitize_sync_config_for_persist(config);
    let content =
        serde_json::to_string_pretty(&config).map_err(|e| format!("序列化同步配置失败: {}", e))?;
    std::fs::write(&path, content).map_err(|e| format!("写入同步配置失败: {}", e))?;

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
    let config = load_sync_config(app_data_dir)?.ok_or("未配置同步")?;

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

    // WebDAV 同步状态：读取 webdav_last_sync.txt
    if config.is_webdav() {
        let last_sync_path = Path::new(&app_data_dir).join("webdav_last_sync.txt");
        let last_sync = std::fs::read_to_string(last_sync_path).unwrap_or_default();
        let enabled = config.webdav_url.is_some();
        return Ok(SyncStatusDto {
            enabled,
            ahead: 0,
            behind: 0,
            last_sync,
            has_conflict: false,
            conflict_message: None,
        });
    }

    // Git 同步状态：仓库不存在时返回 disabled
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

// ---- 冲突解决（P11-05） ----

/// 默认 WebDAV 远程路径
const CONFLICT_DEFAULT_REMOTE_PATH: &str = "/dida-clone/dida.db";

/// WebDAV 密码的 secret key（与前端一致）
const WEBDAV_PASSWORD_SECRET_KEY: &str = "webdav_password";

/// 取 WebDAV 密码：优先用 sync_config 中的，为空则从后端 secret 读取。
fn resolve_webdav_password(app: &AppHandle, config_password: &Option<String>) -> String {
    if let Some(p) = config_password {
        if !p.is_empty() {
            return p.clone();
        }
    }
    get_secret_internal(app, WEBDAV_PASSWORD_SECRET_KEY).unwrap_or_default()
}

/// 从 SyncConfig 构建 WebDavConfig
fn build_webdav_config_from_config(
    app: &AppHandle,
    config: &SyncConfig,
) -> Result<WebDavConfig, String> {
    Ok(WebDavConfig {
        url: config.webdav_url.clone().ok_or("未配置 WebDAV URL")?,
        username: config
            .webdav_username
            .clone()
            .ok_or("未配置 WebDAV 用户名")?,
        password: resolve_webdav_password(app, &config.webdav_password),
        remote_path: config
            .webdav_remote_path
            .clone()
            .unwrap_or_else(|| CONFLICT_DEFAULT_REMOTE_PATH.to_string()),
    })
}

/// 记录 WebDAV 同步时间到 webdav_last_sync.txt
fn write_webdav_last_sync(app_data_dir: &str) {
    let last_sync_path = Path::new(app_data_dir).join("webdav_last_sync.txt");
    let now = chrono::Local::now().to_rfc3339();
    let _ = std::fs::write(last_sync_path, now);
}

/// 解决同步冲突：根据策略保留本地 / 远程 / 备份
///
/// - "local"：强制上传本地数据库到远程（覆盖远程）
/// - "remote"：强制下载远程数据库覆盖本地
/// - "backup"：备份本地为 dida.db.local-backup，然后下载远程
///
/// 根据 sync_type 自动选择 Git 或 WebDAV 执行方式。
#[tauri::command]
pub async fn resolve_sync_conflict(
    app: AppHandle,
    strategy: String,
    app_data_dir: String,
) -> Result<(), String> {
    let config = load_sync_config(&app_data_dir)?.ok_or("未配置同步")?;

    match strategy.as_str() {
        "local" | "remote" | "backup" => {}
        _ => return Err("无效的冲突解决策略".to_string()),
    }

    if config.is_webdav() {
        resolve_webdav_conflict(&app, &strategy, &config, &app_data_dir).await
    } else {
        // Git 操作为阻塞调用，放到 spawn_blocking 中执行
        let strategy_clone = strategy.clone();
        let config_clone = config.clone();
        let app_data_dir_clone = app_data_dir.clone();
        tokio::task::spawn_blocking(move || {
            resolve_git_conflict(&strategy_clone, &config_clone, &app_data_dir_clone)
        })
        .await
        .map_err(|e| format!("冲突解决任务执行失败: {}", e))?
    }
}

/// Git 冲突解决（阻塞操作）
fn resolve_git_conflict(
    strategy: &str,
    config: &SyncConfig,
    app_data_dir: &str,
) -> Result<(), String> {
    let repo = sync::init_sync_repo(config)?;
    let live_db = Path::new(app_data_dir).join("dida.db");
    let synced_db = config.local_path.join("dida.db");

    match strategy {
        // 保留本地：将 live db 复制到同步目录，然后 commit + push
        "local" => {
            if live_db.exists() {
                std::fs::copy(&live_db, &synced_db)
                    .map_err(|e| format!("复制数据库到同步目录失败: {}", e))?;
            }
            sync::push_changes(&repo, &config.branch)?;
        }
        // 保留远程：fetch 最新远程，reset 到远程，复制到 live db
        "remote" => {
            sync::fetch_remote(&repo, &config.branch)?;
            sync::reset_to_remote(&repo, &config.branch)?;
            if synced_db.exists() {
                std::fs::copy(&synced_db, &live_db)
                    .map_err(|e| format!("复制远程数据库到应用目录失败: {}", e))?;
            }
        }
        // 两者都保留：备份 live db，然后使用远程
        "backup" => {
            let backup_db = Path::new(app_data_dir).join("dida.db.local-backup");
            if live_db.exists() {
                std::fs::copy(&live_db, &backup_db)
                    .map_err(|e| format!("备份本地数据库失败: {}", e))?;
            }
            sync::fetch_remote(&repo, &config.branch)?;
            sync::reset_to_remote(&repo, &config.branch)?;
            if synced_db.exists() {
                std::fs::copy(&synced_db, &live_db)
                    .map_err(|e| format!("复制远程数据库到应用目录失败: {}", e))?;
            }
        }
        _ => return Err("无效的冲突解决策略".to_string()),
    }
    Ok(())
}

/// WebDAV 冲突解决（异步操作）
async fn resolve_webdav_conflict(
    app: &AppHandle,
    strategy: &str,
    config: &SyncConfig,
    app_data_dir: &str,
) -> Result<(), String> {
    let webdav_config = build_webdav_config_from_config(app, config)?;
    let client = WebDavClient::new(webdav_config);
    let local_db = Path::new(app_data_dir).join("dida.db");

    match strategy {
        // 保留本地：上传到远程
        "local" => {
            client.upload(&local_db).await?;
            write_webdav_last_sync(app_data_dir);
        }
        // 保留远程：下载覆盖本地
        "remote" => {
            client.download(&local_db).await?;
            write_webdav_last_sync(app_data_dir);
        }
        // 两者都保留：备份本地，然后下载远程
        "backup" => {
            let backup_db = Path::new(app_data_dir).join("dida.db.local-backup");
            if local_db.exists() {
                std::fs::copy(&local_db, &backup_db)
                    .map_err(|e| format!("备份本地数据库失败: {}", e))?;
            }
            client.download(&local_db).await?;
            write_webdav_last_sync(app_data_dir);
        }
        _ => return Err("无效的冲突解决策略".to_string()),
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn sample_dto_with_password() -> SyncConfigDto {
        SyncConfigDto {
            repo_url: "https://example.com/repo.git".to_string(),
            branch: "main".to_string(),
            auto_sync: true,
            auto_sync_interval_secs: 900,
            sync_type: "webdav".to_string(),
            webdav_url: Some("https://dav.example.com/".to_string()),
            webdav_username: Some("alice".to_string()),
            webdav_password: Some("plain-secret".to_string()),
            webdav_remote_path: Some("/dida-clone/dida.db".to_string()),
        }
    }

    #[test]
    fn sanitize_sync_config_for_persist_strips_webdav_password() {
        let sanitized = sanitize_sync_config_for_persist(sample_dto_with_password());

        assert_eq!(sanitized.sync_type, "webdav");
        assert_eq!(sanitized.webdav_username.as_deref(), Some("alice"));
        assert!(sanitized.webdav_password.is_none());
    }

    #[test]
    fn sync_config_dto_from_internal_config_never_exposes_webdav_password() {
        let dto = SyncConfigDto::from(SyncConfig {
            repo_url: "https://example.com/repo.git".to_string(),
            branch: "main".to_string(),
            local_path: PathBuf::from("sync_repo"),
            auto_sync: true,
            auto_sync_interval_secs: 900,
            sync_type: "webdav".to_string(),
            webdav_url: Some("https://dav.example.com/".to_string()),
            webdav_username: Some("alice".to_string()),
            webdav_password: Some("plain-secret".to_string()),
            webdav_remote_path: Some("/dida-clone/dida.db".to_string()),
        });

        assert!(dto.webdav_password.is_none());
    }

    #[test]
    fn save_sync_config_never_writes_plain_webdav_password() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "dida_sync_config_test_{}_{}",
            std::process::id(),
            suffix
        ));
        std::fs::create_dir_all(&dir).unwrap();

        save_sync_config(
            sample_dto_with_password(),
            dir.to_string_lossy().to_string(),
        )
        .unwrap();
        let content = std::fs::read_to_string(dir.join("sync_config.json")).unwrap();

        assert!(!content.contains("plain-secret"));
        let json: serde_json::Value = serde_json::from_str(&content).unwrap();
        assert!(json.get("webdav_password").unwrap().is_null());

        std::fs::remove_dir_all(dir).unwrap();
    }
}
