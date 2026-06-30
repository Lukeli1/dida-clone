# 滴答清单复刻 — 改进优化文档

**生成日期**：2026-06-28 20:15 (Asia/Shanghai)
**当前版本**：v1.21.0
**前一版本**：v1.19.0（README 标注，已做安全加固）
**项目路径**：`C:\Users\50441\Documents\trae开发\滴答清单复刻`
**技术栈**：Tauri 2 + React 18 + TypeScript + SQLite (rusqlite) + Zustand v5 + TanStack Query v5 + Tailwind 3

---

## 一、项目现状速览

### 1.1 规模

| 层 | 文件数 | 总行数 | 备注 |
|---|---|---|---|
| 前端组件 | 20 个 `.tsx` | ~8,800 | 最大 HabitView 1439 行 |
| 前端入口 | `App.tsx` | 778 | God Component 雏形 |
| Hooks | 4 个 | 749 | `useTaskActions` 467 行偏大 |
| Stores | 6 个 | ~1,500 | 拆分合理 |
| Utils | 6 个 | 1,086 | `llm.ts` 492 行偏大 |
| Rust 后端 | 6 个 `.rs` | 1,238 | `commands.rs` 826 行偏大 |
| **合计** | **42 源文件** | **~13,000** | 成长期项目 |

### 1.2 已具备的能力（v1.21.0）

- ✅ 任务 CRUD + 子任务 + 拖拽排序 + 批量操作 + 归档
- ✅ 4 种日历视图（月/周/日/甘特）+ 看板 + 四象限
- ✅ AI 助手（10 个预设技能 + 半自动操作 + OpenAI 兼容协议）
- ✅ 习惯打卡 + 番茄钟 + 统计
- ✅ 自然语言日期识别、自定义重复规则
- ✅ 二级嵌套标签 + 彩色清单 + 任务颜色体系
- ✅ 深色模式 + 7 种字体 + 3 档密度
- ✅ 系统托盘 + 开机自启 + Markdown 备注
- ✅ v1.19.0 安全加固：WAL + 外键 + 索引 + CSP + 事务原子性

### 1.3 架构亮点

1. **状态拆分合理**：task/list/tag/ui/filter/localStorage 六个 store，职责清晰
2. **Hook 抽得到位**：`useAppInit` / `useKeyboardShortcuts` / `useTaskFiltering` / `useTaskActions` 把 App.tsx 的复杂度压了下去
3. **Context 解耦**：`TaskActionContext` 让 TaskItem 不直接依赖 App 传递 20 多个回调
4. **后端分层清晰**：`db.rs`（初始化+迁移）/ `commands.rs`（Tauri 命令）/ `llm.rs`（外部 API）
5. **类型严格**：tsconfig 启用了 `strict` + `noUnusedLocals` + `noUnusedParameters` + `noFallthroughCasesInSwitch`

---

## 二、诊断出的问题（按优先级 P0→P3）

### 🔴 P0 — 严重，影响稳定性或数据安全

#### P0-1：`get_tasks` 每次全量查询所有任务+所有标签关联

**位置**：`src-tauri/src/commands.rs:69-118`

**问题**：无 `WHERE` 条件、无分页，任务数增长后前端每次刷新都拉全表。当前虽加了索引但 SELECT 仍走全表扫描。

**影响**：任务超过 500 条后首屏加载明显变慢；超过 5000 条会有卡顿。

**修复方案**：
```rust
// 1. 增加 list_id / completed / archived 过滤参数
#[tauri::command]
pub fn get_tasks(
    state: State<DbState>,
    list_id: Option<i64>,
    include_completed: Option<bool>,
    include_archived: Option<bool>,
) -> Result<Vec<Task>, String> { ... }

// 2. 前端按视图拉取子集，而非全量
// 例如「今日任务」只拉 due_date=today AND completed=0
```

**优先级**：P0（数据量增长后必然变慢）

---

#### P0-2：`update_task` 动态拼 SQL 时全部字段都走 `Box<dyn ToSql>`

**位置**：`commands.rs:189-262`

**问题**：每次更新都分配 10+ 个 `Box::new()`，堆分配频繁。更严重的是：**动态 SQL 字符串拼接**虽然目前安全（只拼接字段名常量），但维护成本高，容易在后续修改中引入 SQL 注入。

**修复方案**：
```rust
// 预编译 13 个固定 UPDATE 语句，按字段存在性分支选择
// 或使用 rusqlite::params_from_iter 配合 Vec<(String, Value)>
```

**优先级**：P0（性能+安全双问题）

---

#### P0-3：Mutex 持锁期间执行多次 prepare/query

**位置**：`commands.rs` 全部命令

**问题**：`state.0.lock()` 持锁到函数返回，期间所有 DB 操作串行。如果 LLM 调用或文件 IO 在锁内会阻塞所有其他命令。

**当前缓解**：LLM 调用在 `llm.rs` 独立，未持 DB 锁 ✅
**仍存在的问题**：长查询（如全量 get_tasks）期间，UI 的其他 DB 操作全部阻塞。

**修复方案**：
```rust
// 方案 A：改用 r2d2 连接池（推荐）
// 方案 B：细粒度锁 — 只在 execute 时持锁，查询用只读连接
```

**优先级**：P0（高并发场景下 UI 卡顿）

---

### 🟠 P1 — 重要，影响可维护性或性能

#### P1-1：`App.tsx` 仍是 778 行 God Component

**位置**：`src/App.tsx`

**问题**：
- 37 个 store selector 调用
- 20+ 个 action 从 `useTaskActions` 解构
- 3 个本地 `useState` + 2 个 `useRef`
- JSX 主体里嵌套大量条件渲染和 props 传递

**影响**：
- 任何 UI 状态变化都导致整个 App 重渲染
- 新人/AI 模型理解成本高
- 难以做单元测试

**修复方案**：拆分为 3 个子组件 + 2 个 hook
```
App.tsx (150 行) — 仅布局容器 + Provider
├── TaskListPanel.tsx (200 行) — 任务列表+输入栏+批量工具栏
├── DetailPanel.tsx (150 行) — 任务详情+空状态
├── CalendarPanel.tsx (100 行) — 日历相关视图路由
├── useTaskListState.ts (100 行) — 列表状态+过滤逻辑
└── useTaskListActions.ts (150 行) — 列表专属 action
```

**优先级**：P1（不紧急但会持续恶化）

---

#### P1-2：`HabitView.tsx` 1439 行，单文件过大

**位置**：`src/components/HabitView.tsx`

**问题**：包含 30+ 个预设图标常量、Habit 类型定义、习惯列表、打卡日历、统计图表、编辑弹窗、右键菜单全部塞在一个文件。

**修复方案**：拆为 4 个子组件
```
HabitView/
├── index.tsx (200 行) — 容器+列表
├── HabitCard.tsx (300 行) — 单个习惯卡片+打卡
├── HabitEditor.tsx (400 行) — 编辑弹窗
├── HabitCalendar.tsx (200 行) — 7 天迷你日历
└── constants.ts (100 行) — 预设图标+颜色
```

**优先级**：P1

---

#### P1-3：`SettingsView.tsx` 842 行，所有设置项在一个组件

**位置**：`src/components/SettingsView.tsx`

**问题**：外观/通用/通知/大模型 API/系统/关于 6 个模块平铺，每个模块的逻辑都耦合在一起。

**修复方案**：
```
SettingsView/
├── index.tsx (100 行) — Tab 容器
├── AppearancePanel.tsx (150 行)
├── GeneralPanel.tsx (100 行)
├── NotificationPanel.tsx (100 行)
├── LLMApiPanel.tsx (250 行) — 最复杂，独立
├── SystemPanel.tsx (80 行)
└── AboutPanel.tsx (50 行)
```

**优先级**：P1

---

#### P1-4：HabitView 用 localStorage，与其他数据（SQLite）割裂

**位置**：`HabitView.tsx:39` `STORAGE_KEY = 'habits_data'`

**问题**：
- 习惯数据不进 SQLite，无法备份/导出/同步
- 数据量增长后 localStorage 5MB 限制会触发
- 与任务的关联（如"完成这个习惯关联到某个任务"）无法实现

**修复方案**：
1. 在 SQLite 新建 `habits` 和 `habit_records` 表
2. 新增 Tauri 命令 `get_habits` / `create_habit` / `record_habit` / `delete_habit`
3. 前端改为通过 `useTaskStore` 模式调用 Tauri API
4. 迁移路径：首次启动时检测 localStorage 有数据则导入到 SQLite，然后清空 localStorage

**优先级**：P1（数据架构一致性问题）

---

#### P1-5：`useTaskActions.ts` 467 行，承担了过多职责

**位置**：`src/hooks/useTaskActions.ts`

**问题**：26 个 action 函数挤在一个 hook 里，包括创建/删除/归档/置顶/标签/拖拽/子任务/批量操作/复制/内联编辑…修改任何一个 action 都要在一个 467 行文件里找。

**修复方案**：按职责拆分
```
hooks/
├── useTaskActions.ts (50 行) — 聚合 re-export
├── useTaskCRUD.ts (100 行) — 创建/删除/复制/归档
├── useTaskReorder.ts (80 行) — 拖拽/排序
├── useTaskBatch.ts (100 行) — 批量操作
├── useTaskSubtask.ts (80 行) — 子任务相关
└── useTaskInlineEdit.ts (60 行) — 内联编辑
```

**优先级**：P1

---

#### P1-6：`llm.ts` 492 行，10 个技能 prompt 全部内联

**位置**：`src/utils/llm.ts`

**问题**：10 个预设技能的 prompt 模板字符串直接写在工具函数里，修改 prompt 要在 492 行文件里找。

**修复方案**：
```
utils/
├── llm.ts (150 行) — 核心调用/配置/错误处理
└── prompts/
    ├── todaySummary.ts
    ├── weeklyReport.ts
    ├── smartSearch.ts
    ├── autoTag.ts
    ├── timeEstimate.ts
    ├── conflictDetect.ts
    ├── smartSort.ts
    ├── taskTemplate.ts
    ├── taskBreakdown.ts
    └── prioritySuggest.ts
```

**优先级**：P1

---

### 🟡 P2 — 改善，提升体验或代码质量

#### P2-1：前端无错误边界覆盖关键组件

**位置**：`src/components/ErrorBoundary.tsx`（66 行，已存在但未充分使用）

**问题**：ErrorBoundary 已实现但只在根使用，HabitView/CalendarView/AIAssistant 等任一组件抛错会白屏整个应用。

**修复方案**：在 `<TaskDetail>` / `<CalendarView>` / `<AIAssistant>` / `<HabitView>` 等组件外层各包一个 ErrorBoundary。

**优先级**：P2

---

#### P2-2：`api.ts` 8KB，浏览器降级逻辑未真正使用

**位置**：`src/api.ts`

**问题**：注释写"Tauri invoke + 浏览器降级"，但项目是桌面应用，浏览器降级分支永远不会触发，增加了维护成本和 bundle 体积。

**修复方案**：删除浏览器降级分支，只保留 `invoke` 调用。如果未来要做 Web 版，再通过 feature flag 引入。

**优先级**：P2

---

#### P2-3：Rust 侧 `llm.rs` 124 行，无流式响应支持

**位置**：`src-tauri/src/llm.rs`

**问题**：当前 LLM 调用是 `reqwest::post().json().await` 一次性返回，用户等待 AI 回复时无进度反馈。AI 回复超过 3 秒会有"卡死"感。

**修复方案**：
```rust
// 使用 reqwest::Response::bytes_stream() + Tauri events
// 前端 listen('llm-chunk', ...) 实现流式输出
```

**优先级**：P2（体验提升明显）

---

#### P2-4：`commands.rs` 826 行，13 个命令全在一个文件

**位置**：`src-tauri/src/commands.rs`

**问题**：任务/清单/标签/番茄钟统计的命令混在一起。

**修复方案**：
```
src-tauri/src/
├── commands/
│   ├── mod.rs (50 行) — re-export
│   ├── task_commands.rs (300 行)
│   ├── list_commands.rs (150 行)
│   ├── tag_commands.rs (150 行)
│   └── stats_commands.rs (100 行)
```

**优先级**：P2

---

#### P2-5：前端无单元测试

**问题**：整个 `src/` 下没有 `.test.tsx` / `.test.ts` 文件。`smartDate.ts`（296 行，处理"明天下午3点"等自然语言）这种核心逻辑无测试覆盖。

**修复方案**：
1. 引入 vitest（`npm i -D vitest`）
2. 优先给 `smartDate.ts` / `priority.ts` / `useTaskFiltering.ts` 写测试
3. 目标：核心 utils 测试覆盖率 > 80%

**优先级**：P2

---

#### P2-6：数据库迁移无版本管理

**位置**：`db.rs` 用 `add_column_if_not_exists` 做兼容

**问题**：当前用 PRAGMA 检查列是否存在，能解决 ADD COLUMN，但无法处理：
- 删除列
- 修改列类型
- 表结构重组
- 数据迁移

**修复方案**：引入 schema_version 表 + 迁移脚本
```rust
// 在 init_db 末尾加
conn.execute("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER)", [])?;
let current: i64 = conn.query_row("SELECT COALESCE(MAX(version), 0) FROM schema_version", [], |r| r.get(0))?;
// 按版本号执行迁移
for v in (current+1)..=LATEST_VERSION {
    apply_migration(&conn, v)?;
    conn.execute("INSERT INTO schema_version VALUES (?1)", [v])?;
}
```

**优先级**：P2

---

#### P2-7：CSP 已设置但 `withGlobalTauri: true` 削弱了安全性

**位置**：`tauri.conf.json`

**问题**：`withGlobalTauri: true` 把 Tauri API 挂到 `window.__TAURI__`，XSS 攻击一旦注入脚本就能直接调用 Tauri 命令。

**修复方案**：
1. 改用 `import { invoke } from '@tauri-apps/api/core'`（项目里已这么做了 ✅）
2. 把 `withGlobalTauri` 改为 `false`
3. 如果某些老代码依赖 `window.__TAURI__`，统一改造为 import 形式

**优先级**：P2（安全）

---

### 🟢 P3 — 锦上添花

#### P3-1：无性能监控埋点

**问题**：无法量化首屏加载时间、任务列表渲染时间、AI 响应时间。

**方案**：用 `performance.mark` / `performance.measure` 给关键路径埋点，开发环境输出到 console。

---

#### P3-2：无打包体积分析

**问题**：bundle 461KB（v0.3.1 MindFlow），本项目可能更大但没分析过。

**方案**：`vite-bundle-visualizer` 定期生成体积报告，监控依赖膨胀。

---

#### P3-3：`dist/` 目录被提交

**问题**：`dist/index.html` 和 `dist/assets/` 在项目根目录，`.gitignore` 可能未排除。

**方案**：确认 `.gitignore` 包含 `dist/`，从 git 历史中清理。

---

#### P3-4：`dida.db` 数据库文件在项目根目录

**位置**：项目根 `dida.db` + `src-tauri/dida.db`

**问题**：开发环境的测试数据库可能被误提交。

**方案**：`.gitignore` 加 `*.db`，根目录的 `dida.db` 应删除或仅保留空 schema。

---

#### P3-5：无 CI/CD

**问题**：无 GitHub Actions，push 后不自动构建测试。

**方案**：加 `.github/workflows/ci.yml`，至少跑 `tsc --noEmit` + `cargo check`。

---

## 三、分阶段执行计划

### Phase 1：稳定性 & 安全（修正版，仅 2 个任务）

> **修正说明**（2026-06-28 20:18）：经 GLM5.2 评审反馈后调整。
> - P0-2（update_task 优化）**跳过**：`Box<dyn ToSql>` 是微秒级开销，预定义 13 个常量反而增加代码复杂度，不值得。
> - P0-3（r2d2 连接池）**跳过**：SQLite 是单写者模型，r2d2 对 SQLite 收益有限；单用户桌面应用无高并发场景；19 处 `state.0.lock()` 改动风险极高。
> - P0-1 修正：后端加可选过滤参数作为**能力预埋**，前端暂不切换（现有 `useTaskFiltering` 前端筛选架构工作良好，等任务量真正成为瓶颈再切换）。

| 任务 | 文件 | 预计工时 | 风险 |
|---|---|---|---|
| P0-1 get_tasks 加可选过滤参数（后端能力预埋） | `commands.rs` + `api.ts` | 4h | 低 |
| P2-7 关闭 withGlobalTauri | `tauri.conf.json` + `api.ts` | 2h | 低 |

**验收标准**：
- [ ] `get_tasks` 支持 `list_id` / `include_completed` / `include_archived` 可选过滤参数（None 时行为不变）
- [ ] 前端现有调用点不改（保持全量拉取）
- [ ] `window.__TAURI__` 不再存在
- [ ] `tsc --noEmit` + `cargo check` 通过
- [ ] 应用可正常启动、增删改查任务、AI 对话

**原 P0-2/P0-3 降级说明**：
- P0-2 → 降为 P3（微秒级开销，不紧急）
- P0-3 → 降为 P3（桌面单用户场景不适用，仅未来做多窗口/多视图并发时再考虑）

---

### Phase 2：架构重构（2-3 周，P1 全部）

| 任务 | 文件 | 预计工时 | 风险 |
|---|---|---|---|
| P1-1 拆分 App.tsx | `App.tsx` → 5 个文件 | 8h | 高（影响面广） |
| P1-2 拆分 HabitView | `HabitView.tsx` → 4 个文件 | 6h | 中 |
| P1-3 拆分 SettingsView | `SettingsView.tsx` → 7 个文件 | 6h | 中 |
| P1-4 习惯数据迁移到 SQLite | 新建表 + Tauri 命令 + 前端改造 | 10h | 高 |
| P1-5 拆分 useTaskActions | `useTaskActions.ts` → 5 个文件 | 4h | 低 |
| P1-6 拆分 llm.ts | `llm.ts` → 11 个文件 | 4h | 低 |

**验收标准**：
- [ ] 没有任何文件超过 500 行
- [ ] 习惯数据可通过"数据导出"功能备份
- [ ] 所有功能回归通过
- [ ] `tsc --noEmit` 通过

---

### Phase 3：体验 & 质量（2-3 周，P2 + P3）

| 任务 | 预计工时 |
|---|---|
| P2-1 给关键组件包 ErrorBoundary | 2h |
| P2-2 删除 api.ts 浏览器降级分支 | 2h |
| P2-3 LLM 流式响应 | 8h |
| P2-4 拆分 commands.rs | 4h |
| P2-5 引入 vitest + 核心工具测试 | 8h |
| P2-6 数据库迁移版本管理 | 6h |
| P3-1 性能埋点 | 4h |
| P3-2 打包体积分析 | 2h |
| P3-3 清理 dist/ | 1h |
| P3-4 清理 dida.db | 1h |
| P3-5 GitHub Actions CI | 4h |

---

## 四、给 workbuddy 的指令建议（Phase 1 修正版）

```
# Phase 1 修正版（2 个任务，经 GLM5.2 评审后调整）

## 任务 1：P0-1 get_tasks 加可选过滤参数（后端能力预埋）
"修改 src-tauri/src/commands.rs 的 get_tasks 命令，增加三个可选参数：list_id: Option<i64>、include_completed: Option<bool>、include_archived: Option<bool>。参数为 None 时行为不变（全量返回），Some 时加 WHERE 过滤。include_completed 默认 true，include_archived 默认 false。同步修改 src/api.ts 的 getTasks 函数签名，增加同名可选参数，不传时走默认行为。前端现有调用点不改（保持全量拉取）。tsc --noEmit + cargo check 通过。"

## 任务 2：P2-7 关闭 withGlobalTauri
"1) 修改 src/api.ts 中检测 window.__TAURI__ 的逻辑，改为直接 import { invoke } from '@tauri-apps/api/core'（如果已经是 import 形式则只删除 __TAURI__ 检测分支）；2) tauri.conf.json 的 withGlobalTauri 改为 false；3) 全局搜索 __TAURI__ 确认无残留；4) tsc --noEmit 通过；5) 应用启动 + 任务增删改查 + AI 对话 正常。"
```

---

## 五、代码质量评分

| 维度 | 评分 | 说明 |
|---|---|---|
| **功能完整性** | ⭐⭐⭐⭐⭐ | 1.21 版本功能远超一般复刻，甘特/看板/四象限/番茄钟/习惯/AI 全有 |
| **类型安全** | ⭐⭐⭐⭐ | strict 模式 + tsc 通过，但 Rust 侧 `.map_err(|e| e.to_string())` 丢失错误类型 |
| **架构清晰度** | ⭐⭐⭐ | Store/Hook 拆分好，但 App.tsx 和几个大组件仍是 God Object |
| **性能** | ⭐⭐⭐ | v1.19 加了索引，但 get_tasks 全量查询 + Mutex 持锁是隐患 |
| **安全** | ⭐⭐⭐⭐ | CSP + WAL + 外键 + 事务都做了，withGlobalTauri 是唯一缺口 |
| **可测试性** | ⭐⭐ | 无单元测试，核心逻辑无覆盖 |
| **可维护性** | ⭐⭐⭐ | 代码注释充分，但大文件多，修改成本高 |
| **文档** | ⭐⭐⭐⭐ | README 详尽，有项目开发规范和架构优化方案 |

**综合**：⭐⭐⭐⭐（4/5）— 功能丰富、基础扎实，主要瓶颈在架构拆分和数据层优化。

---

## 六、关键说明

1. **本文档聚焦改进**，不复述已有功能。功能清单见 README.md
2. **所有 P0 任务都涉及 Rust 后端**，建议用"贵模型"做决策，便宜模型做执行（参考 `项目开发规范.md` 的双模型策略）
3. **Phase 1 的 P0-3（r2d2 连接池）风险最高**，建议在单独分支开发，全量回归后再合并
4. **P1-4（习惯数据迁移 SQLite）需要数据迁移逻辑**，务必先备份现有用户的 localStorage 数据
5. **v1.19.0 的安全加固做得到位**，本文档未重复那些已完成项

---

## 七、附：诊断方法清单

本次诊断基于以下信息：

| 信息源 | 用途 |
|---|---|
| `package.json` + `Cargo.toml` | 依赖版本、项目元数据 |
| `tsconfig.json` | TypeScript 严格度 |
| `tauri.conf.json` | Tauri 配置、CSP、withGlobalTauri |
| `src/` 目录树 + 行数统计 | 识别大文件、God Component |
| `src-tauri/src/` 目录树 | 后端规模 |
| `README.md` | 功能清单、版本历史 |
| `src-tauri/src/commands.rs` 前 350 行 | Rust 代码质量、SQL 模式 |
| `src-tauri/src/db.rs` 全文 | 数据库初始化、迁移策略 |
| `src/App.tsx` 前 180 行 | 前端架构、状态管理 |
| `src/components/HabitView.tsx` 前 60 行 | 大组件结构 |
| `项目开发规范.md` | 已有规范 |
| `项目架构优化方案.md` | 已有架构分析 |
| `tsc --noEmit` | TypeScript 编译验证（✅ 通过） |
| git log | 版本演进、提交规范 |
