# 同步、导入导出与数据安全可观测性优化可执行操作文档

> 适用阶段：v1.38.x 数据安全与同步可靠性增强  
> 执行方式：按模块分阶段顺序开发。每个阶段完成后先完成本阶段验证，再进入下一阶段。  
> 范围：导入预览、自动快照、同步日志、附件备份边界说明。

## 1. 项目现状总结

同步设置位于 `src/components/settings/SyncPanel.tsx`、`SyncStatusPanel.tsx`、`SyncConflictDialog.tsx`，API 在 `src/api/syncApi.ts`，后端在 `src-tauri/src/sync.rs`、`webdav_sync.rs`、`commands/sync_commands.rs`、`commands/webdav_commands.rs`。导入导出入口位于 `src/components/settings/SystemPanel.tsx`、`src/components/settings/system/DataPanel.tsx`、`CleanupPanel.tsx`，后端为 `src-tauri/src/commands/data_import.rs` 和 `data_export*.rs`。

| 编号 | 问题描述 | 影响范围 | 复现路径 |
|---|---|---|---|
| S-01 | JSON 导入没有 dry-run 预览，替换模式只做前端确认。 | 数据安全、误导入恢复 | 设置 -> 系统 -> 数据导入 -> 选择 replace。 |
| S-02 | 导入结果只显示导入数量，不显示跳过、冲突、替换将删除数量。 | 数据迁移和排错 | 导入包含重复 ID 的 JSON 文件。 |
| S-03 | 同步缺少历史日志面板。 | Git/WebDAV 排错 | 手动同步失败后只能看到当前错误文本。 |
| S-04 | 同步覆盖和 replace 导入前没有自动本地快照。 | 数据恢复 | WebDAV 下载远程覆盖本地后想回滚。 |
| S-05 | 附件表保存文件路径，JSON 导出可能只包含记录，不包含附件文件本体，UI 文案未明确边界。 | 附件备份预期 | 给任务添加附件后导出 JSON，检查是否包含文件内容。 |

## 2. 优化方案

| 编号 | 优先级 | 优化策略 | 优化目标 | 预期效果 |
|---|---|---|---|---|
| S-01 | P0 | 新增 `import_json_preview` 后端命令。 | 导入前展示影响范围。 | 降低误导入风险。 |
| S-02 | P1 | ImportResult/PreviewResult 增加 new/skipped/will_delete 统计。 | 用户明确知道导入细节。 | 重复数据和替换影响可见。 |
| S-03 | P1 | 新增 `sync_logs` 表和设置页日志列表。 | 可追踪同步历史。 | 同步失败可定位时间、方向和错误。 |
| S-04 | P0 | replace 导入和远程覆盖前自动创建 DB 快照。 | 为高风险操作提供回滚点。 | 避免数据不可逆损失。 |
| S-05 | P2 | 明确附件导出边界，JSON 包含附件元信息但不包含文件本体。 | 修正用户备份预期。 | 用户不会误以为附件文件已备份。 |

## 3. 执行步骤

### 阶段 0：开发前置检查

```bash
git status --short --branch
git pull --ff-only
```

如果工作区有未提交改动或快进失败，停止执行。

### 阶段 1：导入预览命令

涉及文件：

- `src-tauri/src/commands/data_import.rs`
- `src-tauri/src/lib.rs`
- `src/api/dataApi.ts`

新增命令：`import_json_preview`

返回结构：

```ts
interface ImportPreviewResult {
  lists_new: number
  lists_skipped: number
  tasks_new: number
  tasks_skipped: number
  tags_new: number
  tags_skipped: number
  habits_new: number
  habits_skipped: number
  replace_will_delete: {
    lists: number
    tasks: number
    tags: number
    habits: number
    habit_records: number
  } | null
}
```

预览命令只读数据库，禁止写入任何表。

### 阶段 2：导入弹窗展示预览

涉及文件：

- `src/components/settings/SystemPanel.tsx`
- `src/components/settings/system/CleanupPanel.tsx`
- `src/api/dataApi.ts`

流程：选择 JSON 文件 -> 调用 `importJsonPreview(content, mode)` -> 展示新增、跳过、替换将删除数量 -> 用户确认 -> 调用 `importJson`。

replace 模式必须展示将删除的 lists/tasks/tags/habits/habit_records 数量。

### 阶段 3：自动 DB 快照

新增文件：`src-tauri/src/commands/snapshot_commands.rs`

修改文件：`src-tauri/src/lib.rs`

新增命令：

- `create_data_snapshot`
- `list_data_snapshots`
- `restore_data_snapshot`
- `delete_data_snapshot`

快照目录：app data dir 下 `snapshots/`。

文件名格式：`snapshot-YYYYMMDD-HHmmss-before-import.db`、`snapshot-YYYYMMDD-HHmmss-before-sync.db`。

触发点：replace 导入前、WebDAV download 前、Git remote overwrite 前、冲突选择 remote 或 backup 前。

### 阶段 4：同步日志

修改文件：`src-tauri/src/db.rs`

新增表：

```sql
CREATE TABLE IF NOT EXISTS sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL
)
```

新增文件：`src-tauri/src/commands/sync_log_commands.rs`

修改文件：

- `src-tauri/src/commands/sync_commands.rs`
- `src-tauri/src/commands/webdav_commands.rs`
- `src/api/syncApi.ts`
- `src/components/settings/SyncStatusPanel.tsx`

UI 要求：显示最近 10 条同步记录，按 `created_at` 倒序，包含时间、同步方式、方向、状态、耗时、错误摘要。

### 阶段 5：附件备份边界说明

涉及文件：

- `src-tauri/src/commands/data_export_json.rs`
- `src/components/settings/system/DataPanel.tsx`

要求：JSON 导出包含附件元信息 `task_id/file_name/file_path/file_size/mime_type`；设置页文案明确“JSON 备份包含附件记录，不包含附件文件本体”。

## 4. 代码修改规则

| 改动 | 文件完整路径 | 修改前 | 修改后 |
|---|---|---|---|
| 导入预览 | `src-tauri/src/commands/data_import.rs` | 只有 `import_json` | 增加只读 `import_json_preview` |
| Data API | `src/api/dataApi.ts` | 只有 `importJson` | 增加 `importJsonPreview` |
| 导入弹窗 | `src/components/settings/system/CleanupPanel.tsx` | 只确认 mode | 展示 preview 统计 |
| 快照命令 | `src-tauri/src/commands/snapshot_commands.rs` | 不存在 | 新增快照 CRUD |
| 命令注册 | `src-tauri/src/lib.rs` | 未注册 snapshot/log 命令 | 注册新增命令 |
| 同步日志表 | `src-tauri/src/db.rs` | 无 `sync_logs` | 新增表和索引 |
| 同步 UI | `src/components/settings/SyncStatusPanel.tsx` | 只显示当前状态 | 增加最近 10 条日志 |
| 附件导出说明 | `src/components/settings/system/DataPanel.tsx` | “完整数据备份”表述过宽 | 明确不包含附件文件本体 |

禁止事项：禁止在没有快照的情况下执行 replace 导入；禁止 restore snapshot 时绕过确认；禁止把附件文件内容 base64 内嵌到 JSON；禁止删除旧同步配置兼容逻辑。

## 5. 验证标准

### 必跑命令

```bash
npm run typecheck
npm test
npm run lint
cd src-tauri && cargo test
cd src-tauri && cargo clippy -- -D warnings
```

### 目标测试文件

- `src/utils/__tests__/exportImport.test.ts`
- `src/components/settings/__tests__/SyncConflictDialog.test.ts`
- Rust：`src-tauri/src/commands/data_import.rs`、`snapshot_commands.rs`、`sync_log_commands.rs`

### 可量化验收项

| 验收项 | 标准 |
|---|---|
| merge 预览 | 重复 ID 计入 skipped，新 ID 计入 new |
| replace 预览 | `replace_will_delete.tasks` 等于当前 DB 任务数 |
| replace 导入 | 导入前 snapshots 目录新增 1 个 db 文件 |
| WebDAV download | 覆盖前 snapshots 目录新增 1 个 db 文件 |
| 同步日志 | 每次手动同步后 `sync_logs` 新增 1 条 |
| 同步日志 UI | 最近 10 条按 `created_at` 倒序展示 |
| 附件说明 | DataPanel 明确显示“不包含附件文件本体” |
