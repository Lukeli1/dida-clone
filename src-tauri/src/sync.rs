// Git 数据同步核心模块（P6-01 / P7-04 拆分后）
//
// 基于 git2 crate 实现本地 SQLite 数据库文件（dida.db）与远程 Git 仓库的双向同步。
// 采用 "last writer wins" 策略：快进则直接合并，冲突则备份本地后用远程覆盖。

use git2::build::CheckoutBuilder;
use git2::{FetchOptions, RemoteCallbacks, Repository};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[path = "sync_ops.rs"]
mod sync_ops;
pub use sync_ops::{init_sync_repo, pull_changes, push_changes};

/// 同步配置（持久化到 sync_config.json）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConfig {
    pub repo_url: String,
    pub branch: String,
    #[serde(default)]
    pub local_path: PathBuf,
    pub auto_sync: bool,
    pub auto_sync_interval_secs: u64,
}

/// 同步状态（同步后返回给前端）
#[derive(Debug, Serialize)]
pub struct SyncStatus {
    pub ahead: usize,
    pub behind: usize,
    pub last_sync: String,
    pub has_conflict: bool,
}

/// 获取同步状态：fetch 后比较 ahead/behind
pub fn get_sync_status(repo: &Repository, branch: &str) -> Result<SyncStatus, String> {
    if let Ok(mut remote) = repo.find_remote("origin") {
        let mut opts = FetchOptions::new();
        let mut callbacks = RemoteCallbacks::new();
        let _ = callbacks.credentials(|_, _, _| {
            git2::Cred::default().map_err(|e| e)
        });
        opts.remote_callbacks(callbacks);
        let _ = remote.fetch(&[branch], Some(&mut opts), None);
    }

    let local_oid = repo
        .head()
        .ok()
        .and_then(|h| h.target())
        .or_else(|| {
            repo.revparse_single(&format!("refs/heads/{}", branch))
                .ok()
                .map(|o| o.id())
        });

    let remote_ref = repo
        .find_reference(&format!("refs/remotes/origin/{}", branch))
        .or_else(|_| repo.find_reference("FETCH_HEAD"));
    let remote_oid = remote_ref.ok().and_then(|r| r.target());

    let (ahead, behind) = match (local_oid, remote_oid) {
        (Some(l), Some(r)) => repo.graph_ahead_behind(l, r).unwrap_or((0, 0)),
        _ => (0, 0),
    };

    let has_conflict = repo.state() != git2::RepositoryState::Clean;
    let last_sync = read_last_sync(repo);

    Ok(SyncStatus { ahead, behind, last_sync, has_conflict })
}

/// 处理数据库冲突：备份本地 dida.db，用远程版本覆盖本地
pub fn handle_db_conflict(repo: &Repository, branch: &str) -> Result<(), String> {
    let workdir = repo.workdir().ok_or("无法获取工作目录")?;
    let local_db = workdir.join("dida.db");
    let backup_db = workdir.join("dida.db.local.bak");

    if local_db.exists() {
        std::fs::copy(&local_db, &backup_db)
            .map_err(|e| format!("备份本地 dida.db 失败: {}", e))?;
    }

    let remote_ref = repo
        .find_reference(&format!("refs/remotes/origin/{}", branch))
        .or_else(|_| repo.find_reference("FETCH_HEAD"))
        .map_err(|e| format!("查找远程引用失败: {}", e))?;
    let remote_oid = remote_ref
        .target()
        .ok_or_else(|| "远程引用无目标 OID".to_string())?;

    let refname = format!("refs/heads/{}", branch);
    repo.reference(&refname, remote_oid, true, "resolve conflict: use remote")
        .map_err(|e| format!("重置分支引用失败: {}", e))?;
    repo.set_head(&refname)
        .map_err(|e| format!("set_head 失败: {}", e))?;

    let mut co = CheckoutBuilder::new();
    co.force();
    repo.checkout_head(Some(&mut co))
        .map_err(|e| format!("checkout_head 失败: {}", e))?;

    Err(format!(
        "检测到数据库冲突。本地数据库已备份为 {}，远程版本已覆盖本地。请重启应用以加载远程数据。",
        backup_db.display()
    ))
}

/// 读取上次同步时间
fn read_last_sync(repo: &Repository) -> String {
    let workdir = match repo.workdir() {
        Some(w) => w,
        None => return String::new(),
    };
    let path = workdir.join("last_sync.txt");
    std::fs::read_to_string(path).unwrap_or_default()
}

/// 写入当前时间为上次同步时间
pub fn write_last_sync(repo: &Repository) {
    if let Some(workdir) = repo.workdir() {
        let path = workdir.join("last_sync.txt");
        let now = chrono::Local::now().to_rfc3339();
        let _ = std::fs::write(path, now);
    }
}
