// Git 数据同步核心模块（P6-01）
//
// 基于 git2 crate（bundled libgit2）实现本地 SQLite 数据库文件（dida.db）
// 与远程 Git 仓库的双向同步。由于 dida.db 是二进制文件，无法做真正的三方合并，
// 因此采用 "last writer wins" 策略：
//   - 快进合并：直接更新本地分支引用
//   - 冲突：备份本地数据库后用远程版本覆盖本地，返回描述性错误

use git2::{Cred, FetchOptions, Oid, PushOptions, RemoteCallbacks, Repository, Signature};
use git2::build::{CheckoutBuilder, RepoBuilder};
use git2::Config;
use serde::{Deserialize, Serialize};
use std::cell::Cell;
use std::path::PathBuf;

/// 同步配置（持久化到 sync_config.json）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConfig {
    pub repo_url: String,
    pub branch: String,
    /// 本地仓库路径，运行时填充；序列化/反序列化时可为空
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

/// 构造 Git 远程回调（处理 HTTPS/SSH 认证）
///
/// HTTPS 优先使用 git 全局配置的 credential.helper（Windows 上通常是 Git Credential Manager）；
/// SSH 优先使用 ssh-agent；均失败时回退到默认凭据。
/// 使用 Cell<u32> 计数尝试次数，避免无限循环。
fn make_remote_callbacks() -> RemoteCallbacks<'static> {
    let mut callbacks = RemoteCallbacks::new();
    let attempts = Cell::new(0);
    callbacks.credentials(move |url, username_from_url, allowed_types| {
        let n = attempts.get();
        attempts.set(n + 1);
        if n >= 2 {
            return Err(git2::Error::from_str("credentials: exceeded max attempts"));
        }
        // SSH：使用 ssh-agent
        if allowed_types.contains(git2::CredentialType::SSH_KEY) {
            if let Some(_user) = username_from_url {
                return Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"));
            }
        }
        // HTTPS：优先使用 git credential.helper
        if allowed_types.contains(git2::CredentialType::USER_PASS_PLAINTEXT) {
            if let Ok(git_cfg) = Config::open_default() {
                if let Ok(cred) = Cred::credential_helper(&git_cfg, url, username_from_url) {
                    return Ok(cred);
                }
            }
            // 回退：默认凭据（可能触发交互式弹窗，取决于系统配置）
            return Cred::default();
        }
        Cred::default()
    });
    callbacks
}

/// 构造带认证的 FetchOptions
fn make_fetch_options() -> FetchOptions<'static> {
    let mut opts = FetchOptions::new();
    opts.remote_callbacks(make_remote_callbacks());
    opts
}

/// 构造带认证的 PushOptions
fn make_push_options() -> PushOptions<'static> {
    let mut opts = PushOptions::new();
    opts.remote_callbacks(make_remote_callbacks());
    opts
}

/// 初始化同步仓库：若本地路径已有 .git 则打开，否则 clone 远程仓库
pub fn init_sync_repo(config: &SyncConfig) -> Result<Repository, String> {
    let local = &config.local_path;
    if local.join(".git").exists() {
        let repo = Repository::open(local).map_err(|e| format!("打开本地仓库失败: {}", e))?;
        // 确保远程 origin URL 与配置一致
        match repo.find_remote("origin") {
            Ok(remote) => {
                if remote.url() != Some(config.repo_url.as_str()) {
                    repo.remote_set_url("origin", &config.repo_url)
                        .map_err(|e| format!("更新 origin URL 失败: {}", e))?;
                }
            }
            Err(_) => {
                repo.remote("origin", &config.repo_url)
                    .map_err(|e| format!("创建 origin 远程失败: {}", e))?;
            }
        }
        Ok(repo)
    } else {
        std::fs::create_dir_all(local).map_err(|e| format!("创建同步目录失败: {}", e))?;
        let mut builder = RepoBuilder::new();
        builder.fetch_options(make_fetch_options());
        builder.branch(&config.branch);
        builder
            .clone(&config.repo_url, local)
            .map_err(|e| format!("克隆远程仓库失败: {}", e))
    }
}

/// 拉取远程变更并尝试合并
///
/// 流程：fetch → 获取 FETCH_HEAD → merge_analysis → 快进/冲突处理
pub fn pull_changes(repo: &Repository, branch: &str) -> Result<(), String> {
    // 1. fetch 远程分支
    let mut remote = repo
        .find_remote("origin")
        .map_err(|e| format!("查找 origin 远程失败: {}", e))?;
    remote
        .fetch(&[branch], Some(&mut make_fetch_options()), None)
        .map_err(|e| format!("fetch 失败: {}", e))?;

    // 2. 获取 FETCH_HEAD 对应的 annotated commit
    let fetch_head = repo.find_reference("FETCH_HEAD");
    let fetch_commit = match fetch_head {
        Ok(ref_) => repo
            .reference_to_annotated_commit(&ref_)
            .map_err(|e| format!("转换 FETCH_HEAD 失败: {}", e))?,
        Err(_) => {
            // FETCH_HEAD 不存在（可能远程为空），无需操作
            return Ok(());
        }
    };

    // 3. 处理 unborn HEAD（本地仓库无任何提交）
    let head_res = repo.head();
    if head_res.is_err() {
        // 本地无 HEAD：直接将分支指向远程提交并 checkout
        let oid = fetch_commit.id();
        let _ = repo.reference(&format!("refs/heads/{}", branch), oid, true, "init from remote");
        repo.set_head(&format!("refs/heads/{}", branch))
            .map_err(|e| format!("set_head 失败: {}", e))?;
        let mut co = CheckoutBuilder::new();
        co.force();
        repo.checkout_head(Some(&mut co))
            .map_err(|e| format!("checkout_head 失败: {}", e))?;
        return Ok(());
    }

    // 4. merge_analysis（返回 (MergeAnalysis, MergePreference) 元组）
    let (analysis, _pref) = repo
        .merge_analysis(&[&fetch_commit])
        .map_err(|e| format!("merge_analysis 失败: {}", e))?;

    if analysis.is_up_to_date() {
        return Ok(());
    }

    if analysis.is_fast_forward() {
        // 快进：直接更新本地分支引用
        let refname = format!("refs/heads/{}", branch);
        let reference = repo
            .find_reference(&refname)
            .map_err(|e| format!("查找本地分支引用失败: {}", e))?;
        let mut mutable_ref = reference;
        mutable_ref
            .set_target(fetch_commit.id(), "fast-forward")
            .map_err(|e| format!("set_target 失败: {}", e))?;
        repo.set_head(&refname)
            .map_err(|e| format!("set_head 失败: {}", e))?;
        let mut co = CheckoutBuilder::new();
        co.force();
        repo.checkout_head(Some(&mut co))
            .map_err(|e| format!("checkout_head 失败: {}", e))?;
        return Ok(());
    }

    // 非快进：冲突，调用 handle_db_conflict
    handle_db_conflict(repo, branch)
}

/// 推送本地变更到远程
///
/// 流程：git add dida.db → commit → push
pub fn push_changes(repo: &Repository, branch: &str) -> Result<(), String> {
    // 1. git add dida.db（使用 index API，避免依赖 git 可执行文件）
    let mut index = repo
        .index()
        .map_err(|e| format!("获取 index 失败: {}", e))?;
    index
        .add_path(std::path::Path::new("dida.db"))
        .map_err(|e| format!("git add dida.db 失败: {}", e))?;
    index
        .write()
        .map_err(|e| format!("index.write 失败: {}", e))?;

    // 2. 构造 tree
    let tree_oid = index
        .write_tree_to(&repo)
        .map_err(|e| format!("write_tree 失败: {}", e))?;
    let tree = repo
        .find_tree(tree_oid)
        .map_err(|e| format!("find_tree 失败: {}", e))?;

    // 3. 构造 commit
    let sig = Signature::now("dida-clone-sync", "sync@dida-clone.local")
        .map_err(|e| format!("创建签名失败: {}", e))?;

    let head_res = repo.head();
    let parent_oids: Vec<Oid> = if let Ok(head_ref) = head_res {
        let parent_commit = head_ref
            .peel_to_commit()
            .map_err(|e| format!("peel_to_commit 失败: {}", e))?;
        // 检查是否有实际变更（避免 "nothing to commit"）
        let parent_tree = parent_commit
            .tree()
            .map_err(|e| format!("获取父提交 tree 失败: {}", e))?;
        let diff = repo
            .diff_tree_to_tree(Some(&parent_tree), Some(&tree), None)
            .map_err(|e| format!("diff_tree_to_tree 失败: {}", e))?;
        if diff.deltas().len() == 0 {
            // 无变更，跳过提交
            return Ok(());
        }
        vec![parent_commit.id()]
    } else {
        // 空仓库：首次提交无父提交
        vec![]
    };

    // 将 Oid 转为 Commit 引用，供 repo.commit() 使用
    let parent_commits_res: Result<Vec<git2::Commit>, _> = parent_oids
        .iter()
        .map(|oid| repo.find_commit(*oid))
        .collect();
    let parent_commits = parent_commits_res
        .map_err(|e| format!("find_commit 失败: {}", e))?;
    let parent_refs: Vec<&git2::Commit> = parent_commits.iter().collect();

    if parent_refs.is_empty() {
        repo.commit(
            Some(&format!("refs/heads/{}", branch)),
            &sig,
            &sig,
            "sync dida.db",
            &tree,
            &[],
        )
        .map_err(|e| format!("commit 失败: {}", e))?;
    } else {
        repo.commit(
            Some(&format!("refs/heads/{}", branch)),
            &sig,
            &sig,
            "sync dida.db",
            &tree,
            &parent_refs,
        )
        .map_err(|e| format!("commit 失败: {}", e))?;
    }

    // 4. push
    let mut remote = repo
        .find_remote("origin")
        .map_err(|e| format!("查找 origin 远程失败: {}", e))?;
    let refspec = format!("refs/heads/{}:refs/heads/{}", branch, branch);
    remote
        .push(&[&refspec], Some(&mut make_push_options()))
        .map_err(|e| format!("push 失败: {}", e))?;

    // 5. 记录同步时间
    write_last_sync(repo);
    Ok(())
}

/// 获取同步状态：fetch 后比较 ahead/behind
pub fn get_sync_status(repo: &Repository, branch: &str) -> Result<SyncStatus, String> {
    // fetch（忽略错误，便于在离线时也能返回本地状态）
    if let Ok(mut remote) = repo.find_remote("origin") {
        let _ = remote.fetch(&[branch], Some(&mut make_fetch_options()), None);
    }

    let local_oid = repo
        .head()
        .ok()
        .and_then(|h| h.target())
        .or_else(|| {
            repo.revparse_single(&format!("refs/heads/{}", branch))
                .ok()
                .and_then(|o| Some(o.id()))
        });

    let remote_ref = repo
        .find_reference(&format!("refs/remotes/origin/{}", branch))
        .or_else(|_| repo.find_reference("FETCH_HEAD"));
    let remote_oid = remote_ref.ok().and_then(|r| r.target());

    let (ahead, behind) = match (local_oid, remote_oid) {
        (Some(l), Some(r)) => repo
            .graph_ahead_behind(l, r)
            .unwrap_or((0, 0)),
        _ => (0, 0),
    };

    let has_conflict = repo.state() != git2::RepositoryState::Clean;

    let last_sync = read_last_sync(repo);

    Ok(SyncStatus {
        ahead,
        behind,
        last_sync,
        has_conflict,
    })
}

/// 处理数据库冲突：备份本地 dida.db，用远程版本覆盖本地
///
/// 返回描述性错误信息，前端据此提示用户冲突已发生
pub fn handle_db_conflict(repo: &Repository, branch: &str) -> Result<(), String> {
    let workdir = repo.workdir().ok_or("无法获取工作目录")?;
    let local_db = workdir.join("dida.db");
    let backup_db = workdir.join("dida.db.local.bak");

    // 1. 备份本地数据库
    if local_db.exists() {
        std::fs::copy(&local_db, &backup_db)
            .map_err(|e| format!("备份本地 dida.db 失败: {}", e))?;
    }

    // 2. 将本地分支引用重置为远程版本
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

    // 3. 强制 checkout 以覆盖工作区文件
    let mut co = CheckoutBuilder::new();
    co.force();
    repo.checkout_head(Some(&mut co))
        .map_err(|e| format!("checkout_head 失败: {}", e))?;

    // 4. 返回描述性错误（包含备份路径）
    Err(format!(
        "检测到数据库冲突。本地数据库已备份为 {}，远程版本已覆盖本地。请重启应用以加载远程数据。",
        backup_db.display()
    ))
}

/// 读取上次同步时间（工作目录下的 last_sync.txt）
fn read_last_sync(repo: &Repository) -> String {
    let workdir = match repo.workdir() {
        Some(w) => w,
        None => return String::new(),
    };
    let path = workdir.join("last_sync.txt");
    std::fs::read_to_string(path).unwrap_or_default()
}

/// 写入当前时间为上次同步时间
fn write_last_sync(repo: &Repository) {
    if let Some(workdir) = repo.workdir() {
        let path = workdir.join("last_sync.txt");
        let now = chrono::Local::now().to_rfc3339();
        let _ = std::fs::write(path, now);
    }
}
