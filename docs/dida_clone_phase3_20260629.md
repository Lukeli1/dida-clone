# 滴答清单复刻 — Phase 3 深度优化文档

**生成日期**：2026-06-29 00:15 (Asia/Shanghai)
**当前版本**：v1.22.0（Phase 2 架构重构已完成）
**前置条件**：Phase 1（安全+过滤）✅、Phase 2（架构拆分）✅
**项目路径**：`C:\Users\50441\Documents\trae开发\滴答清单复刻`

---

## 一、Phase 3 目标

**三个方向并行推进，让软件从"能用"升级到"好用+可靠"。**

| 方向                     | 核心目标                   | 量化指标                |
| ------------------------ | -------------------------- | ----------------------- |
| A. 继续拆分剩余大文件    | 0 个文件超过 500 行        | 9 个 → 0 个             |
| B. 习惯数据迁移到 SQLite | 数据持久化、可备份、可查询 | localStorage → rusqlite |
| C. 引入单元测试          | 关键逻辑有测试覆盖         | 0 个 → 30+ 个测试       |

**原则**：

- A 方向：纯重构，零功能变更（同 Phase 2）
- B 方向：功能升级，需要数据迁移脚本（旧 localStorage 数据自动导入 SQLite）
- C 方向：新增基础设施，不改现有代码

---

## 二、当前状态（v1.22.0 基线）

### 2.1 仍超过 500 行的文件（9 个）

| 文件                | 行数 | 问题                                              |
| ------------------- | ---- | ------------------------------------------------- |
| `Sidebar.tsx`       | 722  | 清单管理+标签管理+视图切换+头像+底部设置区        |
| `TaskItem.tsx`      | 707  | 任务行+内联编辑+批量选择+拖拽+右键菜单+子任务展开 |
| `TaskListPanel.tsx` | 628  | P2-06 新拆出的，收纳了较多列表逻辑+MiniCalendar   |
| `WeekView.tsx`      | 600  | 周视图+任务条+拖拽+点击交互                       |
| `PomodoroView.tsx`  | 572  | 番茄钟+统计+设置+任务选择全在一起                 |
| `MonthView.tsx`     | 531  | 月视图+任务条+拖拽+农历                           |
| `AIAssistant.tsx`   | 430  | 对话+技能+操作解析                                |
| `CalendarView.tsx`  | 473  | 容器+ViewToggle+MoreOptions+TaskSidebar           |
| `DayView.tsx`       | 430  | 日视图+任务条+拖拽                                |

### 2.2 Rust 后端

| 文件          | 行数 | 问题                             |
| ------------- | ---- | -------------------------------- |
| `commands.rs` | 857  | 23 个 Tauri command 全在一个文件 |
| `db.rs`       | 166  | 表结构+索引+初始化（合理）       |

### 2.3 测试现状

- ❌ 无任何测试文件
- ❌ 未配置 vitest
- ❌ 无 CI/CD

### 2.4 习惯打卡数据存储

- `localStorage['habits_data']` 存储所有习惯数据
- 无备份能力、无跨设备同步能力、数据量大时可能卡顿

---

## 三、任务清单（10 个任务，3 个方向）

### 方向 A：继续拆分大文件（5 个任务）

---

### P3-01：拆分 `Sidebar.tsx`（722行 → ≤300行）

**当前**：`src/components/Sidebar.tsx` 722 行

**拆分方案**：

```
src/components/sidebar/
├── Sidebar.tsx (200 行) — 容器：布局 + 各区域编排
├── ListSection.tsx (150 行) — 清单列表：增删改 + 选中 + 计数
├── TagSection.tsx (120 行) — 标签列表：增删 + 选中
├── ViewSwitcher.tsx (80 行) — 视图切换按钮组（今日/全部/日历/统计/AI/四象限/番茄钟/习惯/归档）
├── SidebarFooter.tsx (80 行) — 底部：头像 + 设置入口
└── types.ts (30 行) — SidebarProps + 子组件 Props
```

**操作步骤**：

1. 创建 `src/components/sidebar/` 目录
2. 提取 ViewType 类型定义到 `types.ts`
3. 提取视图切换按钮组到 `ViewSwitcher.tsx`
4. 提取清单列表（含 CRUD UI）到 `ListSection.tsx`
5. 提取标签列表到 `TagSection.tsx`
6. 提取底部头像+设置区到 `SidebarFooter.tsx`
7. 主文件只保留容器布局 + props 传递
8. 更新 `App.tsx` 的 import 路径
9. 验证：`tsc --noEmit` 通过

**验收**：

- [ ] `Sidebar.tsx` ≤ 300 行
- [ ] 每个子组件 ≤ 150 行
- [ ] 清单 CRUD / 标签 CRUD / 视图切换 / 头像设置全部正常
- [ ] `tsc --noEmit` 通过

---

### P3-02：拆分 `TaskItem.tsx`（707行 → ≤300行）

**当前**：`src/components/TaskItem.tsx` 707 行

**拆分方案**：

```
src/components/task-item/
├── TaskItem.tsx (200 行) — 容器：任务行主体 + 子组件编排
├── TaskInlineEditor.tsx (120 行) — 内联编辑标题
├── TaskBatchActions.tsx (100 行) — 批量选择工具栏
├── TaskContextMenu.tsx (100 行) — 右键菜单
└── TaskSubtaskList.tsx (150 行) — 子任务展开列表
```

**操作步骤**：

1. 创建 `src/components/task-item/` 目录
2. 提取内联编辑逻辑到 `TaskInlineEditor.tsx`
3. 提取批量选择工具栏到 `TaskBatchActions.tsx`
4. 提取右键菜单到 `TaskContextMenu.tsx`
5. 提取子任务展开列表到 `TaskSubtaskList.tsx`
6. 主文件只保留任务行主体（复选框+标题+元信息+拖拽手柄）
7. 更新 `TaskListPanel.tsx` 的 import 路径
8. 验证：`tsc --noEmit` 通过

**验收**：

- [ ] `TaskItem.tsx` ≤ 300 行
- [ ] 每个子组件 ≤ 150 行
- [ ] 内联编辑 / 批量操作 / 右键菜单 / 子任务展开全部正常
- [ ] `tsc --noEmit` 通过

---

### P3-03：拆分 `TaskListPanel.tsx`（628行 → ≤300行）

**当前**：`src/components/TaskListPanel.tsx` 628 行（P2-06 拆出来的，偏大）

**拆分方案**：

```
src/components/task-list/
├── TaskListPanel.tsx (200 行) — 容器：输入栏 + 列表 + 过滤栏
├── TaskInputBar.tsx (80 行) — 新建任务输入栏（含 AI 模式切换）
├── TaskFilterBar.tsx (100 行) — 过滤栏（完成/逾期/优先级/日期）
├── BatchToolbar.tsx (80 行) — 批量操作工具栏
└── MiniCalendarDropzone.tsx (100 行) — 拖拽到日历的迷你日历（已存在于文件末尾）
```

**操作步骤**：

1. 创建 `src/components/task-list/` 目录
2. 提取 MiniCalendarDropzone（已在文件末尾）到独立文件
3. 提取新建任务输入栏到 `TaskInputBar.tsx`
4. 提取过滤栏到 `TaskFilterBar.tsx`
5. 提取批量操作工具栏到 `BatchToolbar.tsx`
6. 主文件只保留容器 + 列表渲染
7. 更新 `App.tsx` 的 import 路径
8. 验证：`tsc --noEmit` 通过

**验收**：

- [ ] `TaskListPanel.tsx` ≤ 300 行
- [ ] 每个子组件 ≤ 100 行
- [ ] 新建任务 / 过滤 / 批量操作 / 拖拽到日历全部正常
- [ ] `tsc --noEmit` 通过

---

### P3-04：拆分 `PomodoroView.tsx`（572行 → ≤250行）

**当前**：`src/components/PomodoroView.tsx` 572 行

**拆分方案**：

```
src/components/pomodoro/
├── PomodoroView.tsx (200 行) — 容器：计时器 + 任务选择 + 统计
├── PomodoroTimer.tsx (150 行) — 圆环进度 + 时间显示 + 控制按钮
├── PomodoroSettings.tsx (100 行) — 设置面板（时长/模式/声音）
├── PomodoroStats.tsx (80 行) — 当日/累计专注统计
└── storage.ts (60 行) — loadSettings/saveSettings/loadStats/saveStats
```

**操作步骤**：

1. 创建 `src/components/pomodoro/` 目录
2. 提取 localStorage 操作到 `storage.ts`
3. 提取统计面板到 `PomodoroStats.tsx`
4. 提取设置面板到 `PomodoroSettings.tsx`
5. 提取计时器 UI 到 `PomodoroTimer.tsx`
6. 主文件只保留容器 + 状态管理 + 任务选择
7. 更新 `App.tsx` 的 import 路径
8. 验证：`tsc --noEmit` 通过

**验收**：

- [ ] `PomodoroView.tsx` ≤ 250 行
- [ ] 每个子组件 ≤ 150 行
- [ ] 计时器 / 设置 / 统计 / 任务选择全部正常
- [ ] `tsc --noEmit` 通过

---

### P3-05：拆分 `commands.rs`（857行 → ≤300行）

**当前**：`src-tauri/src/commands.rs` 857 行，23 个 Tauri command

**拆分方案**：

```
src-tauri/src/
├── commands.rs (50 行) — mod 声明 + re-export
├── commands/
│   ├── mod.rs (50 行) — 模块声明
│   ├── task_commands.rs (200 行) — get_tasks/create_task/update_task/delete_task/duplicate_task/reorder_tasks/complete_task
│   ├── list_commands.rs (120 行) — get_lists/create_list/update_list/delete_list
│   ├── tag_commands.rs (100 行) — get_tags/create_tag/delete_tag/add_tag_to_task/remove_tag_from_task
│   ├── habit_commands.rs (150 行) — [新增] 习惯 CRUD + 打卡记录
│   └── window_commands.rs (50 行) — window_minimize/maximize/unmaximize/toggle_maximize/is_maximized/close
```

**操作步骤**：

1. 创建 `src-tauri/src/commands/` 目录
2. 按职责把 23 个函数分到 5 个子模块
3. 每个子模块 `pub use` 导出所有 Tauri command 函数
4. `commands.rs` 改为 `mod commands; pub use commands::*;`
5. 更新 `lib.rs` 的 `generate_handler!` 宏（路径不变，只是函数来源变了）
6. 验证：`cargo check` 通过

**注意**：

- `habit_commands.rs` 是为 P3-06 新习惯表预留的，先创建空文件 + 注释
- 拆分时保持所有 `#[tauri::command]` 注解不变
- `DbState` 和 `Task` 等共享类型保持在 `db.rs` 中，各子模块 `use crate::db::*`

**验收**：

- [ ] `commands.rs` ≤ 50 行（仅 mod + re-export）
- [ ] 每个子模块 ≤ 200 行
- [ ] `cargo check` 通过
- [ ] 所有 23 个 Tauri command 调用正常

---

### 方向 B：习惯数据迁移到 SQLite（2 个任务）

---

### P3-06：后端新建 habits 表 + Tauri command

**目标**：在 SQLite 中新建 `habits` 和 `habit_records` 表，提供 Tauri command 让前端读写习惯数据。

**数据库表设计**：

```sql
-- habits 表
CREATE TABLE IF NOT EXISTS habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT,              -- emoji 或自定义文字
    icon_color TEXT,        -- 图标颜色
    frequency TEXT,         -- 'daily' | 'weekly' | 'custom'
    frequency_days TEXT,    -- JSON: [1,3,5] (周几)
    target_count INTEGER DEFAULT 1,
    unit TEXT,              -- '次' | '分钟' | '杯' 等
    start_date TEXT,        -- ISO date
    color TEXT,             -- 卡片颜色
    sort_order REAL DEFAULT 0,
    archived INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- habit_records 表（打卡记录）
CREATE TABLE IF NOT EXISTS habit_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER NOT NULL,
    date TEXT NOT NULL,     -- 'YYYY-MM-DD'
    count INTEGER DEFAULT 1,
    note TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
    UNIQUE(habit_id, date)  -- 每天每习惯一条记录
);

CREATE INDEX IF NOT EXISTS idx_habit_records_habit_id ON habit_records(habit_id);
CREATE INDEX IF NOT EXISTS idx_habit_records_date ON habit_records(date);
```

**Rust 端新增的 Tauri command**（在 `commands/habit_commands.rs` 中）：

```rust
#[tauri::command]
pub fn get_habits(state: State<DbState>, include_archived: Option<bool>) -> Result<Vec<Habit>, String>

#[tauri::command]
pub fn create_habit(state: State<DbState>, req: CreateHabitRequest) -> Result<Habit, String>

#[tauri::command]
pub fn update_habit(state: State<DbState>, id: i64, req: UpdateHabitRequest) -> Result<Habit, String>

#[tauri::command]
pub fn delete_habit(state: State<DbState>, id: i64) -> Result<(), String>

#[tauri::command]
pub fn archive_habit(state: State<DbState>, id: i64, archived: bool) -> Result<(), String>

#[tauri::command]
pub fn get_habit_records(state: State<DbState>, habit_id: i64, start_date: Option<String>, end_date: Option<String>) -> Result<Vec<HabitRecord>, String>

#[tauri::command]
pub fn upsert_habit_record(state: State<DbState>, habit_id: i64, date: String, count: i32, note: Option<String>) -> Result<HabitRecord, String>

#[tauri::command]
pub fn delete_habit_record(state: State<DbState>, habit_id: i64, date: String) -> Result<(), String>
```

**操作步骤**：

1. 在 `db.rs` 中添加 `habits` 和 `habit_records` 表的 CREATE TABLE 语句 + 索引
2. 在 `db.rs` 中定义 `Habit` 和 `HabitRecord` 结构体
3. 在 `commands/habit_commands.rs` 中实现 8 个 Tauri command
4. 在 `lib.rs` 的 `generate_handler!` 宏中注册 8 个新 command
5. 验证：`cargo check` 通过
6. 验证：启动应用后 SQLite 文件中能看到 habits 和 habit_records 表

**验收**：

- [ ] `db.rs` 新增 habits + habit_records 表 + 索引
- [ ] `habit_commands.rs` 实现 8 个 command
- [ ] `lib.rs` 注册 8 个新 command
- [ ] `cargo check` 通过
- [ ] 应用启动后 SQLite 表存在（用 `sqlite3 dida.db ".tables"` 验证）

---

### P3-07：前端习惯模块迁移到 SQLite + 数据迁移脚本

**目标**：`HabitView` 从 localStorage 切换到 Tauri command，并提供旧数据自动迁移。

**前端改动**：

1. 新建 `src/api.ts` 中添加习惯相关 API 封装：

   ```typescript
   // api.ts 新增
   export const habitApi = {
     getHabits: (includeArchived?: boolean) => invoke<Habit[]>('get_habits', { includeArchived }),
     createHabit: (req: CreateHabitRequest) => invoke<Habit>('create_habit', { req }),
     updateHabit: (id: number, req: UpdateHabitRequest) => invoke<Habit>('update_habit', { id, req }),
     deleteHabit: (id: number) => invoke<void>('delete_habit', { id }),
     archiveHabit: (id: number, archived: boolean) => invoke<void>('archive_habit', { id, archived }),
     getRecords: (habitId: number, startDate?: string, endDate?: string) =>
       invoke<HabitRecord[]>('get_habit_records', { habitId, startDate, endDate }),
     upsertRecord: (habitId: number, date: string, count: number, note?: string) =>
       invoke<HabitRecord>('upsert_habit_record', { habitId, date, count, note }),
     deleteRecord: (habitId: number, date: string) => invoke<void>('delete_habit_record', { habitId, date }),
   }
   ```

2. 新建 `src/types.ts` 中添加 Habit 类型定义
3. 修改 `habit/constants.ts`：删除 `STORAGE_KEY`
4. 修改 `habit/HabitView.tsx`：
   - 用 `useEffect` + `habitApi.getHabits()` 替代 localStorage 读取
   - 用 `habitApi.createHabit/updateHabit/deleteHabit` 替代 localStorage 写入
   - 用 `habitApi.upsertRecord/deleteRecord` 替代 localStorage 打卡操作
5. 修改 `habit/HabitCard.tsx`：打卡操作调用 API
6. 添加 TanStack Query 缓存习惯数据（项目已有 `@tanstack/react-query`）

**数据迁移脚本**（首次启动自动执行）：

```typescript
// src/utils/migrateHabits.ts
export async function migrateHabitsFromLocalStorage(): Promise<void> {
  const oldData = localStorage.getItem('habits_data')
  if (!oldData) return // 无旧数据，跳过

  try {
    const oldHabits = JSON.parse(oldData)
    // 检查是否已迁移（用 localStorage 标记）
    if (localStorage.getItem('habits_migrated') === 'true') return

    for (const habit of oldHabits) {
      // 调用 create_habit API 创建
      const newHabit = await habitApi.createHabit({
        name: habit.name,
        icon: habit.icon,
        icon_color: habit.iconColor,
        frequency: habit.frequency || 'daily',
        target_count: habit.targetCount || 1,
        unit: habit.unit || '',
        color: habit.color,
        start_date: habit.startDate,
      })
      // 迁移打卡记录
      if (habit.records) {
        for (const [date, count] of Object.entries(habit.records)) {
          await habitApi.upsertRecord(newHabit.id, date, count as number)
        }
      }
    }

    localStorage.setItem('habits_migrated', 'true')
    // 不立即删除旧数据，保留 7 天作为备份
    localStorage.setItem('habits_backup_date', new Date().toISOString())
    console.log(`[Habit Migration] 成功迁移 ${oldHabits.length} 个习惯`)
  } catch (err) {
    console.error('[Habit Migration] 迁移失败:', err)
  }
}
```

**操作步骤**：

1. 在 `types.ts` 添加 `Habit` / `HabitRecord` / `CreateHabitRequest` / `UpdateHabitRequest` 类型
2. 在 `api.ts` 添加 `habitApi` 对象
3. 新建 `src/utils/migrateHabits.ts`
4. 在 `useAppInit.ts` 中调用 `migrateHabitsFromLocalStorage()`
5. 修改 `habit/constants.ts`：删除 `STORAGE_KEY`
6. 修改 `habit/HabitView.tsx` + `HabitCard.tsx` + `HabitEditor.tsx`：用 API 替代 localStorage
7. 验证：旧 localStorage 数据能自动迁移到 SQLite
8. 验证：新建/编辑/删除/打卡/归档全部正常

**验收**：

- [ ] 旧 localStorage 数据自动迁移到 SQLite
- [ ] 新建习惯 → SQLite 中能查到
- [ ] 打卡 → SQLite 中能查到记录
- [ ] 编辑/删除/归档 → SQLite 中正确更新
- [ ] 专注计时器功能正常
- [ ] `tsc --noEmit` 通过
- [ ] `cargo check` 通过

---

### 方向 C：引入单元测试（3 个任务）

---

### P3-08：配置 vitest + 基础工具函数测试

**目标**：配置 vitest，为 `utils/` 下的纯函数写单元测试。

**操作步骤**：

1. 安装依赖：
   ```powershell
   npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom
   ```
2. 创建 `vitest.config.ts`：
   ```typescript
   import { defineConfig } from 'vitest/config'
   import react from '@vitejs/plugin-react'

   export default defineConfig({
     plugins: [react()],
     test: {
       environment: 'jsdom',
       globals: true,
       setupFiles: './src/test/setup.ts',
       coverage: {
         reporter: ['text', 'html'],
         include: ['src/utils/**', 'src/hooks/**', 'src/lib/**'],
       },
     },
   })
   ```
3. 创建 `src/test/setup.ts`：
   ```typescript
   import '@testing-library/jest-dom'
   ```
4. 在 `package.json` 添加脚本：
   ```json
   {
     "scripts": {
       "test": "vitest run",
       "test:watch": "vitest",
       "test:ui": "vitest --ui",
       "test:coverage": "vitest run --coverage"
     }
   }
   ```
5. 写测试文件：
   ```
   src/utils/__tests__/smartDate.test.ts    — 日期解析（10+ 用例）
   src/utils/__tests__/priority.test.ts     — 优先级颜色（5+ 用例）
   src/utils/__tests__/appearance.test.ts   — 主题切换（3+ 用例）
   src/utils/__tests__/avatar.test.ts       — 头像工具（3+ 用例）
   src/lib/__tests__/bilinks.test.ts        — 双向链接解析（仅 MindFlow 项目，跳过）
   ```

**smartDate 测试用例（示例）**：

```typescript
import { describe, it, expect } from 'vitest'
import { parseSmartDate } from '../smartDate'

describe('parseSmartDate', () => {
  it('解析 "明天"', () => {
    const result = parseSmartDate('明天')
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    expect(result).toMatchObject({
      due_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    })
  })

  it('解析 "下周五"', () => {
    const result = parseSmartDate('下周五')
    expect(result.due_date).toBeDefined()
  })

  it('解析 "2026-12-25"', () => {
    const result = parseSmartDate('2026-12-25')
    expect(result.due_date).toBe('2026-12-25')
  })

  it('空字符串返回 null', () => {
    const result = parseSmartDate('')
    expect(result).toBeNull()
  })
})
```

**验收**：

- [ ] `npm run test` 能跑通
- [ ] 至少 20 个测试用例
- [ ] 覆盖 smartDate / priority / appearance / avatar
- [ ] CI 友好（`vitest run` 非交互式）

---

### P3-09：Store 测试（Zustand）

**目标**：为 `stores/` 下的状态管理写测试。

**操作步骤**：

1. 安装依赖（如未装）：
   ```powershell
   npm install -D @vitest/coverage-v8
   ```
2. 写测试文件：
   ```
   src/stores/__tests__/taskStore.test.ts   — 任务状态（8+ 用例）
   src/stores/__tests__/filterStore.test.ts — 过滤状态（5+ 用例）
   src/stores/__tests__/uiStore.test.ts     — UI 状态（5+ 用例）
   ```

**taskStore 测试用例（示例）**：

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useTaskStore } from '../taskStore'

describe('taskStore', () => {
  beforeEach(() => {
    useTaskStore.setState({ tasks: [], loading: false })
  })

  it('setTasks 正确设置任务列表', () => {
    const tasks = [{ id: 1, title: '测试任务' }]
    useTaskStore.getState().setTasks(tasks)
    expect(useTaskStore.getState().tasks).toEqual(tasks)
  })

  it('setLoading 正确切换加载状态', () => {
    useTaskStore.getState().setLoading(true)
    expect(useTaskStore.getState().loading).toBe(true)
  })
})
```

**验收**：

- [ ] 至少 15 个测试用例
- [ ] 覆盖 taskStore / filterStore / uiStore
- [ ] `npm run test` 全部通过

---

### P3-10：LLM 工具函数测试 + smoke test

**目标**：为 `utils/llm.ts` 和 `utils/prompts/` 写测试。

**操作步骤**：

1. 写测试文件：
   ```
   src/utils/__tests__/llm.test.ts          — 配置读写/错误处理（5+ 用例）
   src/utils/prompts/__tests__/prompts.test.ts — 10 个 prompt 模板（10+ 用例）
   ```
2. Mock `localStorage` 和 `invoke`（Tauri API）
3. 验证每个 prompt 模板返回非空字符串且包含关键变量

**prompts 测试用例（示例）**：

```typescript
import { describe, it, expect } from 'vitest'
import { todaySummary, weeklyReport, smartSearch } from '../index'

describe('AI Prompts', () => {
  it('todaySummary 返回非空字符串', () => {
    const result = todaySummary([])
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
  })

  it('weeklyReport 包含任务数据', () => {
    const result = weeklyReport([{ title: '完成任务A', completed: true }])
    expect(result).toContain('完成任务A')
  })

  it('smartSearch 包含查询关键词', () => {
    const result = smartSearch('会议', [])
    expect(result).toContain('会议')
  })
})
```

**验收**：

- [ ] 至少 15 个测试用例
- [ ] 覆盖 llm.ts 核心函数 + 10 个 prompt 模板
- [ ] `npm run test` 全部通过
- [ ] 总测试数 ≥ 50 个（P3-08 + P3-09 + P3-10）

---

## 四、执行顺序 & 里程碑

```
第 1 批（低风险重构 + 测试基建，~8h）：
  P3-01 拆分 Sidebar           (2.5h)
  P3-02 拆分 TaskItem          (2.5h)
  P3-08 配置 vitest + 工具函数测试 (3h)
  → 验收点 A：tsc + 测试通过 + 功能测试

第 2 批（中风险重构 + 后端扩展，~10h）：
  P3-03 拆分 TaskListPanel     (2h)
  P3-04 拆分 PomodoroView      (2h)
  P3-05 拆分 commands.rs       (2h)
  P3-06 后端新建 habits 表     (2h)
  P3-09 Store 测试              (2h)
  → 验收点 B：tsc + cargo check + 测试通过

第 3 批（功能迁移 + 收尾，~7h）：
  P3-07 前端习惯模块迁移 SQLite (4h)
  P3-10 LLM 工具函数测试       (2h)
  → 验收点 C：全量回归 + 旧数据迁移测试
```

**每批完成后**：

1. `tsc --noEmit` 通过
2. `cargo check` 通过
3. `npm run test` 通过
4. `npm run tauri dev` 手动测试
5. git commit + push

---

## 五、给 workbuddy / Trae 的指令建议

### 第 1 批指令（P3-01 + P3-02 + P3-08，可并行）

```
# P3-01：拆分 Sidebar.tsx
"重构 src/components/Sidebar.tsx。当前 722 行。
拆分到 src/components/sidebar/ 目录：
- Sidebar.tsx (≤300行) — 容器
- ListSection.tsx — 清单列表 CRUD
- TagSection.tsx — 标签列表 CRUD
- ViewSwitcher.tsx — 视图切换按钮组
- SidebarFooter.tsx — 底部头像+设置入口
- types.ts — 类型定义
更新 App.tsx 的 import 路径。tsc --noEmit 通过。纯重构，不改功能。"

# P3-02：拆分 TaskItem.tsx
"重构 src/components/TaskItem.tsx。当前 707 行。
拆分到 src/components/task-item/ 目录：
- TaskItem.tsx (≤300行) — 容器
- TaskInlineEditor.tsx — 内联编辑
- TaskBatchActions.tsx — 批量选择工具栏
- TaskContextMenu.tsx — 右键菜单
- TaskSubtaskList.tsx — 子任务展开列表
更新 TaskListPanel.tsx 的 import 路径。tsc --noEmit 通过。纯重构。"

# P3-08：配置 vitest + 工具函数测试
"配置 vitest 测试环境。
1) 安装：npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom
2) 创建 vitest.config.ts（environment: jsdom, setupFiles: src/test/setup.ts）
3) 在 package.json 添加 test/test:watch/test:ui 脚本
4) 为以下工具函数写测试（≥20 用例）：
   - utils/smartDate.ts（日期解析）
   - utils/priority.ts（优先级颜色）
   - utils/appearance.ts（主题切换）
   - utils/avatar.ts（头像工具）
npm run test 全部通过。"
```

### 第 2 批指令（P3-03 + P3-04 + P3-05 + P3-06 + P3-09）

```
# P3-03：拆分 TaskListPanel.tsx
"重构 src/components/TaskListPanel.tsx。当前 628 行。
拆分到 src/components/task-list/ 目录：
- TaskListPanel.tsx (≤300行) — 容器
- TaskInputBar.tsx — 新建任务输入栏
- TaskFilterBar.tsx — 过滤栏
- BatchToolbar.tsx — 批量操作工具栏
- MiniCalendarDropzone.tsx — 拖拽到日历的迷你日历
更新 App.tsx 的 import 路径。tsc --noEmit 通过。纯重构。"

# P3-04：拆分 PomodoroView.tsx
"重构 src/components/PomodoroView.tsx。当前 572 行。
拆分到 src/components/pomodoro/ 目录：
- PomodoroView.tsx (≤250行) — 容器
- PomodoroTimer.tsx — 圆环进度+控制按钮
- PomodoroSettings.tsx — 设置面板
- PomodoroStats.tsx — 统计面板
- storage.ts — localStorage 读写
更新 App.tsx 的 import 路径。tsc --noEmit 通过。纯重构。"

# P3-05：拆分 commands.rs
"重构 src-tauri/src/commands.rs。当前 857 行，23 个 Tauri command。
拆分到 src-tauri/src/commands/ 目录：
- mod.rs — 模块声明
- task_commands.rs — 任务相关 7 个 command
- list_commands.rs — 清单相关 4 个 command
- tag_commands.rs — 标签相关 5 个 command
- habit_commands.rs — 习惯相关（预留空文件）
- window_commands.rs — 窗口控制 6 个 command
commands.rs 改为 mod 声明 + re-export。
lib.rs 的 generate_handler! 路径不变。
cargo check 通过。纯重构。"

# P3-06：后端新建 habits 表
"在 src-tauri/src/db.rs 中新增 habits 和 habit_records 表（含索引）。
在 commands/habit_commands.rs 中实现 8 个 Tauri command：
get_habits / create_habit / update_habit / delete_habit / archive_habit /
get_habit_records / upsert_habit_record / delete_habit_record
在 lib.rs 的 generate_handler! 中注册 8 个新 command。
定义 Habit 和 HabitRecord 结构体。
cargo check 通过。"

# P3-09：Store 测试
"为 src/stores/ 下的 Zustand store 写测试。
覆盖 taskStore（8+ 用例）、filterStore（5+ 用例）、uiStore（5+ 用例）。
测试 setTasks/setLoading/过滤器切换/视图切换等核心操作。
npm run test 全部通过。"
```

### 第 3 批指令（P3-07 + P3-10）

```
# P3-07：前端习惯模块迁移 SQLite
"将习惯打卡数据从 localStorage 迁移到 SQLite。
1) 在 src/types.ts 添加 Habit/HabitRecord 类型
2) 在 src/api.ts 添加 habitApi 封装（8 个 API 调用）
3) 新建 src/utils/migrateHabits.ts — 自动迁移旧 localStorage 数据
4) 在 src/hooks/useAppInit.ts 中调用迁移函数
5) 修改 habit/constants.ts：删除 STORAGE_KEY
6) 修改 habit/HabitView.tsx + HabitCard.tsx + HabitEditor.tsx：
   用 habitApi 替代 localStorage 读写
7) 迁移成功后保留旧数据 7 天作为备份
tsc --noEimit 通过。旧数据自动迁移到 SQLite。"

# P3-10：LLM 工具函数测试
"为 src/utils/llm.ts 和 src/utils/prompts/ 写测试。
覆盖：
- llm.ts：getLLMConfig/saveLLMConfig 错误处理（5+ 用例）
- prompts/：10 个 prompt 模板返回非空字符串（10+ 用例）
Mock localStorage 和 Tauri invoke。
npm run test 全部通过。总测试数 ≥50。"
```

---

## 六、验收清单（最终）

### 编译

- [ ] `tsc --noEmit` 通过
- [ ] `cargo check` 通过
- [ ] `npm run test` 全部通过（≥50 用例）
- [ ] `npm run test:coverage` 覆盖率报告生成

### 文件行数

- [ ] 没有任何 `.tsx` / `.ts` 文件超过 500 行
- [ ] 没有任何 `.rs` 文件超过 300 行（commands.rs ≤50 行）

### 功能回归（全量）

- [ ] 任务 CRUD + 子任务 + 拖拽 + 批量
- [ ] 日历视图（月/周/日/甘特/看板）
- [ ] AI 助手 10 个技能
- [ ] 习惯打卡（新建/编辑/删除/归档/打卡/专注计时器）
- [ ] 番茄钟
- [ ] 深色模式 + 字体 + 密度
- [ ] 设置全部面板

### 习惯数据迁移

- [ ] 旧 localStorage 数据自动迁移到 SQLite
- [ ] 迁移后 localStorage 保留备份 7 天
- [ ] SQLite 中 habits 和 habit_records 表有数据
- [ ] 新建/编辑/删除/打卡操作写入 SQLite

### 测试覆盖

- [ ] 工具函数（smartDate/priority/appearance/avatar）≥20 用例
- [ ] Store（taskStore/filterStore/uiStore）≥15 用例
- [ ] LLM（llm.ts/prompts）≥15 用例
- [ ] 总测试数 ≥50

### 版本管理

- [ ] 版本号 bump 到 v1.23.0
- [ ] README 更新日志
- [ ] git commit + push

---

## 七、风险控制

| 风险                              | 概率 | 影响 | 缓解                                   |
| --------------------------------- | ---- | ---- | -------------------------------------- |
| P3-07 数据迁移丢失                | 中   | 高   | 保留 localStorage 备份 7 天            |
| P3-05 Rust 模块拆分编译错误       | 低   | 中   | cargo check 立即报错                   |
| P3-08 vitest 配置与 Vite 冲突     | 低   | 低   | vitest.config.ts 独立于 vite.config.ts |
| P3-06 SQLite 表结构设计不合理     | 低   | 中   | 先用最小字段集，后续可 ALTER TABLE     |
| P3-07 TanStack Query 缓存策略不当 | 中   | 低   | 用 staleTime + invalidateQueries 控制  |

**回滚策略**：

- A 方向（P3-01~05）：每任务一个 commit，出问题直接 revert
- B 方向（P3-06~07）：独立 commit，数据迁移有 localStorage 备份
- C 方向（P3-08~10）：独立 commit，测试不影响功能

---

## 八、Phase 3 之后的展望（Phase 4 候选）

1. **LLM 流式响应** — 用 SSE 实现打字机效果
2. **任务搜索增强** — 全文搜索 + 语义搜索
3. **数据导出/导入** — JSON / CSV / Markdown
4. **多设备同步** — 基于 Git 或 WebDAV
5. **主题市场** — 自定义主题分享
6. **国际化** — i18n 支持
7. **CI/CD** — GitHub Actions 自动构建 + 测试

---

## 九、不建议在 Phase 3 做的事

1. ❌ **不拆 AIAssistant.tsx（430行）** — 430 行可接受，且 AI 功能可能大改
2. ❌ **不拆 CalendarView/DayView** — 日历视图可能重构为统一组件
3. ❌ **不引入 E2E 测试** — Phase 4 做
4. ❌ **不做 LLM 流式响应** — Phase 4 做
5. ❌ **不改 Tauri capabilities 权限** — Phase 1 已关闭 withGlobalTauri，够用

Phase 3 的核心目标：**拆完剩余大文件 + 习惯数据上 SQLite + 测试基础设施**。
