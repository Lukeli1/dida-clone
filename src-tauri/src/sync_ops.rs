// Git 同步操作模块（P7-04 拆分自 sync.rs）
//
// 包含 init_sync_repo / pull_changes / push_changes 三个核心操作函数，
// 以及认证回调、fetch/push options 等辅助函数。

use git2::{Cred, FetchOptions, Oid, PushOptions, RemoteCallbacks, Repository, Signature};
use git2::build::{CheckoutBuilder, RepoBuilder};
use git2::Config;
use std::cell::Cell;

use crate::sync::SyncConfig;

/// 构造 Git 远程回调（处理 HTTPS/SSH 认证）
fn make_remote_callbacks() -> RemoteCallbacks<'static> {
    let mut callbacks = RemoteCallbacks::new();
    let attempts = Cell::new(0);
    callbacks.credentials(move |url, username_from_url, allowed_types| {
        let n = attempts.get();
        attempts.set(n + 1);
        if n >= 2 {
            return Err(git2::Error::from_str("credentials: exceeded max attempts"));
        }
        if allowed_types.contains(git2::CredentialType::SSH_KEY) {
            if let Some(_user) = username_from_url {
                return Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"));
            }
        }
        if allowed_types.contains(git2::CredentialType::USER_PASS_PLAINTEXT) {
            if let Ok(git_cfg) = Config::open_default() {
                if let Ok(cred) = Cred::credential_helper(&git_cfg, url, username_from_url) {
                    return Ok(cred);
                }
            }
            return Cred::default();
        }
        Cred::default()
    });
    callbacks
}

fn make_fetch_options() -> FetchOptions<'static> {
    let mut opts = FetchOptions::new();
    opts.remote_callbacks(make_remote_callbacks());
    opts
}

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
pub fn pull_changes(repo: &Repository, branch: &str) -> Result<(), String> {
    let mut remote = repo
        .find_remote("origin")
        .map_err(|e| format!("查找 origin 远程失败: {}", e))?;
    remote
        .fetch(&[branch], Some(&mut make_fetch_options()), None)
        .map_err(|e| format!("fetch 失败: {}", e))?;

    let fetch_head = repo.find_reference("FETCH_HEAD");
    let fetch_commit = match fetch_head {
        Ok(ref_) => repo
            .reference_to_annotated_commit(&ref_)
            .map_err(|e| format!("转换 FETCH_HEAD 失败: {}", e))?,
        Err(_) => return Ok(()),
    };

    let head_res = repo.head();
    if head_res.is_err() {
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

    let (analysis, _pref) = repo
        .merge_analysis(&[&fetch_commit])
        .map_err(|e| format!("merge_analysis 失败: {}", e))?;

    if analysis.is_up_to_date() {
        return Ok(());
    }

    if analysis.is_fast_forward() {
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

    crate::sync::handle_db_conflict(repo, branch)
}

/// 推送本地变更到远程
pub fn push_changes(repo: &Repository, branch: &str) -> Result<(), String> {
    let mut index = repo
        .index()
        .map_err(|e| format!("获取 index 失败: {}", e))?;
    index
        .add_path(std::path::Path::new("dida.db"))
        .map_err(|e| format!("git add dida.db 失败: {}", e))?;
    index
        .write()
        .map_err(|e| format!("index.write 失败: {}", e))?;

    let tree_oid = index
        .write_tree_to(repo)
        .map_err(|e| format!("write_tree 失败: {}", e))?;
    let tree = repo
        .find_tree(tree_oid)
        .map_err(|e| format!("find_tree 失败: {}", e))?;

    let sig = Signature::now("dida-clone-sync", "sync@dida-clone.local")
        .map_err(|e| format!("创建签名失败: {}", e))?;

    let head_res = repo.head();
    let parent_oids: Vec<Oid> = if let Ok(head_ref) = head_res {
        let parent_commit = head_ref
            .peel_to_commit()
            .map_err(|e| format!("peel_to_commit 失败: {}", e))?;
        let parent_tree = parent_commit
            .tree()
            .map_err(|e| format!("获取父提交 tree 失败: {}", e))?;
        let diff = repo
            .diff_tree_to_tree(Some(&parent_tree), Some(&tree), None)
            .map_err(|e| format!("diff_tree_to_tree 失败: {}", e))?;
        if diff.deltas().len() == 0 {
            return Ok(());
        }
        vec![parent_commit.id()]
    } else {
        vec![]
    };

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
            &sig, &sig, "sync dida.db", &tree, &[],
        )
        .map_err(|e| format!("commit 失败: {}", e))?;
    } else {
        repo.commit(
            Some(&format!("refs/heads/{}", branch)),
            &sig, &sig, "sync dida.db", &tree, &parent_refs,
        )
        .map_err(|e| format!("commit 失败: {}", e))?;
    }

    let mut remote = repo
        .find_remote("origin")
        .map_err(|e| format!("查找 origin 远程失败: {}", e))?;
    let refspec = format!("refs/heads/{}:refs/heads/{}", branch, branch);
    remote
        .push(&[&refspec], Some(&mut make_push_options()))
        .map_err(|e| format!("push 失败: {}", e))?;

    crate::sync::write_last_sync(repo);
    Ok(())
}

/// 拉取远程最新引用（仅 fetch，不合并），用于冲突解决时获取最新远程数据
pub fn fetch_remote(repo: &Repository, branch: &str) -> Result<(), String> {
    let mut remote = repo
        .find_remote("origin")
        .map_err(|e| format!("查找 origin 远程失败: {}", e))?;
    remote
        .fetch(&[branch], Some(&mut make_fetch_options()), None)
        .map_err(|e| format!("fetch 失败: {}", e))?;
    Ok(())
}
