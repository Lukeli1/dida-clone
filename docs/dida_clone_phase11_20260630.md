# 滴答清单复刻 — Phase 11 优化改进文档

**项目路径**：`C:\Users\50441\Documents\trae开发\滴答清单复刻`
**当前版本**：v1.31.0
**目标版本**：v1.32.0
**文档生成**：2026-06-30 17:40（17:50 更新 P11-08）
**阶段主题**：**系统通知与提醒 + 数据同步增强 + 视图能力扩展 + 性能调优**

---

## 一、Phase 11 定位

### 与前阶段的关系

| 阶段         | 主题                                                     | 状态    |
| ------------ | -------------------------------------------------------- | ------- |
| Phase 7      | Bug 修复 + 收尾                                          | ✅      |
| Phase 8      | 架构拆分 + 功能增强                                      | ✅      |
| Phase 9      | 新功能（模板/附件/通知/统计）+ 性能                      | ✅      |
| Phase 10     | 功能深化（重复任务/AI记忆/虚拟滚动）+ UI 打磨 + 架构清理 | ✅      |
| **Phase 11** | **系统通知 + 同步增强 + 视图扩展 + 性能调优**            | 📋 本次 |

### 设计思路

Phase 10 验收通过后，项目已具备完整的核心功能、UI 体系、架构基础。Phase 11 聚焦**补齐使用闭环中的短板**：

1. **系统通知与提醒**：当前只在应用内 Toast 提醒，任务到时间后无系统级通知。`Task.reminder` 字段存在但前后端均未使用。这是任务管理软件的核心功能之一，必须补齐。
2. **数据同步增强**：当前仅支持 Git 同步，对非技术用户门槛过高。增加 WebDAV 同步（坚果云/Nextcloud 等），降低使用门槛。
3. **视图能力扩展**：看板视图（KanbanView）和甘特图（GanttView）已存在但功能单薄，未被 App.tsx 路由暴露。补齐入口 + 完善交互。
4. **性能与体验调优**：当前任务列表已虚拟滚动，但侧边栏、日历视图无优化；任务导入导出缺少进度反馈；错误处理零散。

---

## 二、任务清单

### 方向 A：系统通知与提醒（3 个任务，~9h）

#### P11-01：系统级通知（Tauri Notification）⭐ 重点功能（P0 | GLM 5.2 / V4 Pro，4h）

**需求**：任务设置 `reminder` 时间后，到时间触发系统级通知（Windows / macOS 原生通知中心），点击通知可跳转到对应任务。

**当前状态**：

- `Task.reminder` 字段存在于数据库和 Rust `Task` 结构体
- 前端 `Task` 类型有 `reminder?: string`
- `TaskContextMenu.tsx` / `TaskMetaPanel.tsx` 有 reminder 显示但无设置入口
- `Cargo.toml` **未引入** `tauri-plugin-notification`
- `lib.rs` 启动时只注册了 autostart/dialog/fs 三个插件
- 无后台定时器扫描到期 reminder

**实现方案**：

##### 1. 后端：引入 tauri-plugin-notification

```toml
# Cargo.toml 新增
tauri-plugin-notification = "2"
```

```rust
// lib.rs setup 中注册插件
.plugin(tauri_plugin_notification::init())

// 新文件：src-tauri/src/reminder.rs（~120 行）
use tauri::{AppHandle, Emitter};
use chrono::{DateTime, Local};

/// 后台扫描线程：每 30 秒检查一次到期 reminder
pub fn start_reminder_scanner(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            if let Err(e) = scan_and_fire(&app_handle).await {
                eprintln!("reminder scan error: {}", e);
            }
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        }
    });
}

async fn scan_and_fire(app: &AppHandle) -> Result<(), String> {
    let db = app.state::<DbState>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = Local::now();
    // 查询 reminder <= now 且未完成且未通知的任务
    let mut stmt = conn.prepare(
        "SELECT id, title, reminder FROM tasks
         WHERE reminder IS NOT NULL
         AND completed = 0 AND archived = 0
         AND reminder <= ?1
         AND (last_notified IS NULL OR last_notified < reminder)"
    ).map_err(|e| e.to_string())?;
    // ... 发送通知 + 更新 last_notified
}
```

**数据库迁移**：`tasks` 表新增 `last_notified TEXT` 字段。

##### 2. Rust 通知命令

```rust
#[tauri::command]
pub fn show_notification(app: AppHandle, title: String, body: String, task_id: i64) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

##### 3. 前端：reminder 设置 UI

新文件 `src/components/task-item/menu/ReminderMenu.tsx`（~150 行）：

- 快捷选项：5 分钟前 / 15 分钟前 / 30 分钟前 / 1 小时前 / 1 天前 / 自定义
- 自定义：日期 + 时间选择器
- 清除提醒

修改：

- `TaskContextMenu.tsx` 新增"提醒"子菜单
- `TaskMetaPanel.tsx` 新增"提醒"行
- `TaskItem.tsx` 有 reminder 的任务显示 🔔 图标
- 点击系统通知跳转到任务：通过 deep link 或 `emit` 事件

##### 4. 验收

- 设置任务提醒为 1 分钟后，30 秒内触发系统通知
- 通知显示任务标题
- 点击通知打开应用并选中对应任务
- 已通知过的任务不重复通知
- 完成任务后不再通知
- Windows / macOS 均可收到通知

---

#### P11-02：提醒规则增强（P1 | GLM 5.2，3h）

**需求**：支持基于截止日期（due_date）的自动提醒，无需手动设置 reminder。

**当前状态**：

- `reminder` 和 `due_date` 是两个独立字段，无联动
- 用户需为每个任务手动设置 reminder

**实现方案**：

##### 1. 全局默认提醒规则

`uiStore` 新增 `defaultReminderOffset: number`（分钟），可选值：

- 0 = 不自动提醒
- 5 / 15 / 30 / 60 / 1440 = 截止前 N 分钟自动提醒

设置面板 `NotificationPanel.tsx` 新增"默认提醒时间"下拉。

##### 2. 创建/更新任务时自动填充 reminder

```typescript
// taskStore.ts createTask / updateTask
function applyDefaultReminder(task: Partial<Task>): Partial<Task> {
  if (task.due_date && !task.reminder) {
    const offset = useUIStore.getState().defaultReminderOffset
    if (offset > 0) {
      const due = new Date(task.due_date)
      due.setMinutes(due.getMinutes() - offset)
      task.reminder = due.toISOString()
    }
  }
  return task
}
```

##### 3. 验收

- 设置默认提醒为"截止前 15 分钟"
- 创建带 due_date 的任务，reminder 自动填充
- 修改 due_date 时，若 reminder 为自动生成则同步更新
- 手动设置 reminder 后不被覆盖
- 关闭默认提醒后新任务不自动填充

---

#### P11-03：通知权限管理（P2 | GLM 5.2，2h）

**需求**：首次启动时请求系统通知权限，设置面板可查看/管理权限状态。

**当前状态**：

- 无权限请求逻辑
- 用户可能拒绝通知权限后，应用无反馈

**实现方案**：

##### 1. 首次启动请求权限

```typescript
// useAppInit.ts
useEffect(() => {
  async function requestPermission() {
    if (isTauri()) {
      const granted = await invoke<boolean>('request_notification_permission')
      if (!granted) {
        toast.info('未开启通知权限，任务提醒将无法送达')
      }
    }
  }
  requestPermission()
}, [])
```

##### 2. 设置面板显示权限状态

`NotificationPanel.tsx` 新增：

- 当前权限状态（已开启 / 未开启 / 未决定）
- 重新请求权限按钮
- 测试通知按钮（发送一条测试通知）

##### 3. 验收

- 首次启动弹出系统通知权限请求
- 拒绝后设置面板显示"未开启"
- 点击"重新请求"跳转系统设置
- 测试通知按钮发送一条测试通知

---

### 方向 B：数据同步增强（2 个任务，~7h）

#### P11-04：WebDAV 同步支持 ⭐ 重点功能（P0 | GLM 5.2 / V4 Pro，4h）

**需求**：当前仅支持 Git 同步，需技术背景。增加 WebDAV 同步支持（坚果云、Nextcloud、群晖等），降低使用门槛。

**当前状态**：

- `sync.rs` 仅支持 Git（git2 crate）
- `SyncPanel.tsx` 仅 Git 配置入口
- 数据同步以整个 `dida.db` 文件为单位

**实现方案**：

##### 1. 后端：WebDAV 客户端

新增依赖：`reqwest`（已有）+ `quick-xml`（解析 PROPFIND 响应）

```toml
# Cargo.toml 新增
quick-xml = "0.36"
```

**新文件**：`src-tauri/src/webdav_sync.rs`（~300 行）

```rust
pub struct WebDavConfig {
    pub url: String,        // https://dav.jianguoyun.com/dav/
    pub username: String,
    pub password: String,   // 坚果云应用密码
    pub remote_path: String,// /dida-clone/dida.db
}

pub struct WebDavClient {
    config: WebDavConfig,
    client: reqwest::Client,
}

impl WebDavClient {
    pub fn new(config: WebDavConfig) -> Self { ... }

    /// 上传 dida.db 到 WebDAV
    pub async fn upload(&self, local_db_path: &Path) -> Result<(), String> {
        let file_data = tokio::fs::read(local_db_path).await
            .map_err(|e| e.to_string())?;
        let url = format!("{}{}", self.config.url, self.config.remote_path);
        // 确保目录存在（MKCOL）
        self.ensure_remote_dir().await?;
        // PUT 上传
        self.client.put(&url)
            .basic_auth(&self.config.username, Some(&self.config.password))
            .body(file_data)
            .send().await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// 下载远程 dida.db
    pub async fn download(&self, local_db_path: &Path) -> Result<(), String> { ... }

    /// 获取远程文件最后修改时间（HEAD 请求）
    pub async fn get_remote_mtime(&self) -> Result<Option<DateTime<Utc>>, String> { ... }
}
```

##### 2. 同步策略

- **上传**：本地 mtime > 远程 mtime → 上传本地
- **下载**：远程 mtime > 本地 mtime → 下载远程
- **冲突**：两者都修改 → 保留本地，备份远程为 `dida.db.remote-backup`
- 比 Git 同步简单（无增量 diff），但足够个人使用

##### 3. 前端：SyncPanel 增加 WebDAV 选项

`SyncPanel.tsx` 改造为两种同步方式选择：

- Git 同步（现有）
- WebDAV 同步（新增）

WebDAV 配置表单：URL / 用户名 / 密码 / 远程路径 + 测试连接按钮

##### 4. 验收

- 坚果云 WebDAV 配置后可上传/下载数据库
- 两台设备可双向同步
- 冲突时保留本地 + 备份远程
- 同步状态正确显示（上次同步时间 / 方向）
- 测试连接按钮可验证配置

---

#### P11-05：同步冲突解决 UI（P1 | GLM 5.2，3h）

**需求**：当前同步冲突仅显示错误信息，用户无法选择保留本地/远程/合并。

**当前状态**：

- Git 同步冲突时 `conflict_message` 显示错误
- WebDAV 同步冲突时保留本地 + 备份远程
- 无冲突解决 UI

**实现方案**：

##### 1. 冲突解决对话框

```tsx
// src/components/settings/SyncConflictDialog.tsx
interface ConflictResolution {
  keepLocal: boolean
  keepRemote: boolean
  backupBoth: boolean
}

function SyncConflictDialog({ conflict, onResolve }: { ... }) {
  return (
    <ConfirmDialog title="同步冲突" ...>
      <p>检测到数据同步冲突：</p>
      <p>{conflict.message}</p>
      <div className="space-y-2">
        <button onClick={() => onResolve('local')}>保留本地（覆盖远程）</button>
        <button onClick={() => onResolve('remote')}>保留远程（覆盖本地）</button>
        <button onClick={() => onResolve('backup')}>两者都保留（本地改名）</button>
      </div>
    </ConfirmDialog>
  )
}
```

##### 2. 后端支持

```rust
#[tauri::command]
pub async fn resolve_sync_conflict(
  strategy: String, // "local" | "remote" | "backup"
  app_data_dir: String,
) -> Result<(), String> { ... }
```

##### 3. 验收

- 同步冲突时弹出对话框（而非静默保留本地）
- 三种解决策略均可正确执行
- 解决后同步状态更新为"已解决"

---

### 方向 C：视图能力扩展（3 个任务，~8h）

#### P11-06：看板视图入口 + 完善（P1 | GLM 5.2，3h）

**需求**：`KanbanView.tsx` 已存在（232 行）但未在 App.tsx 路由中暴露，用户无法访问。且当前列分组逻辑简陋（有 due_date = 进行中）。

**当前状态**：

- `KanbanView.tsx` 232 行，3 列（待处理/进行中/已完成）
- 分组逻辑：有 due_date → 进行中，无 due_date → 待处理
- `App.tsx` currentView switch 无 'kanban' 分支
- `ViewSwitcher.tsx` 无看板入口

**实现方案**：

##### 1. 暴露入口

- `ViewType` 新增 `'kanban'`
- `ViewSwitcher.tsx` 新增看板按钮
- `App.tsx` switch 新增 kanban 分支
- `useKeyboardShortcuts.ts` 新增 Ctrl+4 切换到看板

##### 2. 改进分组逻辑

当前"有 due_date = 进行中"不合理。改为：

- **待处理**：未完成 + 无 in_progress 标签
- **进行中**：未完成 + 有 `in_progress` 标签（或自定义状态字段）
- **已完成**：completed = true

更简单的方案：用 `Task.status` 新字段（todo / in-progress / done），默认 todo，看板拖拽改变 status。但这需要数据库迁移。

**折中方案**（不改数据库）：用标签系统，约定 `@进行中` 标签代表进行中。拖拽到"进行中"列自动添加标签，拖出则移除。

##### 3. 看板拖拽改进

- 列间拖拽改变状态
- 列内拖拽排序（更新 sort_order）
- 卡片显示：标题 + 优先级色条 + 截止日期 + 标签
- 右键菜单复用 TaskContextMenu

##### 4. 验收

- 侧边栏可切换到看板视图
- 任务可在三列间拖拽
- 拖拽到"进行中"自动添加 `@进行中` 标签
- 卡片信息完整显示
- 右键菜单可用

---

#### P11-07：甘特图入口 + 完善（P1 | GLM 5.2，3h）

**需求**：`GanttView.tsx` 已存在（268 行）但未在 App.tsx 路由中暴露。

**当前状态**：

- `GanttView.tsx` 268 行，支持拖拽改变 due_date
- 仅显示有 due_date 的任务
- 无任务名称显示（仅色条）
- 无今天指示线
- `App.tsx` / `ViewSwitcher.tsx` 无入口

**实现方案**：

##### 1. 暴露入口

- `ViewType` 新增 `'gantt'`
- `ViewSwitcher.tsx` 新增甘特图按钮
- `App.tsx` switch 新增 gantt 分支
- `useKeyboardShortcuts.ts` 新增 Ctrl+5 切换到甘特图

##### 2. 功能完善

- 任务名称显示在色条上（截断 + tooltip）
- 今天指示线（红色竖线）
- 周末背景色区分
- 拖拽时显示目标日期 tooltip
- 鼠标滚轮横向滚动
- 缩放支持（日/周/月切换）

##### 3. 验收

- 侧边栏可切换到甘特图
- 有截止日期的任务以色条显示
- 今天有红色指示线
- 拖拽色条可改变截止日期
- 滚轮可横向滚动

---

#### P11-08：周视图时间块 Resize 功能验证 + 修复（P1 | GLM 5.2，2h）⭐ 用户明确需求

**需求**：用户要求在周视图中，任务时间块的上下边缘悬停时显示双向箭头光标，拖拽可调整任务的开始时间（拖上边缘）或结束时间（拖下边缘），从而调整任务所占的时长。

**当前状态**：✅ **核心功能已完整实现**

经代码扫描发现，该功能已在之前的阶段实现：

| 已实现项             | 文件位置                                            | 说明                                                               |
| -------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| Resize 逻辑 hook     | `src/components/calendar/useTaskResize.ts`（88 行） | 完整的 handleResizeStart / handleResizeMove / handleResizeEnd 逻辑 |
| 上边缘 resize handle | `WeekView.tsx` line 218                             | `cursor-ns-resize` + `onMouseDown`                                 |
| 下边缘 resize handle | `WeekView.tsx` line 228                             | `cursor-ns-resize` + `onMouseDown`                                 |
| 实时时间 tooltip     | `WeekView.tsx` line 221-224                         | 拖拽时显示 `开始 - 结束` 时间文本                                  |
| 15 分钟对齐          | `useTaskResize.ts` line 57, 63                      | `Math.round(newTop / 15) * 15`                                     |
| 上边缘拖拽改开始时间 | `useTaskResize.ts` line 88-94                       | 更新 `due_date`                                                    |
| 下边缘拖拽改结束时间 | `useTaskResize.ts` line 96-102                      | 更新 `end_date`                                                    |
| 拖拽时禁用普通拖拽   | `WeekView.tsx` line 208                             | `draggable={resize.resizingTaskId === null}`                       |
| 最小高度限制         | `useTaskResize.ts` line 56, 61                      | `Math.max(30, ...)` = 30 分钟最小                                  |

**前提条件**：任务必须同时有 `due_date`（开始）和 `end_date`（结束）才显示 resize handle（`WeekView.tsx` line 217: `{task.end_date && (...)}`）。仅有 `due_date` 无 `end_date` 的任务高度为固定最小值，无法 resize。

**本任务工作**：

##### 1. 验证功能可用性（必做）

创建带 due_date + end_date 的任务，在周视图中验证：

- [ ] 悬停任务块上边缘，光标变为 `ns-resize`（上下双向箭头）
- [ ] 悬停任务块下边缘，光标变为 `ns-resize`
- [ ] 按住上边缘向上拖拽，开始时间提前，任务块变长
- [ ] 按住上边缘向下拖拽，开始时间延后，任务块变短
- [ ] 按住下边缘向下拖拽，结束时间延后，任务块变长
- [ ] 按住下边缘向上拖拽，结束时间提前，任务块变短
- [ ] 拖拽时实时显示时间 tooltip（`HH:mm - HH:mm` 格式）
- [ ] 时间按 15 分钟对齐
- [ ] 拖拽时不触发任务整体移动
- [ ] 松开鼠标后 due_date / end_date 正确持久化
- [ ] 最小时长 30 分钟限制生效

##### 2. 修复潜在问题（按需）

若验证中发现以下问题，需修复：

- **问题 A**：resize handle 高度仅 `h-1.5`（6px），精准悬停困难
  - 修复方案：增大到 `h-2`（8px），或用 `::before` 伪元素扩大命中区域到 `h-3`
- **问题 B**：`hover:bg-black/10` 在暗色模式下不可见
  - 修复方案：改为 `hover:bg-[var(--color-accent)]/30`
- **问题 C**：拖拽到 0 点 / 24 点边界时可能溢出
  - 修复方案：在 `handleResizeMove` 中增加 `newTop >= 0` 和 `newTop + newHeight <= 24*60` 边界 clamp
- **问题 D**：无 `end_date` 的任务无法 resize，但用户可能期望通过拖下边缘来"拉长"任务
  - 修复方案：若无 end_date，拖拽下边缘时自动创建 `end_date = due_date + 30min`，再进入正常 resize 流程；同时渲染下边缘 handle（当前 `{task.end_date && (...)}` 条件改为 `{task.due_date && (...)}`）
- **问题 E**：跨天任务（due_date 和 end_date 不在同一天）的 resize 行为可能异常
  - 修复方案：验证跨天场景，若有问题则限制 resize 仅在同一天内调整

##### 3. 日视图同步支持（若适用）

检查 `DayViewGrid.tsx` / `DayView.tsx` 是否也使用 TaskBar week 变体并支持 resize。若不支持，同步添加 `useTaskResize` hook 接入。

**验收**：

- 周视图中带 due_date + end_date 的任务可拖拽上下边缘调整时间
- 光标在上下边缘变为双向箭头
- 拖拽时实时显示时间预览 tooltip
- 调整后 due_date / end_date 正确更新并持久化
- 无 end_date 的任务也可通过拖下边缘拉长（若实现问题 D 修复）
- 日视图同步支持（若适用）
- 暗色模式下 resize handle 悬停反馈清晰（若实现问题 B 修复）

---

### 方向 D：性能与体验调优（3 个任务，~6h）

#### P11-09：错误边界 + 错误上报（P1 | GLM 5.2，2h）

**需求**：当前 `ErrorBoundary.tsx` 仅捕获渲染错误，显示"出错了"文字。无错误恢复、无错误上报。

**当前状态**：

- `ErrorBoundary.tsx` 63 行，捕获错误后显示"出错了" + 重试按钮
- 无错误日志持久化
- 无全局未捕获 Promise rejection 处理

**实现方案**：

##### 1. 错误日志持久化

```typescript
// src/utils/errorLogger.ts
interface ErrorLog {
  timestamp: string
  message: string
  stack?: string
  componentStack?: string
  url: string
  userAgent: string
}

const LOG_KEY = 'error_logs'
const MAX_LOGS = 50

export function logError(error: Error, componentStack?: string) {
  const logs = loadLogs()
  logs.unshift({
    timestamp: new Date().toISOString(),
    message: error.message,
    stack: error.stack,
    componentStack,
    url: window.location.href,
    userAgent: navigator.userAgent,
  })
  localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(0, MAX_LOGS)))
}
```

##### 2. 全局未捕获 Promise rejection

```typescript
// useAppInit.ts
window.addEventListener('unhandledrejection', (event) => {
  logError(new Error(event.reason?.message || String(event.reason)))
  toast.error('发生未捕获错误，已记录')
})
```

##### 3. 错误日志查看

`SystemPanel.tsx` 新增"错误日志"区域：

- 显示最近 10 条错误
- 清除日志按钮
- 导出日志按钮

##### 4. ErrorBoundary 增强

- 显示错误摘要 + 技术详情（可展开）
- "复制错误信息"按钮
- "刷新应用"按钮

##### 5. 验收

- 渲染错误被捕获并记录
- 未捕获 Promise rejection 被记录
- 设置面板可查看错误日志
- 可导出/清除日志
- ErrorBoundary 显示有用的错误信息

---

#### P11-10：导入导出进度反馈（P2 | GLM 5.2，2h）

**需求**：当前导入导出 JSON/CSV/Markdown 无进度反馈，大文件时用户以为应用卡死。

**当前状态**：

- `data_export.rs` / `data_import.rs` 同步执行
- 前端调用后等待 Promise，无进度
- `TopProgressBar` 存在但未用于导入导出

**实现方案**：

##### 1. 后端 emit 进度事件

```rust
// data_export.rs
#[tauri::command]
pub async fn export_json(app: AppHandle, ...) -> Result<(), String> {
    let total = tasks.len();
    for (i, task) in tasks.iter().enumerate() {
        // ... 写入逻辑
        if i % 100 == 0 {
            app.emit("export-progress", ExportProgress {
                current: i,
                total,
                phase: "exporting",
            }).ok();
        }
    }
    Ok(())
}
```

##### 2. 前端监听进度

```typescript
// DataPanel.tsx
const unlisten = await listen('export-progress', (event) => {
  const { current, total } = event.payload
  setProgress(Math.round((current / total) * 100))
})

try {
  await invoke('export_json', { ... })
  toast.success('导出成功')
} finally {
  unlisten()
  setProgress(null)
}
```

##### 3. 验收

- 导出 1000+ 任务时显示进度百分比
- 导入时显示进度
- 用户可取消操作（取消按钮）
- 大文件操作期间 TopProgressBar 显示

---

#### P11-11：应用启动性能优化（P2 | GLM 5.2，2h）

**需求**：应用启动时需加载任务/列表/标签/习惯/模板等数据，当前串行加载。

**当前状态**：

- `useAppInit.ts` 依次调用 loadTasks / loadLists / loadTags / loadHabits / loadTemplates
- 每个 invoke 都是 IPC 调用，串行执行
- 启动到可交互约 1.5-2 秒（500 条任务）

**实现方案**：

##### 1. 并行加载

```typescript
// useAppInit.ts
useEffect(() => {
  async function init() {
    setLoading(true)
    try {
      await Promise.all([
        useTaskStore.getState().loadTasks(),
        useListStore.getState().loadLists(),
        useTagStore.getState().loadTags(),
      ])
      // 非关键数据延后加载
      await Promise.all([useHabitStore.getState().loadHabits?.(), useTemplateStore.getState().loadTemplates?.()])
    } finally {
      setLoading(false)
    }
  }
  init()
}, [])
```

##### 2. 骨架屏分阶段

- 第一阶段（tasks/lists/tags 加载完）：显示主界面
- 第二阶段（habits/templates 加载完）：相关功能可用
- 非关键数据加载期间，对应功能按钮显示 loading

##### 3. 数据库预加载

Rust 启动时 `init_db` 后立即预热常用查询（`SELECT * FROM tasks LIMIT 100`），避免首次查询冷启动。

##### 4. 验收

- 启动到可交互时间减少 30%+（目标 < 1s for 500 tasks）
- 非关键功能延后加载不影响首屏
- 骨架屏平滑过渡到主界面

---

## 三、任务总览

| ID     | 任务                             | 优先级 | 预估 | 方向 |
| ------ | -------------------------------- | ------ | ---- | ---- |
| P11-01 | 系统级通知（Tauri Notification） | P0     | 4h   | 通知 |
| P11-02 | 提醒规则增强（默认提醒 offset）  | P1     | 3h   | 通知 |
| P11-03 | 通知权限管理                     | P2     | 2h   | 通知 |
| P11-04 | WebDAV 同步支持                  | P0     | 4h   | 同步 |
| P11-05 | 同步冲突解决 UI                  | P1     | 3h   | 同步 |
| P11-06 | 看板视图入口 + 完善              | P1     | 3h   | 视图 |
| P11-07 | 甘特图入口 + 完善                | P1     | 3h   | 视图 |
| P11-08 | 周视图时间块 Resize 验证+修复    | P1     | 2h   | 视图 |
| P11-09 | 错误边界 + 错误上报              | P1     | 2h   | 体验 |
| P11-10 | 导入导出进度反馈                 | P2     | 2h   | 体验 |
| P11-11 | 应用启动性能优化                 | P2     | 2h   | 体验 |

**总计**：11 个任务，~30h（建议 2-3 天完成）

---

## 四、执行顺序建议

### 第一批（核心功能 + 入口补齐）

1. **P11-01 系统级通知**（核心新功能，补齐 reminder 闭环）
2. **P11-04 WebDAV 同步**（降低同步门槛）
3. **P11-06 看板视图入口**（暴露已有功能）
4. **P11-07 甘特图入口**（暴露已有功能）

### 第二批（完善 + 优化）

5. P11-02 提醒规则增强
6. P11-05 同步冲突解决 UI
7. P11-08 周视图 Resize 验证+修复
8. P11-09 错误边界 + 上报

### 第三批（收尾）

9. P11-03 通知权限管理
10. P11-10 导入导出进度
11. P11-11 启动性能优化

---

## 五、验收标准

| 检查项                | 要求                                                   |
| --------------------- | ------------------------------------------------------ |
| `npx tsc --noEmit`    | ✅ 无错误                                              |
| `cargo check`         | ✅ 无错误                                              |
| `npx vitest run`      | ✅ 全部通过，新增 reminder / webdav / errorLogger 测试 |
| `npx playwright test` | ✅ 至少 5 个 E2E 用例通过                              |
| 系统通知              | Windows / macOS 实际收到通知                           |
| WebDAV                | 坚果云实际同步成功                                     |
| 看板/甘特图           | 侧边栏可切换，功能完整                                 |
| 周视图 Resize         | 拖拽上下边缘可调整任务时间                             |
| 启动性能              | 500 tasks 启动 < 1s                                    |
| 单元测试覆盖          | 新增功能需有对应测试                                   |

---

## 六、给 workbuddy 的指令建议

```
请按照 Phase 11 优化文档执行，项目路径：C:\Users\50441\Documents\trae开发\滴答清单复刻

执行顺序：
1. P11-01 系统级通知（Tauri Notification + 后台扫描 + reminder 设置 UI）
2. P11-04 WebDAV 同步支持（webdav_sync.rs + SyncPanel 选项）
3. P11-06 看板视图入口 + 完善（暴露路由 + 拖拽改进）
4. P11-07 甘特图入口 + 完善（暴露路由 + 今天指示线 + 任务名显示）
5. P11-02 提醒规则增强（默认 offset + 自动填充 reminder）
6. P11-05 同步冲突解决 UI（对话框 + 三种策略）
7. P11-08 周视图时间块 Resize 功能验证 + 修复（验证已有实现 + 修复潜在问题）
8. P11-09 错误边界 + 错误上报（日志持久化 + 设置面板查看）
9. P11-03 通知权限管理（首次请求 + 设置面板状态）
10. P11-10 导入导出进度反馈（emit 进度事件 + 前端监听）
11. P11-11 应用启动性能优化（并行加载 + 骨架屏分阶段）

P11-08 特别说明：
- 该功能已在 useTaskResize.ts + WeekView.tsx 中实现
- 重点是验证功能可用性 + 修复潜在问题（resize handle 命中区域、暗色模式反馈、边界 clamp、无 end_date 任务支持）
- 若验证全部通过且无问题，该任务可快速关闭

要求：
- 每个任务完成后运行 npx tsc --noEmit 和 npx vitest run 确保无回归
- 新增功能需有对应单元测试
- 数据库迁移（last_notified 字段）需在 db.rs init_db 中添加
- 提交信息格式：feat: P11-XX 任务描述
- 完成后打 tag v1.32.0 并推送

文档路径：C:\Users\50441\.qclaw\workspace\dida_clone_phase11_20260630.md
```
