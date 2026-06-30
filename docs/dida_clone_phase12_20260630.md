# 滴答清单复刻 — Phase 12 优化改进文档

**项目路径**：`C:\Users\50441\Documents\trae开发\滴答清单复刻`
**当前版本**：v1.32.0
**目标版本**：v1.33.0
**文档生成**：2026-06-30 21:15
**Phase 12 定位**：体验闭环 + AI 能力深化 + 数据深度 + 性能可观测

---

## 一、Phase 12 方向总览

| # | 类型 | 任务 | 优先级 | 预估 | 目标 |
|---|---|---|---|---|---|
| P12-01 | 功能 | 窗口宽度自适应（响应式布局） | P0 | 5h | 窗口缩到 600px 仍可用 |
| P12-02 | AI | AI 自动排程（智能日程规划） | P0 | 6h | "帮我安排明天的任务" → 自动填入日历 |
| P12-03 | AI | 任务关联图谱 / 相关任务推荐 | P1 | 4h | 详情面板显示"相关任务"，AI 生成关联 |
| P12-04 | 功能 | 时间追踪（Time Tracking） | P0 | 5h | 任务级开始/停止计时，统计时间分布 |
| P12-05 | 功能 | 周/月报自动化 | P1 | 3h | 每周日自动生成周报并归档，月趋势图 |
| P12-06 | 功能 | 目标/OKR 管理 | P1 | 5h | 新增"目标"实体，关联任务，显示进度 |
| P12-07 | 架构 | 性能数据化（Web Vitals + 操作耗时面板） | P2 | 3h | 设置面板显示关键操作耗时 |

**总计**：7 个任务，约 31h

---

## 二、任务清单

### 方向 A：窗口宽度自适应（响应式布局）

---

#### P12-01：窗口宽度自适应（P0 | ⭐ GLM 5.2，5h）

**目标**：窗口宽度从 1200px 缩到 600px（甚至手机竖屏宽度）仍能保持核心功能可用，为未来移动端 / PWA 铺路。

**现状分析**：
- `tauri.conf.json` 中 `minWidth: 900`，实际上限制了缩放
- `Sidebar` 固定 `w-64`（256px），窗口缩小时侧边栏占比过大
- `DetailPanel` 在右侧常驻，窄屏时会挤占主区域
- `TaskListPanel` 的筛选栏、批量工具栏、迷你日历在小屏下会换行错乱
- 日历视图（周/日/月）在窄屏下表格会横向滚动而非自适应

**实现步骤**：

##### 1. 放宽窗口最小宽度，引入断点机制

修改 `src-tauri/tauri.conf.json`：

```json
"minWidth": 480,
"minHeight": 400,
```

在 `src/hooks/useWindowSize.ts` 新增窗口尺寸监听 hook：

```tsx
import { useState, useEffect } from 'react'

export type Breakpoint = 'mobile' | 'tablet' | 'desktop'
export interface WindowSize {
  width: number
  height: number
  breakpoint: Breakpoint
  isNarrow: boolean  // < 768
  isCompact: boolean // < 1024
}

export function useWindowSize(): WindowSize {
  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }))

  useEffect(() => {
    function update() {
      setSize({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const breakpoint: Breakpoint =
    size.width < 768 ? 'mobile' : size.width < 1024 ? 'tablet' : 'desktop'

  return {
    ...size,
    breakpoint,
    isNarrow: size.width < 768,
    isCompact: size.width < 1024,
  }
}
```

##### 2. Sidebar 改为可折叠 + 抽屉模式

修改 `src/components/sidebar/Sidebar.tsx`：

- **桌面（≥1024px）**：保持 `w-64` 固定显示
- **平板（768-1023px）**：折叠为 `w-16` 图标条，hover 展开
- **移动（<768px）**：完全隐藏，通过左上角汉堡按钮唤出抽屉

```tsx
// uiStore 新增
sidebarCollapsed: boolean
sidebarOpen: boolean    // 移动端抽屉开关
toggleSidebar: () => void
setSidebarOpen: (open: boolean) => void

// Sidebar.tsx
export function Sidebar(props: SidebarProps) {
  const { isCompact, isNarrow } = useWindowSize()
  const sidebarOpen = useUIStore(s => s.sidebarOpen)
  const sidebarCollapsed = useUIStore(s => s.sidebarCollapsed)

  // 移动端：抽屉
  if (isNarrow) {
    return (
      <>
        {/* 遮罩 */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={() => useUIStore.getState().setSidebarOpen(false)}
          />
        )}
        <aside className={`
          fixed left-0 top-0 bottom-0 z-50 w-64 bg-[var(--color-surface)]
          transform transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          {/* 原内容 */}
        </aside>
      </>
    )
  }

  // 平板：折叠图标条
  if (isCompact) {
    return (
      <aside className="w-16 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col h-full">
        <CollapsedSidebarContent {...props} />
      </aside>
    )
  }

  // 桌面：原样
  return (
    <aside className="w-64 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col h-full">
      {/* 原内容 */}
    </aside>
  )
}
```

##### 3. TitleBar 增加汉堡按钮（窄屏显示）

```tsx
// TitleBar.tsx 新增
{isNarrow && (
  <button
    onClick={() => useUIStore.getState().setSidebarOpen(true)}
    className="p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] rounded"
    aria-label="打开侧边栏"
  >
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  </button>
)}
```

##### 4. DetailPanel 窄屏改为全屏覆盖

```tsx
// DetailPanel.tsx
export function DetailPanel({ task, actions }: DetailPanelProps) {
  const { isNarrow } = useWindowSize()

  if (!task) return null

  if (isNarrow) {
    // 窄屏：全屏滑入面板
    return (
      <div className="fixed inset-0 z-50 bg-[var(--color-bg-primary)] overflow-y-auto">
        <div className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] p-3 flex items-center justify-between">
          <button onClick={() => useUIStore.getState().setSelectedTaskId(null)}>
            <ArrowLeftIcon />
          </button>
          <span className="text-sm text-[var(--color-text-secondary)]">任务详情</span>
          <div className="w-8" />
        </div>
        <div className="p-4">
          <TaskDetail task={task} actions={actions} />
        </div>
      </div>
    )
  }

  // 桌面：原样滑入面板
  return (
    <aside className="w-96 bg-[var(--color-surface)] border-l border-[var(--color-border)] overflow-y-auto">
      <TaskDetail task={task} actions={actions} />
    </aside>
  )
}
```

##### 5. TaskListPanel 窄屏布局调整

- 筛选栏在窄屏下改为单行滚动（`overflow-x-auto`）
- 批量工具栏图标化，文字标签隐藏
- 迷你日历在窄屏下隐藏，改用日期选择器

##### 6. 日历视图窄屏适配

- **月视图**：单元格高度自适应，窄屏下显示更少信息（只显示任务数小圆点）
- **周视图**：窄屏下改为列表式（每个时段一行）
- **日视图**：窄屏下保持竖向时间轴

##### 7. AIAssistant 窄屏适配

- 窄屏下改为全屏模式而非侧边栏

##### 8. 测试

- TSC 通过
- 人工测试：窗口从 1200px 缩到 480px，各视图无横向滚动、无遮挡
- 关键路径：添加任务 / 完成 / 删除 / 切换视图 在窄屏下均可用

**验收**：
- ✅ 窗口宽度 480px 仍可用，无横向滚动
- ✅ 侧边栏在窄屏下抽屉化，平板下折叠
- ✅ 详情面板窄屏全屏覆盖
- ✅ 日历视图窄屏自适应
- ✅ TSC 通过

---

### 方向 B：AI 能力深化

---

#### P12-02：AI 自动排程（智能日程规划）（P0 | ⭐ GLM 5.2，6h）

**目标**：用户说"帮我安排明天的任务"，AI 根据任务优先级、时长估计、日历空档，自动把任务填入日历时间段。

**现状分析**：
- 已有 `AI_SKILLS` 数组，新增 `auto-schedule` 技能
- 任务有 `due_date` / `end_date` / `priority` 字段，AI 可通过 action protocol 修改
- 周视图 / 日视图已支持时间块渲染
- 缺少：AI 不了解用户日历空档、任务时长估计不准

**实现步骤**：

##### 1. 新增 `src/utils/prompts/autoSchedule.ts`

```ts
import type { Task } from '../../types'
import { formatTasksContext } from '../llm'

/** AI 自动排程 */
export function autoSchedule(tasks: Task[]): string {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const dateStr = tomorrow.toISOString().slice(0, 10)

  return `你是智能日程助手。请根据以下未安排的任务，为明天（${dateStr}）生成一份合理的日程表。

规则：
1. 工作时间：9:00-12:00, 14:00-18:00, 20:00-22:00（可调整）
2. 高优先级任务（priority=1）优先安排在上午精力最佳时段
3. 每个任务预估一个时长（15分钟为单位），总时长不超过工作时间
4. 相似任务批量处理（如所有"邮件/消息"类放一起）
5. 预留 15 分钟休息时间
6. 如果任务有 due_date 且是明天，优先安排

可用动作：
- update_task(id, { due_date: "2026-07-01T09:00:00", end_date: "2026-07-01T10:00:00" })

请先用自然语言简述安排思路，然后用 ACTION_JSON 输出具体操作。

未安排任务列表：
${formatTasksContext(tasks)}`
}
```

##### 2. 在 `AI_SKILLS` 数组中注册

```ts
import { autoSchedule } from './autoSchedule'

// AI_SKILLS 数组新增
{
  id: 'auto-schedule',
  name: '智能排程',
  icon: '🗓️',
  description: 'AI 自动安排明日日程',
  buildPrompt: autoSchedule,
}
```

##### 3. AIAssistant 输入框支持排程指令识别

在 `AIAssistant.tsx` 的 `handleSend` 中，检测用户输入：
- "安排明天" / "排程" / "规划日程" / "schedule" → 自动触发 auto-schedule 技能

```tsx
function detectSchedulingIntent(input: string): boolean {
  const keywords = ['安排明天', '排程', '规划日程', '安排任务', 'schedule', 'plan tomorrow']
  return keywords.some(k => input.toLowerCase().includes(k.toLowerCase()))
}

// 在 handleSend 中
if (detectSchedulingIntent(input)) {
  const activeSkill = AI_SKILLS.find(s => s.id === 'auto-schedule')
  if (activeSkill) {
    const prompt = activeSkill.buildPrompt(incompleteTasks)
    // 发送给 LLM
  }
}
```

##### 4. 新增"排程预览"UI

AI 返回排程方案后，显示一个预览面板，用户确认后才执行：

```tsx
// SchedulePreviewDialog.tsx
export function SchedulePreviewDialog({ schedule, onConfirm, onCancel }: {
  schedule: Array<{ task: Task; start: string; end: string }>
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--color-surface)] rounded-lg p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto">
        <h3 className="text-lg font-medium mb-4">明日日程预览</h3>
        <div className="space-y-2">
          {schedule.map(item => (
            <div key={item.task.id} className="flex items-center gap-3 p-2 bg-[var(--color-bg-secondary)] rounded">
              <span className="text-sm text-[var(--color-text-secondary)] w-32">
                {item.start.slice(11, 16)} - {item.end.slice(11, 16)}
              </span>
              <span className="flex-1">{item.task.title}</span>
              <PriorityBadge priority={item.task.priority} />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm rounded border">取消</button>
          <button onClick={onConfirm} className="px-3 py-1.5 text-sm rounded bg-[var(--color-accent)] text-white">确认应用</button>
        </div>
      </div>
    </div>
  )
}
```

##### 5. 日历视图增加"AI 排程"入口

在 `CalendarToolbar.tsx` 增加按钮，点击后触发 AI 排程技能。

**验收**：
- ✅ AI 技能列表新增"智能排程"
- ✅ 输入"帮我安排明天" 触发排程
- ✅ AI 返回排程方案 + ACTION_JSON
- ✅ 显示预览面板，用户确认后任务被填入时间块
- ✅ 日历周/日视图显示 AI 安排的任务

---

#### P12-03：任务关联图谱 / 相关任务推荐（P1 | ⭐ GLM 5.2，4h）

**目标**：在任务详情面板显示"相关任务"推荐；AI 分析任务标题/备注，检测关联（同一项目、同一人、同一地点）。

**实现步骤**：

##### 1. 新增 `src/utils/prompts/relatedTasks.ts`

```ts
import type { Task } from '../../types'
import { formatTasksContext } from '../llm'

/** 关联任务推荐 */
export function relatedTasks(currentTask: Task, allTasks: Task[]): string {
  const otherTasks = allTasks.filter(t => t.id !== currentTask.id).slice(0, 50)
  return `分析以下任务，找出与当前任务相关的任务（同一项目、同一提及人物、同一地点、主题相关）。

当前任务：
- 标题：${currentTask.title}
- 备注：${currentTask.notes || '无'}
- 清单：${currentTask.list_id}

候选任务列表：
${formatTasksContext(otherTasks)}

请用 JSON 数组返回相关任务 ID 和关联原因：
[{"task_id": 123, "reason": "同一项目：MindFlow 开发"}, ...]
只返回 JSON，不要其他内容。`
}
```

##### 2. TaskDetail 增加"相关任务"区块

```tsx
// RelatedTasksPanel.tsx
export function RelatedTasksPanel({ task, allTasks, onTaskClick }: {
  task: Task
  allTasks: Task[]
  onTaskClick: (id: number) => void
}) {
  const [related, setRelated] = useState<Array<{ task_id: number; reason: string }>>([])
  const [loading, setLoading] = useState(false)

  async function loadRelated() {
    setLoading(true)
    try {
      const prompt = relatedTasks(task, allTasks)
      const result = await llmChat([{ role: 'user', content: prompt }])
      const parsed = JSON.parse(result)
      setRelated(parsed)
    } catch {
      setRelated([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRelated()
  }, [task.id])

  if (related.length === 0) return null

  return (
    <div className="border-t border-[var(--color-border-light)] pt-3 mt-3">
      <h4 className="text-xs text-[var(--color-text-tertiary)] mb-2">相关任务</h4>
      <div className="space-y-1">
        {related.map(({ task_id, reason }) => {
          const t = allTasks.find(x => x.id === task_id)
          if (!t) return null
          return (
            <button
              key={task_id}
              onClick={() => onTaskClick(task_id)}
              className="block w-full text-left p-2 rounded hover:bg-[var(--color-bg-secondary)]"
            >
              <div className="text-sm">{t.title}</div>
              <div className="text-xs text-[var(--color-text-tertiary)]">{reason}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

##### 3. 在 TaskDetail 底部集成

```tsx
// TaskDetail.tsx 底部新增
<RelatedTasksPanel
  task={task}
  allTasks={tasks}
  onTaskClick={(id) => useUIStore.getState().setSelectedTaskId(id)}
/>
```

##### 4. （可选）任务关联图谱视图

新增 `GraphView.tsx`，用 D3.js 或 react-force-graph 渲染任务关联网络。**本期仅做最小版**：在详情面板显示"相关任务"列表，不做完整图谱。

**验收**：
- ✅ 任务详情面板底部显示"相关任务"区块
- ✅ AI 返回关联原因（"同一项目"、"同一人"等）
- ✅ 点击相关任务可跳转
- ✅ 无相关任务时不显示该区块

---

### 方向 C：功能深化

---

#### P12-04：时间追踪（Time Tracking）（P0 | ⭐ V4 Pro，5h）

**目标**：任务级时间追踪，记录每段开始/结束时间，统计面板显示时间分布。

**现状分析**：
- 番茄钟统计了专注时长，但不等于任务实际耗时
- 任务表无 `time_entries` 关联
- 统计视图（StatsView）只统计任务数，不统计时间

**实现步骤**：

##### 1. 后端：新增 `time_entries` 表

修改 `src-tauri/src/db.rs`：

```rust
pub fn init_db(path: &str) -> Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")?;

    // ... 现有表 ...

    // 时间追踪记录表
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS time_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT,
            duration_secs INTEGER NOT NULL DEFAULT 0,
            note TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(task_id);
        CREATE INDEX IF NOT EXISTS idx_time_entries_start ON time_entries(start_time);
    ")?;

    Ok(conn)
}
```

##### 2. 后端：新增 `time_tracking_commands.rs`

```rust
// src-tauri/src/commands/time_tracking_commands.rs
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::db::DbState;

#[derive(Serialize, Deserialize)]
pub struct TimeEntry {
    pub id: i64,
    pub task_id: i64,
    pub start_time: String,
    pub end_time: Option<String>,
    pub duration_secs: i64,
    pub note: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub fn start_time_tracking(task_id: i64, state: State<DbState>) -> Result<i64, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    db.execute(
        "INSERT INTO time_entries (task_id, start_time) VALUES (?, ?)",
        rusqlite::params![task_id, now],
    ).map_err(|e| e.to_string())?;
    Ok(db.last_insert_rowid())
}

#[tauri::command]
pub fn stop_time_tracking(entry_id: i64, state: State<DbState>) -> Result<TimeEntry, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    // 获取开始时间
    let start_time: String = db.query_row(
        "SELECT start_time FROM time_entries WHERE id = ?",
        rusqlite::params![entry_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let start = chrono::DateTime::parse_from_rfc3339(&start_time).map_err(|e| e.to_string())?;
    let end = chrono::Utc::now();
    let duration = (end - start.with_timezone(&chrono::Utc)).num_seconds();

    db.execute(
        "UPDATE time_entries SET end_time = ?, duration_secs = ? WHERE id = ?",
        rusqlite::params![now, duration, entry_id],
    ).map_err(|e| e.to_string())?;

    // 返回更新后的条目
    db.query_row(
        "SELECT id, task_id, start_time, end_time, duration_secs, note, created_at FROM time_entries WHERE id = ?",
        rusqlite::params![entry_id],
        |row| Ok(TimeEntry {
            id: row.get(0)?,
            task_id: row.get(1)?,
            start_time: row.get(2)?,
            end_time: row.get(3)?,
            duration_secs: row.get(4)?,
            note: row.get(5)?,
            created_at: row.get(6)?,
        }),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_time_entries(task_id: Option<i64>, date_start: Option<String>, date_end: Option<String>, state: State<DbState>) -> Result<Vec<TimeEntry>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    // 动态构建查询...
    let mut sql = String::from("SELECT id, task_id, start_time, end_time, duration_secs, note, created_at FROM time_entries WHERE 1=1");
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![];

    if let Some(tid) = task_id {
        sql.push_str(" AND task_id = ?");
        params.push(Box::new(tid));
    }
    if let Some(start) = &date_start {
        sql.push_str(" AND start_time >= ?");
        params.push(Box::new(start.clone()));
    }
    if let Some(end) = &date_end {
        sql.push_str(" AND start_time <= ?");
        params.push(Box::new(end.clone()));
    }
    sql.push_str(" ORDER BY start_time DESC");

    let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
    let entries = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
        Ok(TimeEntry {
            id: row.get(0)?,
            task_id: row.get(1)?,
            start_time: row.get(2)?,
            end_time: row.get(3)?,
            duration_secs: row.get(4)?,
            note: row.get(5)?,
            created_at: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    Ok(entries)
}

#[tauri::command]
pub fn delete_time_entry(entry_id: i64, state: State<DbState>) -> Result<(), String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM time_entries WHERE id = ?", rusqlite::params![entry_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_time_stats(group_by: String, date_start: Option<String>, date_end: Option<String>, state: State<DbState>) -> Result<Vec<(String, i64)>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    // group_by: "task" | "list" | "day" | "week"
    let sql = match group_by.as_str() {
        "task" => "SELECT t.title, SUM(te.duration_secs) FROM time_entries te JOIN tasks t ON te.task_id = t.id WHERE 1=1",
        "list" => "SELECT l.name, SUM(te.duration_secs) FROM time_entries te JOIN tasks t ON te.task_id = t.id JOIN lists l ON t.list_id = l.id WHERE 1=1",
        "day" => "SELECT date(te.start_time), SUM(te.duration_secs) FROM time_entries te WHERE 1=1",
        _ => return Err("Invalid group_by".into()),
    };
    // 追加 GROUP BY 和日期过滤
    // ... 实现略
    Ok(vec![])
}
```

##### 3. 在 `lib.rs` 注册新命令

```rust
.invoke_handler(tauri::generate_handler![
    // ... 现有命令 ...
    commands::time_tracking_commands::start_time_tracking,
    commands::time_tracking_commands::stop_time_tracking,
    commands::time_tracking_commands::get_time_entries,
    commands::time_tracking_commands::delete_time_entry,
    commands::time_tracking_commands::get_time_stats,
])
```

##### 4. 前端：TaskDetail 增加"开始计时"按钮

```tsx
// TaskDetail.tsx 新增
import { useState, useEffect } from 'react'
import { startTimeTracking, stopTimeTracking, getTimeEntries } from '../../api/timeTracking'

function TimeTrackingSection({ task }: { task: Task }) {
  const [activeEntryId, setActiveEntryId] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [entries, setEntries] = useState<TimeEntry[]>([])

  // 从 localStorage 恢复计时状态
  useEffect(() => {
    const saved = localStorage.getItem(`time_tracking_${task.id}`)
    if (saved) {
      const { entryId, startTs } = JSON.parse(saved)
      setActiveEntryId(entryId)
      setElapsed(Math.floor((Date.now() - startTs) / 1000))
    }
    // 加载历史
    getTimeEntries(task.id).then(setEntries)
  }, [task.id])

  // 计时器
  useEffect(() => {
    if (!activeEntryId) return
    const timer = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(timer)
  }, [activeEntryId])

  async function handleStart() {
    const id = await startTimeTracking(task.id)
    setActiveEntryId(id)
    setElapsed(0)
    localStorage.setItem(`time_tracking_${task.id}`, JSON.stringify({
      entryId: id, startTs: Date.now()
    }))
  }

  async function handleStop() {
    if (!activeEntryId) return
    await stopTimeTracking(activeEntryId)
    setActiveEntryId(null)
    localStorage.removeItem(`time_tracking_${task.id}`)
    const updated = await getTimeEntries(task.id)
    setEntries(updated)
  }

  const totalSecs = entries.reduce((sum, e) => sum + e.duration_secs, 0)

  return (
    <div className="border-t border-[var(--color-border-light)] pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs text-[var(--color-text-tertiary)]">时间追踪</h4>
        <span className="text-xs text-[var(--color-text-tertiary)]">
          累计：{formatDuration(totalSecs)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {activeEntryId ? (
          <button onClick={handleStop} className="flex items-center gap-2 px-3 py-1.5 bg-red-500 text-white rounded text-sm">
            <span className="w-2 h-2 bg-white rounded-sm" />
            停止 {formatDuration(elapsed)}
          </button>
        ) : (
          <button onClick={handleStart} className="flex items-center gap-2 px-3 py-1.5 bg-green-500 text-white rounded text-sm">
            <span className="w-2 h-2 bg-white rounded-full" />
            开始计时
          </button>
        )}
      </div>
      {/* 历史记录列表 */}
      {entries.length > 0 && (
        <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
          {entries.slice(0, 5).map(e => (
            <div key={e.id} className="text-xs text-[var(--color-text-secondary)] flex justify-between">
              <span>{new Date(e.start_time).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })}</span>
              <span>{formatDuration(e.duration_secs)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}h${m}m`
  if (m > 0) return `${m}m${s}s`
  return `${s}s`
}
```

##### 5. StatsView 新增"时间分布"统计

在 `StatsView.tsx` 新增时间分布图表：
- 按清单分组的本周时间柱状图
- 按天分布的时间热力图
- 本周总计时间

```tsx
// StatsView 新增
const [timeStats, setTimeStats] = useState<Array<{ label: string; seconds: number }>>([])

useEffect(() => {
  getTimeStats('list', weekStart, weekEnd).then(setTimeStats)
}, [tasks])

// 渲染
<div className="bg-[var(--color-surface)] rounded-lg p-4">
  <h3 className="text-sm font-medium mb-3">本周时间分布</h3>
  <div className="space-y-2">
    {timeStats.map(({ label, seconds }) => {
      const maxSecs = Math.max(...timeStats.map(t => t.seconds), 1)
      return (
        <div key={label} className="flex items-center gap-2">
          <span className="text-xs w-20 text-[var(--color-text-secondary)]">{label}</span>
          <div className="flex-1 bg-[var(--color-bg-secondary)] rounded h-4">
            <div
              className="bg-[var(--color-accent)] h-4 rounded"
              style={{ width: `${(seconds / maxSecs) * 100}%` }}
            />
          </div>
          <span className="text-xs w-16 text-right">{formatDuration(seconds)}</span>
        </div>
      )
    })}
  </div>
</div>
```

**验收**：
- ✅ 任务详情面板有"开始计时"按钮
- ✅ 计时中显示实时时长，停止后写入数据库
- ✅ 刷新页面后计时状态恢复（localStorage）
- ✅ 统计视图显示本周时间分布
- ✅ 可按任务/清单/天查看时间统计

---

#### P12-05：周/月报自动化（P1 | ⭐ GLM 5.2，3h）

**目标**：每周日自动生成周报并归档；月度趋势图（完成任务数、逾期数、专注时长、习惯完成率）。

**现状分析**：
- 已有 `weeklyReport` AI 技能，但需手动触发
- 统计视图有今日完成率、本周完成趋势，但无历史归档
- 无月度趋势图

**实现步骤**:

##### 1. 后端：新增 `reports` 表

```rust
// db.rs 新增
conn.execute_batch("
    CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,  -- 'weekly' | 'monthly'
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        content TEXT NOT NULL,  -- markdown 格式
        stats_json TEXT,  -- 结构化统计数据
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(type, period_start)
    );
")?;
```

##### 2. 后端：新增 `report_commands.rs`

```rust
#[tauri::command]
pub fn save_report(type_: String, period_start: String, period_end: String, content: String, stats_json: Option<String>, state: State<DbState>) -> Result<i64, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT OR REPLACE INTO reports (type, period_start, period_end, content, stats_json) VALUES (?, ?, ?, ?, ?)",
        rusqlite::params![type_, period_start, period_end, content, stats_json],
    ).map_err(|e| e.to_string())?;
    Ok(db.last_insert_rowid())
}

#[tauri::command]
pub fn get_reports(type_: Option<String>, limit: Option<i64>, state: State<DbState>) -> Result<Vec<ReportRecord>, String> {
    // 查询历史报告
}

#[tauri::command]
pub fn get_report(id: i64, state: State<DbState>) -> Result<ReportRecord, String> {
    // 查询单条
}
```

##### 3. 前端：定时生成周报

在 `useAppInit.ts` 中新增周日 21:00 自动生成检查：

```tsx
// useAppInit.ts 新增
useEffect(() => {
  function checkWeeklyReport() {
    const now = new Date()
    // 周日 21:00 检查
    if (now.getDay() !== 0 || now.getHours() !== 21) return

    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - 6)
    const key = `weekly_report_${weekStart.toISOString().slice(0, 10)}`
    if (localStorage.getItem(key)) return  // 已生成过

    // 触发生成
    generateWeeklyReport()
    localStorage.setItem(key, '1')
  }

  const timer = setInterval(checkWeeklyReport, 60 * 60 * 1000)  // 每小时检查
  checkWeeklyReport()  // 启动时检查一次
  return () => clearInterval(timer)
}, [])
```

##### 4. 前端：月度趋势图

在 `StatsView.tsx` 新增月度趋势区块，使用 recharts（已安装）：

```tsx
// 月度趋势图：最近 6 个月
const monthlyTrend = useMemo(() => {
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - (5 - i))
    return { year: d.getFullYear(), month: d.getMonth(), label: `${d.getMonth() + 1}月` }
  })

  return months.map(m => {
    const completed = tasks.filter(t => {
      if (!t.completed || !t.updated_at) return false
      const d = new Date(t.updated_at)
      return d.getFullYear() === m.year && d.getMonth() === m.month
    }).length
    const overdue = tasks.filter(t => {
      if (!t.due_date || t.completed) return false
      const d = new Date(t.due_date)
      return d.getFullYear() === m.year && d.getMonth() === m.month && d < new Date()
    }).length
    return { label: m.label, completed, overdue }
  })
}, [tasks])

// 渲染
<LineChart data={monthlyTrend} width={500} height={200}>
  <CartesianGrid strokeDasharray="3 3" />
  <XAxis dataKey="label" />
  <YAxis />
  <Tooltip />
  <Legend />
  <Line type="monotone" dataKey="completed" stroke="#10b981" name="已完成" />
  <Line type="monotone" dataKey="overdue" stroke="#ef4444" name="逾期" />
</LineChart>
```

##### 5. 新增"历史报告"视图

在 Sidebar 的 ViewSwitcher 下新增"报告归档"入口（或放在 StatsView 的 tab 中）：
- 按时间倒序列出所有周报/月报
- 点击查看 markdown 渲染
- 支持手动生成本周/本月报告

**验收**：
- ✅ 周日 21:00 自动生成周报并归档到数据库
- ✅ 统计视图显示月度趋势图（完成/逾期）
- ✅ 可查看历史报告列表
- ✅ 支持手动触发周报生成

---

#### P12-06：目标/OKR 管理（P1 | ⭐ V4 Pro，5h）

**目标**：新增"目标"实体（季度目标/年度目标），关联多个任务，显示完成进度。

**实现步骤**：

##### 1. 后端：新增 `goals` 表

```rust
// db.rs 新增
conn.execute_batch("
    CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL DEFAULT 'quarterly',  -- 'annual' | 'quarterly' | 'monthly'
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'completed' | 'archived'
        color TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS goal_tasks (
        goal_id INTEGER NOT NULL,
        task_id INTEGER NOT NULL,
        PRIMARY KEY (goal_id, task_id),
        FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_goal_tasks_goal ON goal_tasks(goal_id);
    CREATE INDEX IF NOT EXISTS idx_goal_tasks_task ON goal_tasks(task_id);
")?;
```

##### 2. 后端：新增 `goal_commands.rs`

```rust
#[tauri::command]
pub fn get_goals(status: Option<String>, state: State<DbState>) -> Result<Vec<Goal>, String>

#[tauri::command]
pub fn create_goal(title: String, description: Option<String>, type_: String, period_start: String, period_end: String, color: Option<String>, state: State<DbState>) -> Result<i64, String>

#[tauri::command]
pub fn update_goal(id: i64, updates: GoalUpdate, state: State<DbState>) -> Result<(), String>

#[tauri::command]
pub fn delete_goal(id: i64, state: State<DbState>) -> Result<(), String>

#[tauri::command]
pub fn link_task_to_goal(goal_id: i64, task_id: i64, state: State<DbState>) -> Result<(), String>

#[tauri::command]
pub fn unlink_task_from_goal(goal_id: i64, task_id: i64, state: State<DbState>) -> Result<(), String>

#[tauri::command]
pub fn get_goal_progress(goal_id: i64, state: State<DbState>) -> Result<GoalProgress, String>
// 返回 { total_tasks, completed_tasks, progress_percent }
```

##### 3. 前端：新增 `GoalView.tsx`

```tsx
export function GoalView() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)

  // 目标列表
  // 每个目标卡片显示：
  //   - 标题 + 类型标签（季度/年度）
  //   - 进度条（关联任务完成率）
  //   - 关联任务数
  //   - 剩余天数
  //   - 操作：编辑 / 归档 / 删除

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[var(--color-bg-secondary)]">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-medium">目标管理</h1>
        <button onClick={() => setShowCreateForm(true)} className="px-3 py-1.5 bg-[var(--color-accent)] text-white rounded text-sm">
          + 新建目标
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {goals.map(goal => (
          <GoalCard key={goal.id} goal={goal} onEdit={...} onArchive={...} />
        ))}
      </div>

      {showCreateForm && <GoalEditor onClose={...} onSave={...} />}
    </div>
  )
}
```

##### 4. GoalCard 组件

```tsx
function GoalCard({ goal }: { goal: Goal }) {
  const [progress, setProgress] = useState<GoalProgress>({ total: 0, completed: 0, percent: 0 })

  useEffect(() => {
    getGoalProgress(goal.id).then(setProgress)
  }, [goal.id])

  return (
    <div className="bg-[var(--color-surface)] rounded-lg p-4 border border-[var(--color-border-light)]">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-medium">{goal.title}</h3>
          <span className="text-xs text-[var(--color-text-tertiary)]">
            {goal.type === 'annual' ? '年度' : goal.type === 'quarterly' ? '季度' : '月度'} ·
            {new Date(goal.period_end).toLocaleDateString('zh-CN')}
          </span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded ${goal.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
          {goal.status === 'active' ? '进行中' : '已归档'}
        </span>
      </div>

      <p className="text-sm text-[var(--color-text-secondary)] mb-3">{goal.description}</p>

      {/* 进度条 */}
      <div className="mb-2">
        <div className="flex justify-between text-xs mb-1">
          <span>进度</span>
          <span>{progress.completed}/{progress.total} · {progress.percent}%</span>
        </div>
        <div className="bg-[var(--color-bg-secondary)] rounded-full h-2">
          <div
            className="bg-[var(--color-accent)] h-2 rounded-full transition-all"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2 mt-3">
        <button className="text-xs text-[var(--color-accent)]">查看任务</button>
        <button className="text-xs text-[var(--color-text-tertiary)]">编辑</button>
      </div>
    </div>
  )
}
```

##### 5. 任务详情新增"关联目标"选择器

在 `TaskMetaPanel.tsx` 新增目标选择器：
- 可将当前任务关联到一个或多个目标
- 显示当前关联的目标

##### 6. Sidebar 新增"目标"入口

在 `ViewSwitcher.tsx` 新增 `goals` 视图：

```tsx
type ViewType = 'tasks' | 'calendar' | 'stats' | 'settings' | 'ai' | 'quadrant' | 'pomodoro' | 'habit' | 'template' | 'goals'
```

**验收**：
- ✅ 可创建/编辑/删除目标（季度/年度/月度）
- ✅ 可将任务关联到目标
- ✅ 目标卡片显示进度条（已完成/总数）
- ✅ Sidebar 新增"目标"入口
- ✅ 任务详情可查看/修改关联目标

---

### 方向 D：架构与性能

---

#### P12-07：性能数据化（Web Vitals + 操作耗时面板）（P2 | ⭐ GLM 5.2，3h）

**目标**：记录关键操作耗时，设置面板显示性能数据，支持持续监控性能回归。

**实现步骤**：

##### 1. 新增 `src/utils/perfMonitor.ts`

```ts
type PerfRecord = {
  name: string
  duration: number
  timestamp: number
}

const PERF_KEY = 'perf_records'
const MAX_RECORDS = 200

export function recordPerf(name: string, duration: number) {
  const records = getPerfRecords()
  records.push({ name, duration, timestamp: Date.now() })
  if (records.length > MAX_RECORDS) {
    records.splice(0, records.length - MAX_RECORDS)
  }
  localStorage.setItem(PERF_KEY, JSON.stringify(records))
}

export function getPerfRecords(): PerfRecord[] {
  try {
    return JSON.parse(localStorage.getItem(PERF_KEY) || '[]')
  } catch {
    return []
  }
}

export function clearPerfRecords() {
  localStorage.removeItem(PERF_KEY)
}

/** 测量函数执行时间 */
export async function measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now()
  try {
    return await fn()
  } finally {
    const duration = performance.now() - start
    recordPerf(name, duration)
  }
}

/** 测量同步函数执行时间 */
export function measure<T>(name: string, fn: () => T): T {
  const start = performance.now()
  try {
    return fn()
  } finally {
    const duration = performance.now() - start
    recordPerf(name, duration)
  }
}

/** 获取性能统计 */
export function getPerfStats(): Array<{ name: string; count: number; avg: number; max: number; last: number }> {
  const records = getPerfRecords()
  const grouped = new Map<string, number[]>()

  for (const r of records) {
    if (!grouped.has(r.name)) grouped.set(r.name, [])
    grouped.get(r.name)!.push(r.duration)
  }

  return Array.from(grouped.entries()).map(([name, durations]) => ({
    name,
    count: durations.length,
    avg: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
    max: Math.round(Math.max(...durations)),
    last: Math.round(durations[durations.length - 1]),
  })).sort((a, b) => b.avg - a.avg)
}
```

##### 2. 在关键操作中埋点

```ts
// taskStore.ts
loadTasks: async () => {
  return measureAsync('loadTasks', async () => {
    const tasks = await api.getTasks()
    set({ tasks })
  })
}

// useAppInit.ts
Promise.all([
  measureAsync('loadTasks', () => useTaskStore.getState().loadTasks()),
  measureAsync('loadLists', () => useListStore.getState().loadLists()),
  measureAsync('loadTags', () => useTagStore.getState().loadTags()),
])

// TaskItem 渲染（抽样）
// 在 TaskItem 的 React.memo 比较函数中记录耗时
```

##### 3. 设置面板新增"性能监控"

```tsx
// PerfPanel.tsx
export function PerfPanel() {
  const [stats, setStats] = useState(getPerfStats())

  function handleClear() {
    clearPerfRecords()
    setStats([])
  }

  function handleRefresh() {
    setStats(getPerfStats())
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">性能监控</h3>
        <div className="flex gap-2">
          <button onClick={handleRefresh} className="text-xs px-2 py-1 border rounded">刷新</button>
          <button onClick={handleClear} className="text-xs px-2 py-1 border rounded text-red-500">清空</button>
        </div>
      </div>

      {stats.length === 0 ? (
        <p className="text-sm text-[var(--color-text-tertiary)]">暂无性能数据</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--color-text-tertiary)] border-b">
              <th className="py-2">操作</th>
              <th className="text-right">次数</th>
              <th className="text-right">平均</th>
              <th className="text-right">最大</th>
              <th className="text-right">最近</th>
            </tr>
          </thead>
          <tbody>
            {stats.map(s => (
              <tr key={s.name} className="border-b border-[var(--color-border-light)]">
                <td className="py-2 font-mono text-xs">{s.name}</td>
                <td className="text-right">{s.count}</td>
                <td className="text-right">{s.avg}ms</td>
                <td className="text-right text-orange-500">{s.max}ms</td>
                <td className="text-right">{s.last}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-4 text-xs text-[var(--color-text-tertiary)]">
        <p>数据保存在 localStorage，最多保留 200 条记录。</p>
        <p>持续使用后可发现性能回归趋势。</p>
      </div>
    </div>
  )
}
```

##### 4. 在 SettingsView 新增"性能"tab

```tsx
// SettingsView.tsx 新增 tab
{ id: 'perf', label: '性能监控', component: <PerfPanel /> }
```

##### 5. （可选）Web Vitals 监控

```ts
// main.tsx 新增
import { getCLS, getFID, getLCP } from 'web-vitals'

getCLS(metric => recordPerf('CLS', metric.value * 1000))
getFID(metric => recordPerf('FID', metric.value))
getLCP(metric => recordPerf('LCP', metric.value))
```

需要安装：`npm install web-vitals`

**验收**：
- ✅ 关键操作（loadTasks/loadLists/loadTags）有耗时记录
- ✅ 设置面板显示性能数据表格
- ✅ 可刷新/清空数据
- ✅ 数据持久化到 localStorage

---

## 三、验收检查清单

| # | 任务 | 验收要点 | 检查命令 |
|---|---|---|---|
| P12-01 | 窗口自适应 | 480px 窗口可用 | 手动缩放窗口 |
| P12-02 | AI 自动排程 | 输入"安排明天"触发排程 | 手动测试 |
| P12-03 | 任务关联推荐 | 详情面板显示相关任务 | 手动测试 |
| P12-04 | 时间追踪 | 开始/停止计时 + 统计 | 手动测试 |
| P12-05 | 周/月报自动化 | 月度趋势图 + 历史报告 | 手动测试 |
| P12-06 | 目标管理 | 创建目标 + 关联任务 + 进度条 | 手动测试 |
| P12-07 | 性能监控面板 | 设置面板显示性能数据 | 手动测试 |

**全局检查**：
- `cargo check` ✅
- `npx tsc --noEmit` ✅
- `npm run test` 全部通过 ✅
- 无新增 lint error

---

## 四、给 Workbuddy 的执行建议

```
Phase 12 共 7 个任务，约 31h。建议按以下顺序执行：

1. P12-01 窗口自适应（5h）— 基础体验，先完成
2. P12-04 时间追踪（5h）— 后端独立，前端清晰
3. P12-07 性能监控（3h）— 独立模块，可并行
4. P12-05 周月报自动化（3h）— 依赖已有 AI 技能
5. P12-02 AI 自动排程（6h）— 核心差异化功能
6. P12-03 任务关联推荐（4h）— AI 辅助功能
7. P12-06 目标管理（5h）— 独立模块，最后做

每个任务完成后运行 cargo check + tsc + 单元测试。
全部完成后打 tag v1.33.0。
```

---

## 五、Phase 12 对项目的价值

| 维度 | 改进前（v1.32.0） | 改进后（v1.33.0） | 价值 |
|---|---|---|---|
| **窗口适配** | 最小 900px，窄屏不可用 | 最小 480px，抽屉化侧边栏 | 移动端铺路 |
| **AI 能力** | 摘要/周报/拆解 | + 自动排程 + 关联推荐 | 从助手变秘书 |
| **时间管理** | 番茄钟专注时长 | + 任务级时间追踪 + 月度趋势 | 知道时间花在哪 |
| **目标管理** | 只有任务/清单 | + 季度/年度目标 + 进度追踪 | 从任务管理到目标管理 |
| **性能可观测** | 无数据 | 设置面板显示操作耗时 | 持续监控性能回归 |
| **周报自动化** | 手动触发 | 周日自动生成 + 历史归档 | 低成本长期复盘 |
