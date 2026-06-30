# 滴答清单复刻 — Phase 6 Git 同步与收尾打磨文档

**生成日期**：2026-06-29 15:35 (Asia/Shanghai)
**当前版本**：v1.25.0（Phase 5 主题系统重构已完成）
**前置条件**：Phase 1 ✅、Phase 2 ✅、Phase 3 ✅、Phase 4 ✅、Phase 5 ✅
**项目路径**：`C:\Users\50441\Documents\trae开发\滴答清单复刻`
**GitHub 远程**：`https://github.com/Lukeli1/dida-clone.git`（分支 `main`）

---

## 一、Phase 6 目标

**Phase 6 聚焦两件事：Git 数据同步 + 拆完最后 2 个超 300 行的 Rust 文件。**

| 方向 | 核心目标 | 量化指标 |
|---|---|---|
| A. Git 数据同步（⭐ 用户指定） | dida.db 通过私有 Git 仓库在多台电脑间同步 | 2 台电脑可同步 |
| B. Rust 文件收尾 | 0 个 .rs 文件超过 300 行 | 2 个 → 0 个 |
| C. 同步 UI + 设置入口 | 设置页有"同步"面板 | 1 个新面板 |

---

## 二、当前状态基线（v1.25.0）

### 2.1 数据库文件位置

```
app_data_dir/                          ← Tauri 管理的应用数据目录
  └── dida.db                          ← 主数据库（SQLite）
```

**路径来源**（`lib.rs` L26-30）：
```rust
let app_data_dir = app.path().app_data_dir()?;
std::fs::create_dir_all(&app_data_dir)?;
let db = db::init_db(app_data_dir.to_str().unwrap())?;
```

**Windows 实际路径**：`C:\Users\50441\AppData\Roaming\com.dida-clone.app\dida.db`

### 2.2 .gitignore 排除了 *.db

```
# Database
*.db
*.sqlite
```

**问题**：dida.db 被排除，无法直接放到项目仓库同步。

### 2.3 远程仓库

- 仓库：`https://github.com/Lukeli1/dida-clone.git`
- 分支：`main`
- 已缓存凭证（Windows Credential Manager）

### 2.4 仍超 300 行的 .rs 文件

| 文件 | 行数 | 备注 |
|---|---|---|
| data_export.rs | 387 | Phase 4 新增，导出 JSON/CSV/Markdown |
| task_crud.rs | 343 | Phase 2 拆分产物，任务 CRUD |

---

## 三、Git 同步方案设计

### 3.1 方案选型

**方案：独立数据仓库 + Rust 端 Git 操作**

```
项目代码仓库（Lukeli1/dida-clone）   ← 代码版本管理
       ↓ 不同仓库
数据同步仓库（Lukeli1/dida-clone-data）← 只存 dida.db
       ↑
   app_data_dir/dida-clone-data/     ← 本地 clone 到这里
       └── dida.db
```

**为什么用独立仓库**：
- 代码仓库 `.gitignore` 排除了 `*.db`，不能直接放
- 数据和代码分离，互不干扰
- 数据仓库可以设为 Private，只你一个人能访问
- 代码仓库的 commit 历史不会被数据变更污染

### 3.2 同步流程

```
启动应用
  ↓
检查 app_data_dir/dida-clone-data/ 是否存在
  ├─ 不存在 → 首次使用 → 引导用户配置 Git 仓库 URL → clone
  └─ 存在 → 读取 dida.db 路径 → 用这个路径初始化数据库
  ↓
用户操作任务
  ↓
数据变更 → 写入 dida.db
  ↓
定时器（5 分钟）/ 手动触发 → git add + commit + push
  ↓
另一台电脑启动 → git pull → 读取最新 dida.db
```

### 3.3 冲突处理

**场景**：两台电脑同时修改，push 时冲突。

**处理策略**（简单实用）：
1. `git pull --rebase` 尝试自动合并
2. 如果 dida.db 二进制冲突（SQLite 是二进制文件，Git 无法 merge）：
   - 保留远程版本（`theirs`），本地版本备份为 `dida.db.local.bak`
   - 提示用户：本地有备份数据，远程数据已覆盖本地
3. 用户可以手动用导出/导入功能合并数据

**为什么不用 SQLite 的同步机制**：
- SQLite 是单文件数据库，不适合多端写入
- 真正的多端实时同步需要 CRDT 或服务端，复杂度过高
- Git 同步对自用场景够用，冲突时保留备份即可

---

## 四、任务清单（7 个任务，3 个方向）

### 方向 A：Git 同步后端（3 个任务）

---

### P6-01：Rust 端 Git 同步模块

**目标**：在 Rust 后端实现 Git 同步核心逻辑。

**新增依赖**（`Cargo.toml`）：
```toml
git2 = "0.19"           # libgit2 绑定
```

**新增文件**：`src-tauri/src/sync.rs`

**核心函数**：
```rust
use git2::{Repository, RepositoryInitOptions, Signature, Index, Oid};
use std::path::{Path, PathBuf};

/// 同步配置
pub struct SyncConfig {
    pub repo_url: String,        // Git 仓库 URL
    pub branch: String,          // 分支名，默认 "main"
    pub local_path: PathBuf,     // 本地 clone 路径
    pub auto_sync: bool,         // 是否自动同步
    pub auto_sync_interval_secs: u64,  // 自动同步间隔，默认 300
}

/// 初始化同步仓库
/// - 如果本地路径已有仓库，打开它
/// - 如果没有，clone 远程仓库
/// - 如果远程仓库不存在（首次），提示用户先在 GitHub 创建
pub fn init_sync_repo(config: &SyncConfig) -> Result<Repository, String> {
    let path = &config.local_path;
    if path.join(".git").exists() {
        Repository::open(path).map_err(|e| e.to_string())
    } else {
        Repository::clone(&config.repo_url, path, None)
            .map_err(|e| format!("Clone 失败: {}. 请确认仓库 URL 正确且仓库已创建。", e))
    }
}

/// 拉取远程数据
pub fn pull_changes(repo: &Repository, branch: &str) -> Result<(), String> {
    let mut remote = repo.find_remote("origin")
        .or_else(|_| repo.remote_anonymous("origin"))
        .map_err(|e| e.to_string())?;
    remote.fetch(&[branch], None, None)
        .map_err(|e| format!("Fetch 失败: {}", e))?;

    let fetch_head = repo.find_reference("FETCH_HEAD")
        .map_err(|e| e.to_string())?;
    let fetch_commit = repo.reference_to_annotated_commit(&fetch_head)
        .map_err(|e| e.to_string())?;

    let analysis = repo.merge_analysis(&[&fetch_commit])
        .map_err(|e| e.to_string())?;

    if analysis.0.is_up_to_date() {
        return Ok(());
    }

    if analysis.0.is_fast_forward() {
        // 快进合并，直接拉取
        let refname = format!("refs/heads/{}", branch);
        let mut reference = repo.find_reference(&refname)
            .map_err(|e| e.to_string())?;
        reference.set_target(fetch_commit.id(), "Fast-forward")?;
        repo.set_head(&refname).map_err(|e| e.to_string())?;
        repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    // 二进制冲突（dida.db 无法 merge）
    // 策略：保留远程版本，本地备份
    handle_db_conflict(repo, branch)?;
    Ok(())
}

/// 推送本地数据
pub fn push_changes(repo: &Repository, branch: &str) -> Result<(), String> {
    // 1. git add dida.db
    let mut index = repo.index().map_err(|e| e.to_string())?;
    index.add_path(Path::new("dida.db")).map_err(|e| e.to_string())?;
    index.write().map_err(|e| e.to_string())?;
    let tree_oid = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(tree_oid).map_err(|e| e.to_string())?;

    // 2. git commit
    let head = repo.head().map_err(|e| e.to_string())?;
    let parent_commit = head.peel_to_commit().map_err(|e| e.to_string())?;
    let sig = Signature::now("Dida Clone", "dida-clone@local")
        .map_err(|e| e.to_string())?;
    repo.commit(
        Some("HEAD"),
        &sig, &sig,
        &format!("Sync at {}", chrono::Local::now().format("%Y-%m-%d %H:%M:%S")),
        &tree,
        &[&parent_commit],
    ).map_err(|e| e.to_string())?;

    // 3. git push
    let mut remote = repo.find_remote("origin")
        .or_else(|_| repo.remote_anonymous("origin"))
        .map_err(|e| e.to_string())?;
    let refspec = format!("refs/heads/{}:refs/heads/{}", branch, branch);
    remote.push(&[&refspec], None)
        .map_err(|e| format!("Push 失败: {}. 请检查网络和凭证。", e))?;
    Ok(())
}

/// 处理 dida.db 二进制冲突
/// 保留远程版本，本地版本备份为 dida.db.local.bak
fn handle_db_conflict(repo: &Repository, branch: &str) -> Result<(), String> {
    let db_path = repo.workdir().unwrap().join("dida.db");
    let backup_path = repo.workdir().unwrap().join("dida.db.local.bak");

    // 备份本地版本
    if db_path.exists() {
        std::fs::copy(&db_path, &backup_path)
            .map_err(|e| format!("备份本地数据库失败: {}", e))?;
    }

    // 用远程版本覆盖本地
    let refname = format!("refs/heads/{}", branch);
    let mut reference = repo.find_reference(&refname)
        .map_err(|e| e.to_string())?;
    let fetch_head = repo.find_reference("FETCH_HEAD")
        .map_err(|e| e.to_string())?;
    let fetch_commit = repo.reference_to_annotated_commit(&fetch_head)
        .map_err(|e| e.to_string())?;
    reference.set_target(fetch_commit.id(), "Conflict resolved: keep remote")?;
    repo.set_head(&refname).map_err(|e| e.to_string())?;
    repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
        .map_err(|e| e.to_string())?;

    Err(format!(
        "检测到数据冲突。已保留远程版本，本地版本备份为 dida.db.local.bak。\
         如需合并数据，请使用导出/导入功能手动处理。"
    ))
}

/// 获取同步状态
pub fn get_sync_status(repo: &Repository, branch: &str) -> Result<SyncStatus, String> {
    let head = repo.head().map_err(|e| e.to_string())?;
    let local_oid = head.target().ok_or("无法获取本地 commit")?;

    let mut remote = repo.find_remote("origin")
        .or_else(|_| repo.remote_anonymous("origin"))
        .map_err(|e| e.to_string())?;
    remote.fetch(&[branch], None, None)
        .map_err(|e| e.to_string())?;

    let fetch_head = repo.find_reference("FETCH_HEAD")
        .map_err(|e| e.to_string())?;
    let fetch_commit = repo.reference_to_annotated_commit(&fetch_head)
        .map_err(|e| e.to_string())?;
    let remote_oid = fetch_commit.id();

    let ahead = count_ahead_behind(repo, local_oid, remote_oid)?.0;
    let behind = count_ahead_behind(repo, local_oid, remote_oid)?.1;

    Ok(SyncStatus {
        ahead,
        behind,
        last_sync: chrono::Local::now().to_rfc3339(),
        has_conflict: false,
    })
}

pub struct SyncStatus {
    pub ahead: usize,      // 本地比远程多几个 commit
    pub behind: usize,     // 本地比远程少几个 commit
    pub last_sync: String, // 最后同步时间
    pub has_conflict: bool,
}

fn count_ahead_behind(repo: &Repository, local: Oid, remote: Oid) -> Result<(usize, usize), String> {
    repo.graph_ahead_behind(local, remote)
        .map_err(|e| e.to_string())
}
```

**操作步骤**：
1. 在 `Cargo.toml` 添加 `git2 = "0.19"` 依赖
2. 创建 `src-tauri/src/sync.rs`，实现上述函数
3. 在 `lib.rs` 中 `mod sync;`
4. 验证 `cargo check` 通过（**注意：Windows 需要安装 libgit2，`git2` crate 默认会编译 bundled 版本**）

**注意事项**：
- `git2` crate 默认使用 bundled libgit2，不需要系统安装
- 但需要 cmake（Windows 一般已有）
- 如果编译失败，检查是否安装了 Visual Studio Build Tools

**验收**：
- [ ] `sync.rs` 创建，包含 init/pull/push/status/conflict 处理函数
- [ ] `cargo check` 通过
- [ ] 无编译警告

---

### P6-02：Tauri Command 封装 + 数据库路径切换

**目标**：把 sync.rs 的函数封装为 Tauri command，前端可调用。同时修改数据库初始化逻辑，支持从同步目录读取 dida.db。

**新增文件**：`src-tauri/src/commands/sync_commands.rs`

**核心代码**：
```rust
use tauri::State;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use crate::sync::{self, SyncConfig, SyncStatus};
use crate::db::DbState;

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncConfigDto {
    pub repo_url: String,
    pub branch: String,
    pub auto_sync: bool,
    pub auto_sync_interval_secs: u64,
}

#[derive(Debug, Serialize)]
pub struct SyncStatusDto {
    pub enabled: bool,
    pub ahead: usize,
    pub behind: usize,
    pub last_sync: String,
    pub has_conflict: bool,
    pub conflict_message: Option<String>,
}

/// 获取同步配置
#[tauri::command]
pub fn get_sync_config() -> Result<Option<SyncConfigDto>, String> {
    let config = load_sync_config()?;
    Ok(config.map(|c| SyncConfigDto {
        repo_url: c.repo_url,
        branch: c.branch,
        auto_sync: c.auto_sync,
        auto_sync_interval_secs: c.auto_sync_interval_secs,
    }))
}

/// 保存同步配置
#[tauri::command]
pub fn save_sync_config(config: SyncConfigDto) -> Result<(), String> {
    let config_path = get_sync_config_path()?;
    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| e.to_string())?;
    std::fs::write(&config_path, json)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 初始化同步仓库（首次使用时调用）
#[tauri::command]
pub async fn init_sync_repo(config: SyncConfigDto, app_data_dir: String) -> Result<(), String> {
    let local_path = PathBuf::from(&app_data_dir).join("dida-clone-data");
    let sync_config = SyncConfig {
        repo_url: config.repo_url,
        branch: config.branch,
        local_path: local_path.clone(),
        auto_sync: config.auto_sync,
        auto_sync_interval_secs: config.auto_sync_interval_secs,
    };
    sync::init_sync_repo(&sync_config)?;

    // 如果 clone 下来的仓库里有 dida.db，复制到 app_data_dir
    let synced_db = local_path.join("dida.db");
    if synced_db.exists() {
        let target_db = PathBuf::from(&app_data_dir).join("dida.db");
        std::fs::copy(&synced_db, &target_db)
            .map_err(|e| format!("复制数据库失败: {}", e))?;
    }
    Ok(())
}

/// 手动同步（push + pull）
#[tauri::command]
pub async fn sync_now(app_data_dir: String) -> Result<SyncStatusDto, String> {
    let config = load_sync_config()?
        .ok_or("同步未配置")?;
    let local_path = PathBuf::from(&app_data_dir).join("dida-clone-data");

    // 1. 把当前 dida.db 复制到同步目录
    let source_db = PathBuf::from(&app_data_dir).join("dida.db");
    let target_db = local_path.join("dida.db");
    std::fs::copy(&source_db, &target_db)
        .map_err(|e| format!("复制数据库到同步目录失败: {}", e))?;

    // 2. 打开仓库
    let repo = git2::Repository::open(&local_path)
        .map_err(|e| e.to_string())?;

    // 3. 先 pull（获取远程更新）
    match sync::pull_changes(&repo, &config.branch) {
        Ok(()) => {}
        Err(e) => {
            // 冲突时，pull 已经处理了备份，继续
            return Ok(SyncStatusDto {
                enabled: true,
                ahead: 0,
                behind: 0,
                last_sync: chrono::Local::now().to_rfc3339(),
                has_conflict: true,
                conflict_message: Some(e),
            });
        }
    }

    // 4. push 本地变更
    sync::push_changes(&repo, &config.branch)?;

    // 5. 获取状态
    let status = sync::get_sync_status(&repo, &config.branch)?;
    Ok(SyncStatusDto {
        enabled: true,
        ahead: status.ahead,
        behind: status.behind,
        last_sync: status.last_sync,
        has_conflict: false,
        conflict_message: None,
    })
}

/// 获取同步状态
#[tauri::command]
pub async fn get_sync_status_cmd(app_data_dir: String) -> Result<SyncStatusDto, String> {
    let config = match load_sync_config()? {
        Some(c) => c,
        None => return Ok(SyncStatusDto {
            enabled: false,
            ahead: 0,
            behind: 0,
            last_sync: String::new(),
            has_conflict: false,
            conflict_message: None,
        }),
    };
    let local_path = PathBuf::from(&app_data_dir).join("dida-clone-data");

    if !local_path.join(".git").exists() {
        return Ok(SyncStatusDto {
            enabled: false,
            ahead: 0,
            behind: 0,
            last_sync: String::new(),
            has_conflict: false,
            conflict_message: None,
        });
    }

    let repo = git2::Repository::open(&local_path)
        .map_err(|e| e.to_string())?;
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

/// 加载同步配置（从 app_data_dir/sync_config.json）
fn load_sync_config() -> Result<Option<SyncConfig>, String> {
    let config_path = get_sync_config_path()?;
    if !config_path.exists() {
        return Ok(None);
    }
    let json = std::fs::read_to_string(&config_path)
        .map_err(|e| e.to_string())?;
    let dto: SyncConfigDto = serde_json::from_str(&json)
        .map_err(|e| e.to_string())?;
    Ok(Some(SyncConfig {
        repo_url: dto.repo_url,
        branch: dto.branch,
        local_path: PathBuf::new(), // 运行时填充
        auto_sync: dto.auto_sync,
        auto_sync_interval_secs: dto.auto_sync_interval_secs,
    }))
}

fn get_sync_config_path() -> Result<PathBuf, String> {
    let app_data = std::env::var("APPDATA")
        .map_err(|_| "无法获取 APPDATA 环境变量".to_string())?;
    Ok(PathBuf::from(app_data)
        .join("com.dida-clone.app")
        .join("sync_config.json"))
}
```

**修改 `lib.rs`**：
```rust
// 在 invoke_handler 中注册新命令
.invoke_handler(tauri::generate_handler![
    // ... 现有命令 ...
    commands::sync_commands::get_sync_config,
    commands::sync_commands::save_sync_config,
    commands::sync_commands::init_sync_repo,
    commands::sync_commands::sync_now,
    commands::sync_commands::get_sync_status_cmd,
])
```

**验收**：
- [ ] `sync_commands.rs` 创建，5 个 Tauri command 实现
- [ ] `lib.rs` 注册 5 个新命令
- [ ] `cargo check` 通过
- [ ] 前端可通过 `invoke('sync_now')` 触发同步

---

### P6-03：自动同步定时器 + 启动时同步

**目标**：应用启动时自动 pull，运行中定时 push，关闭时 push。

**修改 `lib.rs`**：在 `setup` 闭包中启动定时器。

```rust
.setup(|app| {
    // ... 现有初始化 ...

    // 启动同步定时器（如果已配置）
    let app_handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        // 启动时延迟 10 秒 pull
        tokio::time::sleep(std::time::Duration::from_secs(10)).await;

        loop {
            // 检查是否配置了同步
            let config = match commands::sync_commands::get_sync_config() {
                Ok(Some(c)) if c.auto_sync => c,
                _ => {
                    // 未配置或未启用，5 分钟后重试
                    tokio::time::sleep(std::time::Duration::from_secs(300)).await;
                    continue;
                }
            };

            // 执行同步
            let app_data_dir = app_handle.path().app_data_dir()
                .map_err(|e| e.to_string())
                .unwrap_or_default();
            let _ = commands::sync_commands::sync_now(app_data_dir.to_str().unwrap().to_string()).await;

            // 等待下次同步
            let interval = config.auto_sync_interval_secs;
            tokio::time::sleep(std::time::Duration::from_secs(interval)).await;
        }
    });

    Ok(())
})
```

**注意**：需要在 `Cargo.toml` 添加 `tokio = { version = "1", features = ["time"] }`（如果 Tauri 没有自带）。

**验收**：
- [ ] 启动时自动 pull（延迟 10 秒）
- [ ] 运行中定时 push（默认 5 分钟）
- [ ] 可通过配置关闭自动同步
- [ ] `cargo check` 通过

---

### 方向 B：同步 UI + 设置入口（2 个任务）

---

### P6-04：前端同步 API 封装 + 类型定义

**目标**：在前端封装同步 API，提供类型安全的调用接口。

**新增文件**：`src/types/sync.ts`

```typescript
export interface SyncConfig {
  repo_url: string
  branch: string
  auto_sync: boolean
  auto_sync_interval_secs: number
}

export interface SyncStatus {
  enabled: boolean
  ahead: number
  behind: number
  last_sync: string
  has_conflict: boolean
  conflict_message: string | null
}
```

**修改 `src/api.ts`**，新增同步 API：
```typescript
import type { SyncConfig, SyncStatus } from './types/sync'

export const syncApi = {
  getConfig: (): Promise<SyncConfig | null> =>
    invoke<SyncConfig | null>('get_sync_config'),
  saveConfig: (config: SyncConfig): Promise<void> =>
    invoke<void>('save_sync_config', { config }),
  initRepo: (config: SyncConfig): Promise<void> =>
    invoke<void>('init_sync_repo', { config }),
  syncNow: (): Promise<SyncStatus> =>
    invoke<SyncStatus>('sync_now'),
  getStatus: (): Promise<SyncStatus> =>
    invoke<SyncStatus>('get_sync_status_cmd'),
}
```

**验收**：
- [ ] `types/sync.ts` 创建
- [ ] `api.ts` 新增 `syncApi`
- [ ] `tsc --noEmit` 通过

---

### P6-05：SyncPanel 同步设置面板

**目标**：在设置页添加"数据同步"面板，可配置 Git 仓库 URL、手动同步、查看状态。

**新增文件**：`src/components/settings/SyncPanel.tsx`

**UI 设计**：
```
┌─────────────────────────────────────────────────┐
│ 数据同步                                         │
│                                                  │
│ ┌─ 未配置时 ───────────────────────────────────┐ │
│ │                                              │ │
│ │ Git 仓库 URL                                 │ │
│ │ [https://github.com/Lukeli1/dida-clone-data] │ │
│ │                                              │ │
│ │ 分支                                          │ │
│ │ [main]                                       │ │
│ │                                              │ │
│ │ ☑ 自动同步（每 5 分钟）                       │ │
│ │ 同步间隔（分钟）                              │ │
│ │ [5]                                          │ │
│ │                                              │ │
│ │ [初始化同步仓库]                              │ │
│ │                                              │ │
│ │ 📖 使用说明：                                 │ │
│ │ 1. 先在 GitHub 创建一个私有空仓库              │ │
│ │ 2. 填写仓库 URL                               │ │
│ │ 3. 点击"初始化同步仓库"                        │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ ┌─ 已配置时 ───────────────────────────────────┐ │
│ │                                              │ │
│ │ 同步状态：✅ 已同步                           │ │
│ │ 最后同步：2026-06-29 15:30:00                 │ │
│ │ 本地领先：0 个提交                            │ │
│ │ 落后远程：0 个提交                            │ │
│ │                                              │ │
│ │ [立即同步]  [修改配置]  [关闭同步]             │ │
│ │                                              │ │
│ │ ⚠️ 冲突处理：                                 │ │
│ │ 如果检测到冲突，本地数据会备份为               │ │
│ │ dida.db.local.bak，远程数据覆盖本地。          │ │
│ │ 如需合并，请使用导出/导入功能。                │ │
│ └──────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**操作步骤**：
1. 创建 `src/components/settings/SyncPanel.tsx`
2. 使用 `useTheme()` 的 CSS 变量，保持与其他面板风格一致
3. 在 `SettingsView.tsx` 中注册"数据同步"面板
4. 三个状态：
   - 未配置：显示输入框 + 初始化按钮
   - 已配置：显示状态 + 同步按钮
   - 冲突：显示警告 + 备份文件路径

**验收**：
- [ ] `SyncPanel.tsx` 创建
- [ ] `SettingsView.tsx` 注册新面板
- [ ] 可配置 Git 仓库 URL + 分支 + 自动同步
- [ ] 可手动触发同步
- [ ] 显示同步状态（领先/落后/最后同步时间）
- [ ] 冲突时显示警告
- [ ] `tsc --noEmit` 通过

---

### 方向 C：Rust 文件收尾（2 个任务）

---

### P6-06：拆分 `data_export.rs`（387行 → ≤200行）

**当前**：`src-tauri/src/commands/data_export.rs` 387 行

**拆分方案**：
```
src-tauri/src/commands/
├── data_export.rs (15 行) — mod + re-export
├── data_export_json.rs (120 行) — export_json
├── data_export_csv.rs (120 行) — export_csv
└── data_export_markdown.rs (80 行) — export_markdown
```

**操作步骤**：
1. 按 3 个导出格式拆分到 3 个子模块
2. `data_export.rs` 改为 mod 声明 + re-export
3. `commands/mod.rs` 的 import 路径不变
4. 验证 `cargo check` 通过

**验收**：
- [ ] `data_export.rs` ≤ 20 行
- [ ] 每个子模块 ≤ 150 行
- [ ] `cargo check` 通过
- [ ] 导出 JSON/CSV/Markdown 功能不变

---

### P6-07：拆分 `task_crud.rs`（343行 → ≤200行）

**当前**：`src-tauri/src/commands/task_crud.rs` 343 行

**拆分方案**：
```
src-tauri/src/commands/
├── task_crud.rs (15 行) — mod + re-export
├── task_create.rs (80 行) — create_task
├── task_update.rs (120 行) — update_task + duplicate_task
└── task_delete.rs (60 行) — delete_task
```

**操作步骤**：
1. 按操作类型拆分到 3 个子模块
2. `task_crud.rs` 改为 mod 声明 + re-export
3. `commands/mod.rs` 的 import 路径不变
4. 验证 `cargo check` 通过

**验收**：
- [ ] `task_crud.rs` ≤ 20 行
- [ ] 每个子模块 ≤ 150 行
- [ ] `cargo check` 通过
- [ ] 任务 CRUD 功能不变

---

## 五、执行顺序 & 里程碑

```
第 1 批（后端同步，~5h）：
  P6-01 Rust Git 同步模块            (2h)
  P6-02 Tauri Command 封装           (2h)
  P6-03 自动同步定时器               (1h)
  → 验收点 A：后端同步能力可用

第 2 批（前端 UI，~2h）：
  P6-04 前端 API 封装                (0.5h)
  P6-05 SyncPanel 设置面板           (1.5h)
  → 验收点 B：用户可在设置页配置同步

第 3 批（Rust 收尾，~2h）：
  P6-06 拆分 data_export.rs          (1h)
  P6-07 拆分 task_crud.rs            (1h)
  → 验收点 C：0 个 .rs 文件超 300 行
```

---

## 六、给 workbuddy / Trae 的指令建议

### 第 1 批指令（P6-01 + P6-02 + P6-03）

```
# P6-01：Rust Git 同步模块
"在 src-tauri/Cargo.toml 添加 git2 = '0.19' 依赖。
创建 src-tauri/src/sync.rs，实现以下函数：
- init_sync_repo(config) — clone 或打开本地仓库
- pull_changes(repo, branch) — 拉取远程，二进制冲突时保留远程+本地备份
- push_changes(repo, branch) — add dida.db + commit + push
- get_sync_status(repo, branch) — 返回 ahead/behind/last_sync
在 lib.rs 中 mod sync;
cargo check 通过。"

# P6-02：Tauri Command 封装
"创建 src-tauri/src/commands/sync_commands.rs。
5 个 Tauri command：
- get_sync_config — 读 sync_config.json
- save_sync_config — 写 sync_config.json
- init_sync_repo — clone 仓库 + 复制 dida.db
- sync_now — 复制 db → pull → push → 返回状态
- get_sync_status_cmd — 返回同步状态
在 lib.rs 注册 5 个命令。
cargo check 通过。"

# P6-03：自动同步定时器
"修改 src-tauri/src/lib.rs 的 setup 闭包。
启动一个 tokio spawn 的异步任务：
- 启动延迟 10 秒
- 循环：检查是否配置了同步 → sync_now → 等待间隔
- 间隔从配置读取，默认 300 秒
Cargo.toml 如需要添加 tokio time feature。
cargo check 通过。"
```

### 第 2 批指令（P6-04 + P6-05）

```
# P6-04：前端 API 封装
"创建 src/types/sync.ts，定义 SyncConfig 和 SyncStatus 类型。
修改 src/api.ts，新增 syncApi 对象：
- getConfig / saveConfig / initRepo / syncNow / getStatus
tsc --noEmit 通过。"

# P6-05：SyncPanel 设置面板
"创建 src/components/settings/SyncPanel.tsx。
使用 syncApi 实现：
- 未配置状态：输入框（仓库URL/分支/自动同步/间隔）+ 初始化按钮
- 已配置状态：同步状态显示 + 立即同步按钮 + 修改配置 + 关闭同步
- 冲突状态：警告 + 备份文件路径
使用 useTheme() 的 CSS 变量，风格与其他面板一致。
在 SettingsView.tsx 注册新面板。
tsc --noEmit 通过。"
```

### 第 3 批指令（P6-06 + P6-07）

```
# P6-06：拆分 data_export.rs
"重构 src-tauri/src/commands/data_export.rs。当前 387 行。
按 3 个导出格式拆分：
- data_export_json.rs — export_json
- data_export_csv.rs — export_csv
- data_export_markdown.rs — export_markdown
data_export.rs 改为 mod 声明 + re-export（≤20行）。
cargo check 通过。纯重构。"

# P6-07：拆分 task_crud.rs
"重构 src-tauri/src/commands/task_crud.rs。当前 343 行。
按操作类型拆分：
- task_create.rs — create_task
- task_update.rs — update_task + duplicate_task
- task_delete.rs — delete_task
task_crud.rs 改为 mod 声明 + re-export（≤20行）。
cargo check 通过。纯重构。"
```

---

## 七、验收清单（最终）

### 编译
- [ ] `tsc --noEmit` 通过
- [ ] `cargo check` 通过
- [ ] `npm run test` 全部通过（≥188 用例）
- [ ] GitHub Actions CI 绿

### Git 同步（⭐ 核心验收）
- [ ] 设置页有"数据同步"面板
- [ ] 可配置 Git 仓库 URL + 分支 + 自动同步
- [ ] 点击"初始化同步仓库"可 clone 远程仓库
- [ ] 点击"立即同步"可 push + pull
- [ ] 同步状态正确显示（领先/落后/最后同步时间）
- [ ] 自动同步定时器工作（默认 5 分钟）
- [ ] 冲突时保留远程版本 + 本地备份

### 文件行数
- [ ] 没有任何 `.rs` 文件超过 300 行
- [ ] 没有任何 `.tsx` / `.ts` 文件超过 500 行

### 功能回归
- [ ] 任务 CRUD + 子任务 + 拖拽 + 批量
- [ ] 日历视图（月/周/日/甘特/看板）
- [ ] AI 助手 + 流式打字机 + 取消
- [ ] 习惯打卡 + 番茄钟
- [ ] 数据导出 JSON/CSV/Markdown + 导入
- [ ] 全文搜索（标题+备注+子任务）
- [ ] 6 套主题 + 自定义强调色

### 版本管理
- [ ] 版本号 bump 到 v1.26.0
- [ ] README 更新日志
- [ ] git commit + push

---

## 八、风险控制

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| git2 crate 编译失败 | 中 | 高 | Windows 需 VS Build Tools + cmake，文档注明 |
| Git 凭证在非交互环境失败 | 中 | 高 | 使用 Windows Credential Manager，git2 默认支持 |
| dida.db 二进制冲突 | 中 | 中 | 保留远程版本 + 本地备份，提示用户手动合并 |
| 自动同步定时器泄漏 | 低 | 低 | 应用退出时自动取消 |
| 同步时数据库被占用 | 中 | 中 | 同步前复制 dida.db 到临时目录，Git 操作临时文件 |

**回滚策略**：
- A 方向：同步功能独立模块，出问题可禁用而不影响主功能
- B 方向：UI 面板独立，可隐藏
- C 方向：纯重构，每任务一个 commit

---

## 九、前置准备（用户需要先做的）

在执行 P6-01 之前，你需要：

1. **在 GitHub 创建一个私有空仓库**（建议名：`dida-clone-data`）
   - 不要初始化 README
   - 不要加 .gitignore
   - 设为 Private

2. **确认 Windows Credential Manager 有 GitHub 凭证**
   - 打开"凭据管理器"→ Windows 凭据
   - 应该能看到 `git:https://github.com` 条目
   - 如果没有，先在命令行跑一次 `git push` 让它缓存

3. **确认 VS Build Tools 已安装**
   - git2 crate 需要编译 C 代码
   - 检查：`cl` 命令能在 PowerShell 中运行

---

## 十、Phase 6 之后的展望（Phase 7 候选）

1. **任务模板系统** — 常用任务快速创建
2. **E2E 测试** — Playwright
3. **性能优化** — 虚拟列表、懒加载、SQL 优化
4. **插件系统** — 第三方扩展
5. **主题市场** — 分享/导入主题
6. **LLM 流式 + 操作流式执行** — AI 边生成边执行
7. **PWA 支持** — 浏览器版本

---

## 十一、不建议在 Phase 6 做的事

1. ❌ **不做实时协作同步** — 复杂度过高，Git 同步够用
2. ❌ **不做 SQLite 增量同步** — 二进制文件无法增量
3. ❌ **不做自动冲突合并** — SQLite 二进制无法 merge，保留备份即可
4. ❌ **不做 WebDAV/网盘同步** — 用户指定 Git，不分散精力
5. ❌ **不做 i18n** — 用户明确表示不需要

Phase 6 的核心目标：**Git 数据同步 + 拆完最后 2 个超 300 行的 Rust 文件**。
