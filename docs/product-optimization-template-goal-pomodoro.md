# 模板、目标、番茄钟与时间追踪闭环优化可执行操作文档

> 适用阶段：v1.38.x 执行闭环增强  
> 执行方式：按模块分阶段顺序开发。每个阶段完成后先完成本阶段验证，再进入下一阶段。  
> 范围：任务模板应用、目标 KR、番茄钟与时间追踪统一、单活跃计时约束。

## 1. 项目现状总结

模板模块位于 `src/components/template` 与 `src-tauri/src/commands/template_commands.rs`。目标模块位于 `src/components/goal`、`src/components/detail/TaskGoalsPanel.tsx` 与 `src-tauri/src/commands/goal_commands.rs`。番茄钟位于 `src/components/pomodoro`，当前统计主要写入 localStorage；时间追踪位于 `src/components/detail/TimeTrackingSection.tsx` 和 `src-tauri/src/commands/time_tracking_commands.rs`。

| 编号 | 问题描述 | 影响范围 | 复现路径 |
|---|---|---|---|
| E-01 | 模板应用时清单写死为 `list_id = 1`。 | 多清单用户、模板复用 | 进入模板页点击“应用”，新任务固定进入收件箱。 |
| E-02 | 模板应用不能选择日期、标签，也不能替换 `{project}` 一类变量。 | 会议、出差、项目模板 | 创建含占位符的模板后应用，标题仍保留原始占位符。 |
| E-03 | 番茄钟完成后只写 localStorage，不写入 `time_entries`。 | 统计面板、任务详情工时 | 选择任务完成一次番茄专注，打开任务详情查看时间追踪记录。 |
| E-04 | 时间追踪允许多个任务同时存在未结束记录。 | 工时准确性 | 在任务 A 开始计时，再打开任务 B 详情开始计时。 |
| E-05 | 目标只是任务集合，没有关键结果 KR。 | OKR 深度、目标复盘 | 新建目标后只能关联任务，不能设置量化指标。 |

## 2. 优化方案

| 编号 | 优先级 | 优化策略 | 优化目标 | 预期效果 |
|---|---|---|---|---|
| E-01 | P0 | 新增模板应用弹窗，清单由用户选择。 | 移除硬编码清单。 | 模板可应用到任意清单。 |
| E-02 | P1 | 模板应用支持日期、标签、变量替换。 | 提升模板复用能力。 | 同一模板可服务多个项目和日期。 |
| E-03 | P1 | 番茄钟 focus 完成后写入 `time_entries`。 | 统一专注和工时口径。 | 统计面板能反映番茄专注时间。 |
| E-04 | P0 | 后端限制全局只有一个 active time entry。 | 防止重复计时。 | 时间追踪总时长不被重复放大。 |
| E-05 | P2 | 新增 `goal_key_results` 表和 KR 编辑 UI。 | 让 OKR 具备量化指标。 | 目标进度可按 KR 计算。 |

## 3. 执行步骤

### 阶段 0：开发前置检查

```bash
git status --short --branch
git pull --ff-only
```

如果工作区有未提交改动或快进失败，停止执行。

### 阶段 1：模板应用弹窗

新增文件：`src/components/template/ApplyTemplateDialog.tsx`

修改文件：

- `src/components/template/TemplateView.tsx`
- `src/api/templateApi.ts`
- `src-tauri/src/commands/template_commands.rs`

操作：

1. 点击模板卡片“应用”时不再直接调用 `applyTemplate(template.id, 1)`。
2. 打开 `ApplyTemplateDialog`。
3. 弹窗字段：清单必选、截止日期可选、标签多选可选、变量输入框。
4. 变量扫描规则：从 `title_template`、`notes_template`、子任务标题中匹配 `{变量名}`。
5. 确认后调用增强后的模板应用 API。

### 阶段 2：增强 apply_template 后端契约

涉及文件：

- `src-tauri/src/commands/template_commands.rs`
- `src/api/templateApi.ts`

新增请求结构：

```ts
interface ApplyTemplateRequest {
  templateId: number
  listId: number
  dueDate?: string | null
  tagIds?: number[]
  variables?: Record<string, string>
}
```

后端要求：

1. 主任务、备注、子任务标题都执行变量替换。
2. `due_date` 写入主任务；子任务不自动继承日期，除非后续另行规划。
3. `tag_ids` 写入主任务 `task_tags`。
4. 保持事务包裹，任一步失败必须回滚。

### 阶段 3：限制时间追踪单活跃记录

涉及文件：

- `src-tauri/src/commands/time_tracking_commands.rs`
- `src/components/detail/TimeTrackingSection.tsx`

操作：

1. `start_time_tracking` 插入前查询 `time_entries WHERE end_time IS NULL LIMIT 1`。
2. 如果存在 active entry，返回错误：`已有任务正在计时，请先停止当前计时`。
3. 前端 toast 展示后端错误，不创建本地 `time_tracking_{task.id}` 状态。

### 阶段 4：新增历史 time entry 写入命令并接入番茄钟

涉及文件：

- `src-tauri/src/commands/time_tracking_commands.rs`
- `src-tauri/src/lib.rs`
- `src/api/timeTrackingApi.ts`
- `src/components/pomodoro/PomodoroView.tsx`

新增命令：`add_time_entry`

参数：`task_id`、`start_time`、`end_time`、`duration_secs`、`note`。

番茄钟接入规则：当 `mode === 'focus'` 且倒计时归零，若 `selectedTaskId` 非空，则写入一条 `duration_secs = settings.focusTime * 60` 的记录，note 固定为 `番茄钟专注`。

### 阶段 5：目标 KR 数据和 UI

涉及文件：

- `src-tauri/src/db.rs`
- `src-tauri/src/commands/goal_commands.rs`
- `src/api/goalApi.ts`
- `src/components/goal/GoalEditor.tsx`
- `src/components/goal/GoalCard.tsx`

新增表：

```sql
CREATE TABLE IF NOT EXISTS goal_key_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  target_value REAL NOT NULL,
  current_value REAL NOT NULL DEFAULT 0,
  unit TEXT,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY(goal_id) REFERENCES goals(id) ON DELETE CASCADE
)
```

UI 要求：GoalEditor 支持增删 KR；GoalCard 展示 KR 进度。如果存在 KR，目标总进度按 KR 平均进度计算；无 KR 时沿用任务完成进度。

## 4. 代码修改规则

| 改动 | 文件完整路径 | 修改前 | 修改后 |
|---|---|---|---|
| 模板应用 UI | `src/components/template/TemplateView.tsx` | 点击应用直接 `applyTemplate(template.id, 1)` | 打开 ApplyTemplateDialog |
| 应用弹窗 | `src/components/template/ApplyTemplateDialog.tsx` | 不存在 | 新增清单/日期/标签/变量表单 |
| 模板 API | `src/api/templateApi.ts` | 只传 `templateId/listId` | 支持 `ApplyTemplateRequest` |
| 模板后端 | `src-tauri/src/commands/template_commands.rs` | 只接收 `template_id/list_id` | 支持 due_date/tag_ids/variables |
| 时间追踪后端 | `src-tauri/src/commands/time_tracking_commands.rs` | 允许多个 active entry | 全局只允许一个 active entry |
| 番茄入库 | `src/components/pomodoro/PomodoroView.tsx` | 只写 localStorage | focus 完成后写 time_entries |
| 目标 schema | `src-tauri/src/db.rs` | 无 KR 表 | 新增 `goal_key_results` |
| 目标 UI | `src/components/goal/GoalEditor.tsx`、`GoalCard.tsx` | 只显示任务进度 | 支持 KR 编辑和 KR 进度 |

禁止事项：禁止删除现有模板字段；禁止完全移除番茄钟 localStorage 统计；禁止改变 `goal_tasks` 现有语义；禁止让子任务自动继承标签，除非测试明确覆盖。

## 5. 验证标准

### 必跑命令

```bash
npm run typecheck
npm test
npm run lint
cd src-tauri && cargo test
```

### 目标测试文件

- 新增 `src/components/template/__tests__/ApplyTemplateDialog.test.tsx`
- 新增或更新 `src/components/pomodoro/__tests__/PomodoroView.test.tsx`
- 新增或更新 `src/components/detail/__tests__/TimeTrackingSection.test.tsx`
- Rust 测试：`src-tauri/src/commands/time_tracking_commands.rs`、`template_commands.rs`、`goal_commands.rs`

### 可量化验收项

| 验收项 | 标准 |
|---|---|
| 模板清单选择 | 新任务 `list_id` 等于弹窗选择值 |
| 模板变量替换 | `{project}` 在标题、备注、子任务标题中均被替换 |
| 模板标签 | 选择 2 个标签后，主任务 `task_tags` 写入 2 条关系 |
| 多任务计时 | 第二个任务开始计时时返回错误，active entry 数保持 1 |
| 番茄完成 | 选中任务完成一次 focus 后，`time_entries` 新增 1 条记录 |
| KR 进度 | 两个 KR 分别 50%、100% 时，目标进度为 75% |
