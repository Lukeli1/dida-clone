# 任务数据语义与详情编辑闭环优化可执行操作文档

> 适用阶段：v1.37.x 后续稳定性优化 / v1.38.0 前置数据语义补强  
> 执行方式：按模块分阶段顺序开发。每个阶段完成后必须先完成本阶段验证，再进入下一阶段。  
> 范围：任务数据结构、任务详情、任务完成状态、看板状态、提醒提前量持久化。

## 1. 项目现状总结

当前任务管理界面采用三栏结构：侧边栏 `src/components/sidebar/Sidebar.tsx`、任务列表 `src/components/task-list/TaskListPanel.tsx`、详情面板 `src/components/detail/TaskDetail.tsx`。前端任务状态集中在 `src/stores/taskStore.ts`，后端任务读写集中在 `src-tauri/src/commands/task_create.rs`、`task_update.rs`、`task_query.rs`、`task_ops.rs`，数据库 schema 在 `src-tauri/src/db.rs`。

| 编号 | 问题描述 | 影响范围 | 复现路径 |
|---|---|---|---|
| T-01 | 已完成任务没有独立 `completed_at` 字段，统计面板使用 `updated_at` 近似完成时间。已完成后再次编辑标题、备注、标签会污染完成趋势。 | 统计面板、自动归档、连续完成天数、周/月报 | 创建任务并完成；次日编辑该任务标题；进入统计面板查看本周完成趋势。 |
| T-02 | 看板“进行中”状态通过名为“进行中”的标签模拟，不是任务原生状态。 | 看板、标签系统、搜索筛选、AI 批量修改 | 进入日历 -> 看板，将任务拖入“进行中”，观察标签列表出现或复用“进行中”标签。 |
| T-03 | 详情页日程保存时固定写入 `all_day: false`，会把全天任务或跨天任务退化为普通时间任务。 | 月/周/日历全天区、跨天展示、任务详情编辑 | 创建全天任务；打开详情页修改日期或提醒；回到日历观察任务是否仍在全天区。 |
| T-04 | 前端类型和更新请求包含 `reminder_minutes`，但数据库 `tasks` 表当前未创建该列，存在持久化链路不完整风险。 | 提醒提前量、默认提醒规则、详情页日程面板 | 打开任务详情设置“提醒提前量”；重启应用后检查该设置是否保留。 |

## 2. 优化方案

| 编号 | 优先级 | 优化策略 | 优化目标 | 预期效果 |
|---|---|---|---|---|
| T-01 | P0 | 新增 `completed_at TEXT`，完成任务时写入当前时间，取消完成时清空。统计改用 `completed_at`。 | 区分“完成时间”和“最后编辑时间”。 | 完成趋势、连续天数、归档判断不再被后续编辑污染。 |
| T-02 | P1 | 新增 `status TEXT DEFAULT 'todo'`，支持 `todo/in_progress/done`；看板改用 `status`。 | 将流程状态从标签分类中剥离。 | 看板拖拽不再创建业务标签，后续 AI/筛选可直接使用状态。 |
| T-03 | P0 | 详情页日程面板增加“全天”开关，保存 `all_day/due_date/end_date` 的一致组合。 | 详情编辑与日历展示语义一致。 | 全天/跨天任务编辑后仍保留全天或跨天表现。 |
| T-04 | P0 | 在 `tasks` 表补 `reminder_minutes INTEGER`，并接入 Rust/TS 查询、创建、更新、导入导出。 | 让提醒提前量完整持久化。 | 重新加载后提醒提前量不丢失，后端更新不报错。 |

## 3. 执行步骤

### 阶段 0：开发前置检查

前置条件：当前工作区必须干净。

执行命令：

```bash
git status --short --branch
git pull --ff-only
```

注意事项：如果 `git status` 出现未提交改动或 `git pull --ff-only` 失败，停止执行并记录原因。

### 阶段 1：补齐数据库字段

前置条件：阶段 0 通过。  
涉及文件：`src-tauri/src/db.rs`。

操作：

1. 在 Rust `Task` struct 增加 `completed_at: Option<String>`、`status: String`、`reminder_minutes: Option<i64>`。
2. 在 `init_schema` 的兼容列区域使用 `add_column_if_not_exists` 增加：
   - `tasks.completed_at TEXT`
   - `tasks.status TEXT DEFAULT 'todo'`
   - `tasks.reminder_minutes INTEGER`
3. 不重建 `tasks` 表，不删除旧字段。

### 阶段 2：更新任务创建、查询、更新、完成命令

前置条件：阶段 1 完成。

涉及文件：

- `src-tauri/src/commands/task_create.rs`
- `src-tauri/src/commands/task_query.rs`
- `src-tauri/src/commands/task_update.rs`
- `src-tauri/src/commands/task_ops.rs`

操作：

1. `CreateTaskRequest` 增加 `reminder_minutes: Option<i64>`，创建时写入 `reminder_minutes`，`completed_at` 默认为 `NULL`，`status` 默认为 `todo`。
2. `get_tasks` 的 SELECT 字段、row mapping 和返回 `Task` 补齐新增字段。
3. `UpdateTaskRequest` 增加 `completed_at: Option<Option<String>>`、`status: Option<String>`，保留现有 `reminder_minutes` 更新逻辑。
4. `complete_task` 完成时设置 `completed = 1`、`completed_at = now`、`status = 'done'`；取消完成路径由前端 `update_task` 写回 `completed_at = NULL`、`status = 'todo'`。
5. 重复任务生成的新任务必须 `completed = false`、`completed_at = NULL`、`status = 'todo'`。

### 阶段 3：更新 TypeScript 类型和 store

前置条件：阶段 2 编译通过。

涉及文件：

- `src/types.ts`
- `src/stores/taskStore.ts`
- `src/hooks/useTaskCRUD.ts`
- `src/hooks/useTaskInlineEdit.ts`

操作：

1. `Task` 增加 `completed_at?: string | null`、`status?: 'todo' | 'in_progress' | 'done'`、`reminder_minutes?: number | null`。
2. `CreateTaskRequest`、`UpdateTaskRequest` 补齐对应字段。
3. `toggleTask` 本地状态同步时：完成写入 `completed_at` 和 `status: 'done'`；取消完成写入 `completed_at: null` 和 `status: 'todo'`。
4. 任何更新逻辑不得把未传入的新字段重置为默认值。

### 阶段 4：修复详情页全天编辑闭环

前置条件：阶段 3 单元测试通过。

涉及文件：

- `src/components/detail/TaskMetaPanel.tsx`
- `src/components/detail/TaskDetail.tsx`

操作：

1. 在 `SchedulePanel` 增加“全天”开关，本地状态从 `task.all_day` 初始化。
2. 全天模式保存时：`all_day: true`，`due_date` 取本地日期 00:00，`end_date` 取下一天 00:00。
3. 非全天模式保存时：`all_day: false`，保留 `datetime-local` 逻辑；仅当用户明确清空结束时间时传 `end_date: null`。
4. 修改前的固定写法 `all_day: false` 必须删除。

### 阶段 5：看板改用原生 status

前置条件：阶段 4 通过日历相关测试。  
涉及文件：`src/components/KanbanView.tsx`。

操作：

1. 删除 `INPROGRESS_TAG_NAME`、`ensureInProgressTag`、`addTagToTask/removeTagFromTask` 状态切换逻辑。
2. `getColumnOf(task)` 改为读取 `task.status`，`completed` 仍作为兼容兜底。
3. 拖入 `todo`：调用 `updateTask(id, { status: 'todo', completed: false, completed_at: null })`。
4. 拖入 `inprogress`：调用 `updateTask(id, { status: 'in_progress', completed: false, completed_at: null })`。
5. 拖入 `done`：复用完成逻辑或调用等价更新，必须写入 `completed_at`。

## 4. 代码修改规则

| 改动 | 文件完整路径 | 修改前 | 修改后 |
|---|---|---|---|
| DB schema | `src-tauri/src/db.rs` | `tasks` 无 `completed_at/status/reminder_minutes` | 通过 `add_column_if_not_exists` 增量添加三列 |
| Rust Task struct | `src-tauri/src/db.rs` | Task 不含新字段 | Task 与前端类型字段对齐 |
| 查询命令 | `src-tauri/src/commands/task_query.rs` | SELECT 不返回新字段 | SELECT 和 row mapping 返回新字段 |
| 更新命令 | `src-tauri/src/commands/task_update.rs` | 不支持 `completed_at/status` patch | 支持新增字段，保留 null 清空语义 |
| 完成命令 | `src-tauri/src/commands/task_ops.rs` | 只设置 `completed/updated_at` | 同步设置 `completed_at/status` |
| 前端类型 | `src/types.ts` | Task/Create/Update 类型缺字段 | 补齐新增字段，不使用 `any` |
| 详情日程 | `src/components/detail/TaskMetaPanel.tsx` | 保存时固定 `all_day:false` | 根据全天开关保存 all_day/end_date |
| 看板状态 | `src/components/KanbanView.tsx` | “进行中”由标签模拟 | 状态由 `task.status` 驱动 |

禁止事项：禁止重建或清空用户数据库；禁止删除旧任务字段；禁止改变任务默认排序；禁止把看板状态继续写入标签系统。

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

- `src/stores/__tests__/taskStore.test.ts`
- `src/components/calendar/__tests__/WeekView.test.tsx`
- `src/components/__tests__/DayView.test.tsx`
- `src-tauri/src/commands/task_update.rs`
- `src-tauri/src/commands/task_ops.rs`

### 可量化验收项

| 验收项 | 标准 |
|---|---|
| 完成任务 | `completed === true`、`completed_at` 非空、`status === 'done'` |
| 取消完成 | `completed === false`、`completed_at === null`、`status === 'todo'` |
| 编辑已完成任务标题 | `completed_at` 不变化 |
| 全天任务详情编辑 | 保存后 `all_day === true`，周/日视图仍展示在全天区 |
| 看板拖入进行中 | 不创建名为“进行中”的标签，任务 `status === 'in_progress'` |
| 提醒提前量 | 设置后重新加载任务，`reminder_minutes` 值保持一致 |
