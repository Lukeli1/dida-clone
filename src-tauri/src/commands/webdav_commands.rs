// WebDAV 数据同步 Tauri 命令模块（P11-04）
//
// 封装 webdav_sync.rs 核心函数为 Tauri command，供前端调用。
// 同步策略：比较本地与远程数据库文件的修改时间，决定上传或下载。

use crate::commands::secret_commands::get_secret_internal;
use crate::commands::sync_commands::load_sync_config;
use crate::webdav_sync::{WebDavClient, WebDavConfig};
use chrono::{DateTime, Utc};
use std::path::Path;
use tauri::{AppHandle, Emitter};

/// 默认远程路径
const DEFAULT_REMOTE_PATH: &str = "/dida-clone/dida.db";

/// WebDAV 密码的 secret key（与前端 SECRET_KEYS.webdavPassword 一致）
const WEBDAV_PASSWORD_SECRET_KEY: &str = "webdav_password";

/// 取 WebDAV 密码：优先用 sync_config 中的（兼容旧数据），为空则从后端 secret 读取。
/// 这样 sync_config.json 不再保存明文密码，密码统一存 secrets.json。
fn resolve_webdav_password(app: &AppHandle, config_password: &Option<String>) -> String {
    if let Some(p) = config_password {
        if !p.is_empty() {
            return p.clone();
        }
    }
    get_secret_internal(app, WEBDAV_PASSWORD_SECRET_KEY).unwrap_or_default()
}

/// 从 sync_config.json 构建 WebDavConfig
fn build_webdav_config_from_sync_config(
    url: String,
    username: String,
    password: String,
    remote_path: String,
) -> WebDavConfig {
    WebDavConfig {
        url,
        username,
        password,
        remote_path,
    }
}

/// 测试 WebDAV 连接
#[tauri::command]
pub async fn webdav_test_connection(
    url: String,
    username: String,
    password: String,
    remote_path: String,
) -> Result<bool, String> {
    let config = build_webdav_config_from_sync_config(url, username, password, remote_path);
    let client = WebDavClient::new(config);
    client.test_connection().await
}

/// 执行 WebDAV 同步：根据本地/远程文件修改时间决定上传或下载
/// 返回同步结果描述："upload" / "download" / "no-change"
#[tauri::command]
pub async fn webdav_sync(app: AppHandle, app_data_dir: String) -> Result<String, String> {
    let config = load_sync_config(&app_data_dir)?.ok_or("未配置同步")?;

    let url = config.webdav_url.clone().ok_or("未配置 WebDAV URL")?;
    let username = config
        .webdav_username
        .clone()
        .ok_or("未配置 WebDAV 用户名")?;
    let password = resolve_webdav_password(&app, &config.webdav_password);
    let remote_path = config
        .webdav_remote_path
        .clone()
        .unwrap_or_else(|| DEFAULT_REMOTE_PATH.to_string());

    let webdav_config = build_webdav_config_from_sync_config(url, username, password, remote_path);
    let client = WebDavClient::new(webdav_config);
    let local_db = Path::new(&app_data_dir).join("dida.db");

    // 获取本地数据库修改时间
    let local_mtime: Option<DateTime<Utc>> = std::fs::metadata(&local_db)
        .ok()
        .and_then(|m| m.modified().ok())
        .map(|t| t.into());

    // 获取远程文件修改时间
    let remote_mtime = client.get_remote_mtime().await?;

    // 冲突检测：读取上次同步时间，判断本地和远程是否都已修改
    // 仅当本地和远程都存在时才检测（远程不存在时无需检测冲突）
    if let (Some(local), Some(remote)) = (local_mtime, remote_mtime) {
        let last_sync_path = Path::new(&app_data_dir).join("webdav_last_sync.txt");
        let last_sync: Option<DateTime<Utc>> = std::fs::read_to_string(&last_sync_path)
            .ok()
            .and_then(|s| DateTime::parse_from_rfc3339(s.trim()).ok())
            .map(|dt| dt.with_timezone(&Utc));

        if let Some(last) = last_sync {
            // 宽限期（秒）：避免因客户端/服务器时钟差异导致的误报
            const CONFLICT_GRACE_SECS: i64 = 5;
            let local_modified = (local - last).num_seconds() > CONFLICT_GRACE_SECS;
            let remote_modified = (remote - last).num_seconds() > CONFLICT_GRACE_SECS;
            if local_modified && remote_modified {
                return Err(
                    "检测到同步冲突 (conflict)：本地和远程数据均已修改，请选择保留方式。"
                        .to_string(),
                );
            }
        }
    }

    let result = match (local_mtime, remote_mtime) {
        (None, _) => return Err("本地数据库不存在".to_string()),
        (Some(_), None) => {
            // 远程不存在 → 上传
            client.upload(&local_db).await?;
            "upload".to_string()
        }
        (Some(local), Some(remote)) => {
            if local > remote {
                // 本地更新 → 上传
                client.upload(&local_db).await?;
                "upload".to_string()
            } else if remote > local {
                // 远程更新 → 下载
                client.download(&local_db).await?;
                "download".to_string()
            } else {
                // 都未修改
                "no-change".to_string()
            }
        }
    };

    // 记录同步时间
    let last_sync_path = Path::new(&app_data_dir).join("webdav_last_sync.txt");
    let now = chrono::Local::now().to_rfc3339();
    let _ = std::fs::write(last_sync_path, now);

    // 发送同步完成事件
    let _ = app.emit("webdav-sync-complete", &result);

    Ok(result)
}

/// 强制上传本地数据库到 WebDAV
#[tauri::command]
pub async fn webdav_upload(app: AppHandle, app_data_dir: String) -> Result<(), String> {
    let config = load_sync_config(&app_data_dir)?.ok_or("未配置同步")?;

    let url = config.webdav_url.ok_or("未配置 WebDAV URL")?;
    let username = config.webdav_username.ok_or("未配置 WebDAV 用户名")?;
    let password = resolve_webdav_password(&app, &config.webdav_password);
    let remote_path = config
        .webdav_remote_path
        .unwrap_or_else(|| DEFAULT_REMOTE_PATH.to_string());

    let webdav_config = build_webdav_config_from_sync_config(url, username, password, remote_path);
    let client = WebDavClient::new(webdav_config);
    let local_db = Path::new(&app_data_dir).join("dida.db");

    client.upload(&local_db).await?;

    // 记录同步时间
    let last_sync_path = Path::new(&app_data_dir).join("webdav_last_sync.txt");
    let now = chrono::Local::now().to_rfc3339();
    let _ = std::fs::write(last_sync_path, now);

    Ok(())
}

/// 强制从 WebDAV 下载远程数据库
#[tauri::command]
pub async fn webdav_download(app: AppHandle, app_data_dir: String) -> Result<(), String> {
    let config = load_sync_config(&app_data_dir)?.ok_or("未配置同步")?;

    let url = config.webdav_url.ok_or("未配置 WebDAV URL")?;
    let username = config.webdav_username.ok_or("未配置 WebDAV 用户名")?;
    let password = resolve_webdav_password(&app, &config.webdav_password);
    let remote_path = config
        .webdav_remote_path
        .unwrap_or_else(|| DEFAULT_REMOTE_PATH.to_string());

    let webdav_config = build_webdav_config_from_sync_config(url, username, password, remote_path);
    let client = WebDavClient::new(webdav_config);
    let local_db = Path::new(&app_data_dir).join("dida.db");

    client.download(&local_db).await?;

    // 记录同步时间
    let last_sync_path = Path::new(&app_data_dir).join("webdav_last_sync.txt");
    let now = chrono::Local::now().to_rfc3339();
    let _ = std::fs::write(last_sync_path, now);

    Ok(())
}
