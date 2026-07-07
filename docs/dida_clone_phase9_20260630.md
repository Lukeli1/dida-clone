# 滴答清单复刻 — Phase 9 优化改进文档

**项目路径**：`C:\Users\50441\Documents\trae开发\滴答清单复刻`
**当前版本**：v1.29.0
**目标版本**：v1.30.0
**文档生成**：2026-06-30
**聚焦方向**：功能模块开发及优化 · 整体 UI/UX 优化 · 架构优化

---

## 一、Phase 9 定位

### 当前项目状态（v1.29.0）

经过 8 个 Phase 的迭代，项目已具备：

- ✅ 完整的任务管理（CRUD + 子任务 + 优先级 + 日期 + 标签 + 清单）
- ✅ 日历视图（月/周/日/甘特/看板 + 拖拽）
- ✅ AI 助手（10 个预设技能 + 流式对话 + 半自动操作）
- ✅ 四象限 / 番茄钟 / 习惯打卡 / 统计面板
- ✅ 主题系统（6 套预设 + 自定义强调色 + 深色模式）
- ✅ Git 数据同步 + 数据导出导入
- ✅ 架构基本健康（大文件已拆分、测试 189 个通过）

### Phase 9 核心方向

| 方向          | 内容                                   | 优先级 |
| ------------- | -------------------------------------- | ------ |
| 🆕 功能模块   | 任务模板系统、习惯统计图表、日历时间轴 | P0     |
| 🎨 UI/UX 优化 | 新用户引导教程、通知中心面板           | P1     |
| 🏗️ 架构优化   | E2E 测试框架、虚拟列表性能调优         | P2     |

---

## 二、任务清单

### 方向 A：功能模块开发（4 个任务）

| ID    | 内容                                           | 优先级 | 工作量 | 执行者           |
| ----- | ---------------------------------------------- | ------ | ------ | ---------------- |
| P9-01 | 任务模板系统（创建/应用/管理模板）             | P0     | 5h     | Trae GLM 5.2     |
| P9-02 | 习惯周/月统计图表（recharts 柱状图+热力图）    | P0     | 4h     | Trae GLM 5.2     |
| P9-03 | 周/日视图时间轴优化（小时刻度 + 当前时间红线） | P1     | 3h     | Workbuddy V4 Pro |
| P9-04 | 任务附件支持（上传图片/文件，本地存储）        | P2     | 4h     | Trae GLM 5.2     |

### 方向 B：UI/UX 优化（3 个任务）

| ID    | 内容                                              | 优先级 | 工作量 | 执行者           |
| ----- | ------------------------------------------------- | ------ | ------ | ---------------- |
| P9-05 | 新用户引导教程（react-joyride，5 步核心功能引导） | P1     | 3h     | Workbuddy V4 Pro |
| P9-06 | 通知中心面板（提醒历史 + 提前量自定义）           | P1     | 3h     | Workbuddy V4 Pro |
| P9-07 | 快捷键自定义面板（设置页新增分类）                | P2     | 2h     | Flash            |

### 方向 C：架构优化（2 个任务）

| ID    | 内容                                                      | 优先级 | 工作量 | 执行者           |
| ----- | --------------------------------------------------------- | ------ | ------ | ---------------- |
| P9-08 | E2E 测试框架（Playwright，5 个核心流程测试）              | P2     | 4h     | Workbuddy V4 Pro |
| P9-09 | 性能调优（虚拟列表 `estimateSize` 调优 + 大列表分页加载） | P2     | 2h     | Flash            |

**总计**：9 个任务，~30h，分 4 批执行

---

## 三、详细操作步骤

---

### 方向 A-1：任务模板系统（P9-01，P0，5h）

#### 功能描述

用户可以创建任务模板（含标题、备注、优先级、子任务），在任务列表一键从模板快速创建任务。解决重复创建相似任务的高效需求。

#### 后端实现

**Step 1**：新建 `src-tauri/src/commands/template_commands.rs`

```rust
use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use chrono::Local;

#[derive(Debug, Serialize, Deserialize)]
pub struct TaskTemplate {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub title_template: String,
    pub notes_template: Option<String>,
    pub priority: i32,
    pub reminder_minutes: Option<i32>,
    pub subtask_templates: Vec<SubtaskTemplate>,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SubtaskTemplate {
    pub id: i64,
    pub template_id: i64,
    pub title: String,
    pub sort_order: i32,
}

#[tauri::command]
pub fn create_template(conn: tauri::State<Mutex<Connection>>, req: CreateTemplateRequest) -> Result<TaskTemplate> {
    // 插入 templates 表，然后插入 subtask_templates
}

#[tauri::command]
pub fn get_templates(conn: tauri::State<Mutex<Connection>>) -> Result<Vec<TaskTemplate>> {
    // 查询所有模板（含子任务模板）
}

#[tauri::command]
pub fn update_template(conn: tauri::State<Mutex<Connection>>, req: UpdateTemplateRequest) -> Result<TaskTemplate> {
    // 更新模板 + 替换子任务模板
}

#[tauri::command]
pub fn delete_template(conn: tauri::State<Mutex<Connection>>, id: i64) -> Result<()> {
    // 删除模板（级联删除子任务模板）
}

#[tauri::command]
pub fn apply_template(conn: tauri::State<Mutex<Connection>>, template_id: i64, list_id: i64) -> Result<Task> {
    // 根据模板创建任务（含子任务），返回创建的任务
}
```

**Step 2**：在 `src-tauri/src/db.rs` 的 `init_db` 函数中添加表创建：

```sql
CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    title_template TEXT NOT NULL,
    notes_template TEXT,
    priority INTEGER DEFAULT 0,
    reminder_minutes INTEGER,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subtask_templates (
    id INTEGER PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_subtask_templates_template_id ON subtask_templates(template_id);
```

**Step 3**：在 `src-tauri/src/commands/mod.rs` 中注册 `template_commands` 模块，并在 `lib.rs` 中注册 Tauri 命令。

#### 前端实现

**Step 4**：新建 `src/api/templateApi.ts`

```typescript
import { invoke } from '@tauri-apps/api/core'
import type { TaskTemplate, CreateTemplateRequest, UpdateTemplateRequest } from '../types/template'

export const templateApi = {
  getTemplates: () => invoke<TaskTemplate[]>('get_templates'),
  createTemplate: (req: CreateTemplateRequest) => invoke<TaskTemplate>('create_template', { req }),
  updateTemplate: (req: UpdateTemplateRequest) => invoke<TaskTemplate>('update_template', { req }),
  deleteTemplate: (id: number) => invoke('delete_template', { id }),
  applyTemplate: (templateId: number, listId: number) => invoke('apply_template', { templateId, listId }),
}
```

**Step 5**：新建 `src/types/template.ts`

```typescript
export interface TaskTemplate {
  id: number
  name: string
  description?: string
  icon?: string
  title_template: string
  notes_template?: string
  priority: number
  reminder_minutes?: number
  subtask_templates: SubtaskTemplate[]
  sort_order: number
  created_at: string
  updated_at: string
}

export interface SubtaskTemplate {
  id: number
  template_id: number
  title: string
  sort_order: number
}

export interface CreateTemplateRequest {
  name: string
  description?: string
  icon?: string
  title_template: string
  notes_template?: string
  priority?: number
  reminder_minutes?: number
  subtask_templates: Omit<SubtaskTemplate, 'id' | 'template_id'>[]
}

export interface UpdateTemplateRequest {
  id: number
  name?: string
  description?: string
  icon?: string
  title_template?: string
  notes_template?: string
  priority?: number
  reminder_minutes?: number
  subtask_templates?: Omit<SubtaskTemplate, 'id' | 'template_id'>[]
}
```

**Step 6**：新建 `src/components/template/TemplateView.tsx`

- 模板列表（网格卡片展示，含 icon + name + description）
- 每个卡片有"应用"按钮，点击后调用 `templateApi.applyTemplate`
- 顶部有"新建模板"按钮，弹出 `TemplateEditor.tsx`

**Step 7**：新建 `src/components/template/TemplateEditor.tsx`

- 表单：名称、描述、图标（emoji picker）、标题模板、备注模板、优先级、提醒提前量
- 子任务模板列表（可添加/删除/排序）
- 保存/取消按钮

**Step 8**：在 `TaskInputBar.tsx` 中添加"从模板创建"按钮（闪电图标旁），点击弹出模板选择下拉。

**Step 9**：在 `Sidebar.tsx` 的视图切换区域添加"模板"入口（在"习惯"下方）。

#### 验收标准

- [ ] 可以创建/编辑/删除任务模板（含子任务模板）
- [ ] 模板列表以卡片网格展示，显示 icon + name + description
- [ ] 点击"应用"按钮，根据模板创建任务（含子任务），任务出现在当前清单
- [ ] 任务输入栏有"从模板创建"入口，点击弹出模板选择
- [ ] Sidebar 有"模板"视图切换入口
- [ ] `cargo check` 通过，`npm run build` 通过

---

### 方向 A-2：习惯周/月统计图表（P9-02，P0，4h）

#### 功能描述

当前 `HabitStats.tsx` 只显示简单的文字统计（连续打卡天数、总打卡天数）。需要增加：

1. 周视图：最近 7 天打卡柱状图
2. 月视图：当月打卡日历热力图
3. 趋势图：最近 30 天打卡率折线图

#### 实现步骤

**Step 1**：安装 `recharts`（轻量图表库，MIT 协议）

```bash
npm install recharts
```

**Step 2**：修改 `src/components/habit/HabitStats.tsx`

在现有统计信息下方，新增三个图表区域（用 Tabs 切换"周/月/趋势"）：

```tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, CalendarHeatmap } from 'recharts'

function HabitStats({ habit, records }: { habit: Habit; records: Record<string, number> }) {
  const [chartView, setChartView] = useState<'week' | 'month' | 'trend'>('week')

  // 周数据：最近 7 天
  const weekData = useMemo(() => {
    const today = new Date()
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() - (6 - i))
      const key = dateKey(d)
      return { date: `${d.getMonth() + 1}/${d.getDate()}`, count: records[key] || 0 }
    })
  }, [records])

  // 月数据：当月每天
  const monthData = useMemo(() => {
    /* 生成当月日期数组 + records 映射 */
  }, [records, habit])

  // 趋势数据：最近 30 天打卡率
  const trendData = useMemo(() => {
    /* 计算每天是否打卡，生成 0/1 数组 */
  }, [records])

  return (
    <div className="space-y-4">
      {/* 切换 Tabs */}
      <div className="flex gap-2">
        {['week', 'month', 'trend'].map((v) => (
          <button
            key={v}
            onClick={() => setChartView(v as any)}
            className={`px-3 py-1 rounded-lg text-xs ${chartView === v ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-bg-secondary)]'}`}
          >
            {v === 'week' ? '本周' : v === 'month' ? '本月' : '趋势'}
          </button>
        ))}
      </div>

      {/* 周视图：柱状图 */}
      {chartView === 'week' && (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={weekData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* 月视图：日历热力图（用 CSS Grid 实现，不用 recharts 的 CalendarHeatmap，更灵活）*/}
      {chartView === 'month' && <MonthHeatmap records={records} />}

      {/* 趋势视图：折线图 */}
      {chartView === 'trend' && <TrendChart data={trendData} />}
    </div>
  )
}
```

**Step 3**：新建 `src/components/habit/MonthHeatmap.tsx`

用 CSS Grid 实现月历热力图（类似 GitHub Contributions 图）：

- 每个日期格子根据打卡次数显示不同深浅的颜色
- 颜色从 `theme.accent` 的浅色到深色渐变
- 显示当月打卡天数和打卡率

**Step 4**：新建 `src/components/habit/TrendChart.tsx`

用 `recharts` 的 `LineChart` 展示最近 30 天打卡趋势：

- X 轴：日期
- Y 轴：打卡次数
- 增加 7 天移动平均线

**Step 5**：在 `HabitCard.tsx` 中展开区域集成 `HabitStats`。

#### 验收标准

- [ ] 习惯卡片展开后显示统计区域
- [ ] 周视图：最近 7 天打卡柱状图，数据正确
- [ ] 月视图：当月日历热力图，颜色深浅反映打卡次数
- [ ] 趋势视图：30 天打卡折线图 + 移动平均线
- [ ] 图表适配深色模式（文字颜色 `dark:text-gray-200`）
- [ ] `npm run build` 通过

---

### 方向 A-3：周/日视图时间轴优化（P9-03，P1，3h）

#### 功能描述

当前 `WeekView.tsx` 和 `DayView.tsx` 的任务块按时段显示，但缺少：

1. 左侧小时时间轴刻度（8:00-22:00）
2. 当前时间红线（实时更新，指示现在时刻）
3. 时间格高度统一（当前动态计算可能不一致）

#### 实现步骤

**Step 1**：修改 `src/components/calendar/WeekView.tsx`

在顶部添加小时刻度列：

```tsx
{
  /* 左侧时间轴 */
}
;<div className="w-16 flex-shrink-0 border-r border-[var(--color-border-light)]">
  {HOURS.map((h) => (
    <div key={h} className="h-16 flex items-start justify-end pr-2 text-xs text-[var(--color-text-tertiary)]">
      {h}:00
    </div>
  ))}
</div>
```

其中 `HOURS = [8, 9, ..., 22]`（可根据习惯调整范围）。

**Step 2**：在 `WeekView.tsx` 中添加当前时间红线：

```tsx
{
  /* 当前时间红线 */
}
{
  isToday && (
    <div
      className="absolute left-0 right-0 z-20 pointer-events-none"
      style={{ top: `${currentMinutesFromMidnight / 4}px` }} // 每小时 60px / 4 = 15px per 15min
    >
      <div className="flex items-center">
        <div className="w-16 pr-2 flex justify-end">
          <div className="w-2 h-2 rounded-full bg-red-500" />
        </div>
        <div className="flex-1 border-t-2 border-red-500" />
      </div>
    </div>
  )
}
```

`currentMinutesFromMidnight` 通过 `new Date().getHours() * 60 + new Date().getMinutes()` 计算，并通过 `setInterval` 每分钟更新。

**Step 3**：类似修改 `src/components/calendar/DayView.tsx`（如果还没有时间轴）。

**Step 4**：修改 `src/components/calendar/DayViewGrid.tsx`，确保时间格高度统一为 `64px`（1 小时），任务块高度按 `duration / 60 * 64px` 计算。

#### 验收标准

- [ ] 周视图左侧显示小时刻度（8:00-22:00）
- [ ] 当前时间红线实时更新（每分钟刷新位置）
- [ ] 红线只在"今天"的列显示
- [ ] 日视图同样有时间轴和当前时间红线
- [ ] 时间格高度统一，任务块高度正确按比例计算
- [ ] 红线在深色模式下颜色为 `red-400`（保持可见）

---

### 方向 A-4：任务附件支持（P9-04，P2，4h）

#### 功能描述

用户可以为任务添加附件（图片、文档等），附件以文件形式存储在本地数据目录下，任务详情中可预览图片、点击打开其他文件。

#### 实现步骤

**Step 1**：在 `src-tauri/src/db.rs` 中新建 `attachments` 表：

```sql
CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attachments_task_id ON attachments(task_id);
```

**Step 2**：新建 `src-tauri/src/commands/attachment_commands.rs`，实现：

- `add_attachment(task_id, file_path)`: 将文件复制到应用数据目录，记录到数据库
- `get_attachments(task_id)`: 获取任务的所有附件
- `delete_attachment(attachment_id)`: 删除数据库记录 + 删除文件
- `open_attachment(attachment_id)`: 调用系统默认程序打开文件（使用 `open` crate）

**Step 3**：安装 Rust 依赖 `open = "5"`（用于打开文件）。

**Step 4**：前端新建 `src/api/attachmentApi.ts`。

**Step 5**：在 `TaskDetail.tsx` 的备注区域下方添加附件区域：

- 显示附件列表（文件名 + 大小 + 图标）
- "添加附件"按钮（调用 `tauri-plugin-dialog` 选择文件）
- 点击附件预览（图片 inline 预览）或打开（其他文件）

#### 验收标准

- [ ] 可以为任务添加附件（图片/文档）
- [ ] 附件显示在任务详情中，显示文件名和大小
- [ ] 图片附件可 inline 预览（缩略图）
- [ ] 点击附件调用系统程序打开
- [ ] 删除任务时自动删除其附件文件
- [ ] `cargo check` 通过

---

### 方向 B-1：新用户引导教程（P9-05，P1，3h）

#### 功能描述

首次启动应用时，自动弹出引导教程，分 5 步介绍核心功能：

1. 创建任务
2. 设置日期和优先级
3. 管理清单和标签
4. 使用日历视图
5. 试用 AI 助手

#### 实现步骤

**Step 1**：安装 `react-joyride`（轻量引导库）

```bash
npm install react-joyride
```

**Step 2**：新建 `src/components/OnboardingTour.tsx`

```tsx
import Joyride, { Step } from 'react-joyride'

const TOUR_STEPS: Step[] = [
  {
    target: '.task-input-bar',
    content: '在这里输入任务标题，按 Enter 创建。试试输入"明天下午3点开会"！',
    title: '创建任务',
  },
  {
    target: '.sidebar-lists',
    content: '这里是你的清单列表。点击 + 创建新清单，用不同清单分类任务。',
    title: '管理清单',
  },
  {
    target: '.calendar-nav',
    content: '切换到日历视图，可视化你的任务安排。支持拖拽调整日期！',
    title: '日历视图',
  },
  {
    target: '.ai-assistant-btn',
    content: '点击这里唤醒 AI 助手，可以帮你总结任务、生成周报、智能排序！',
    title: 'AI 助手',
  },
  {
    target: '.settings-btn',
    content: '在这里可以切换主题、配置 AI、设置开机自启等。',
    title: '设置',
  },
]

export function OnboardingTour() {
  const [run, setRun] = useState(false)

  useEffect(() => {
    const seen = localStorage.getItem('onboarding_seen')
    if (!seen) setRun(true)
  }, [])

  return (
    <Joyride
      steps={TOUR_STEPS}
      run={run}
      continuous
      showSkipButton
      locale={{ last: '完成', skip: '跳过' }}
      styles={{ options: { zIndex: 10000 } }}
      callback={(data) => {
        if (data.status === 'finished' || data.status === 'skipped') {
          localStorage.setItem('onboarding_seen', 'true')
          setRun(false)
        }
      }}
    />
  )
}
```

**Step 3**：在 `App.tsx` 中引入 `<OnboardingTour />`。

**Step 4**：为需要引导的元素添加对应的 className（如果还没有）：

- 任务输入栏：`.task-input-bar`
- 清单区域：`.sidebar-lists`
- 日历导航：`.calendar-nav`
- AI 按钮：`.ai-assistant-btn`
- 设置按钮：`.settings-btn`

**Step 5**：在 `SidebarFooter.tsx` 中添加"引导教程"菜单项，点击后清除 `localStorage` 的 `onboarding_seen` 并重新触发教程。

#### 验收标准

- [ ] 首次启动应用自动弹出引导教程（5 步）
- [ ] 每一步高亮对应 UI 元素，有"上一步/下一步/跳过/完成"按钮
- [ ] 完成或跳过教程后不再自动弹出
- [ ] Sidebar 底部有"引导教程"入口，可重新触发
- [ ] 引导弹出层 z-index 正确（不会被模态框遮挡）
- [ ] 深色模式下引导弹出层样式正确

---

### 方向 B-2：通知中心面板（P9-06，P1，3h）

#### 功能描述

当前提醒功能依赖系统通知，但用户无法查看提醒历史，也无法自定义提醒提前量（目前可能是固定时间）。需要：

1. 通知中心面板（侧边栏右滑出或弹窗），显示近期提醒历史
2. 任务编辑区增加"提醒提前量"选择器（正点/提前5分钟/15分钟/30分钟/1小时/1天）
3. 提醒触发时，在应用内 Toast 显示（而不仅依赖系统通知）

#### 实现步骤

**Step 1**：在 `src/stores/uiStore.ts` 中添加 `notificationHistory` state（数组，存储近期触发的提醒）。

**Step 2**：在 `src/utils/notification.ts` 中封装通知触发逻辑：

- 检查任务 `reminder` 字段
- 计算提醒时间（`due_date - reminder_minutes`）
- 到达提醒时间时，触发系统通知 + 写入 `notificationHistory`

**Step 3**：新建 `src/components/NotificationCenter.tsx`：

- 从 `uiStore.notificationHistory` 读取数据
- 按日期分组显示
- 点击可跳转到对应任务
- 清空历史按钮

**Step 4**：在 `TaskDetail.tsx` 的提醒设置区域，将简单的开关改为：

- 提醒开关（toggle）
- 提醒提前量选择器（dropdown，选项：正点/提前5分钟/15分钟/30分钟/1小时/1天/自定义分钟数）

对应地，后端 `tasks` 表需要有 `reminder_minutes` 字段（Phase 1 可能已经加了，需要确认）。

**Step 5**：在 TitleBar 右侧添加通知图标按钮（铃铛），点击弹出通知中心面板。

#### 验收标准

- [ ] 任务详情可以设置提醒提前量（不只是开关）
- [ ] 提醒触发时，应用内 Toast + 系统通知同时出现
- [ ] TitleBar 有通知中心入口，点击显示近期提醒历史
- [ ] 提醒历史按日期分组，点击可跳转任务
- [ ] 可以清空提醒历史

---

### 方向 B-3：快捷键自定义面板（P9-07，P2，2h）

#### 功能描述

当前快捷键是硬编码的（Ctrl+N 新建、Ctrl+F 搜索等），用户无法自定义。需要在设置页新增"快捷键"分类，允许用户查看和自定义快捷键。

#### 实现步骤

**Step 1**：在 `src/utils/shortcuts.ts` 中定义默认快捷键映射：

```typescript
export interface ShortcutConfig {
  key: string
  label: string
  defaultKeys: string[] // e.g. ['Ctrl', 'N']
  action: () => void
}

export const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  { key: 'newTask', label: '新建任务', defaultKeys: ['Ctrl', 'N'], action: () => {} },
  { key: 'search', label: '搜索任务', defaultKeys: ['Ctrl', 'F'], action: () => {} },
  // ...
]
```

**Step 2**：在 `src/stores/uiStore.ts` 中添加 `customShortcuts` state（持久化到 localStorage）。

**Step 3**：新建 `src/components/settings/ShortcutsPanel.tsx`：

- 列表展示所有可自定义快捷键
- 点击某个快捷键进入录制模式（监听下次按键）
- 显示冲突检测（如果新快捷键与已有冲突，提示用户）
- 重置为默认按钮

**Step 4**：修改 `src/hooks/useKeyboardShortcuts.ts`，从 store 读取自定义快捷键，而非硬编码。

**Step 5**：在 `SettingsView.tsx` 的左侧导航中添加"快捷键"分类（在"通用"下方）。

#### 验收标准

- [ ] 设置页有"快捷键"分类
- [ ] 列表显示所有可自定义快捷键及当前按键组合
- [ ] 点击可重新录制快捷键
- [ ] 录制时显示冲突检测提示
- [ ] 有"重置为默认"按钮
- [ ] 自定义快捷键实时生效

---

### 方向 C-1：E2E 测试框架（P9-08，P2，4h）

#### 功能描述

使用 Playwright 编写端到端测试，覆盖核心用户流程，防止回归。

#### 实现步骤

**Step 1**：安装 Playwright

```bash
npm init playwright@latest
# 选择：TypeScript、无 GitHub Actions、无示例
```

**Step 2**：配置 `playwright.config.ts`，设置 baseURL 为 `http://localhost:1420`（dev server 地址）。

**Step 3**：编写测试文件 `tests/task-crud.spec.ts`：

```typescript
import { test, expect } from '@playwright/test'

test('创建任务', async ({ page }) => {
  await page.goto('/')
  await page.fill('.task-input-bar input', '测试任务')
  await page.press('.task-input-bar input', 'Enter')
  await expect(page.locator('.task-item')).toContainText('测试任务')
})
```

**Step 4**：编写 5 个核心流程测试：

1. `task-crud.spec.ts`：创建/编辑/删除/完成任务
2. `list-management.spec.ts`：创建/编辑/删除清单
3. `calendar-view.spec.ts`：切换日历视图、拖拽任务
4. `ai-assistant.spec.ts`：打开 AI 助手、发送消息
5. `settings.spec.ts`：切换主题、配置 API

**Step 5**：在 `package.json` 中添加脚本：

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

**Step 6**：在 `.github/workflows/ci.yml` 中添加 E2E 测试步骤（需要在 CI 中启动 `npm run tauri dev` 或使用 `npm run build` + 静态服务器）。

#### 验收标准

- [ ] Playwright 安装并配置完成
- [ ] 5 个 E2E 测试文件编写完成
- [ ] `npm run test:e2e` 可以运行测试
- [ ] 所有测试通过（或在 CI 中通过）
- [ ] README 添加 E2E 测试说明

---

### 方向 C-2：性能调优（P9-09，P2，2h）

#### 功能描述

当前任务列表使用 `@tanstack/react-virtual` 实现虚拟滚动，但在超大列表（1000+ 任务）时可能有性能问题。需要：

1. 调优 `estimateSize` 让滚动更流畅
2. 实现分页加载（每次加载 100 条，滚动到底部加载更多）
3. 优化 `useTaskFiltering` 的性能（避免每次渲染都全量过滤）

#### 实现步骤

**Step 1**：修改 `src/components/TaskList.tsx`，为 `useVirtualizer` 设置更准确的 `estimateSize`：

```typescript
const virtualizer = useVirtualizer({
  count: tasks.length,
  getScrollElement: () => scrollElementRef.current,
  estimateSize: () => 56, // 任务行固定高度 56px（与 CSS 一致）
  overscan: 10, // 预渲染 10 个额外项
})
```

**Step 2**：在 `useTaskFiltering.ts` 中添加 `useMemo` 依赖优化，确保只有相关 state 改变时才重新过滤：

```typescript
const filteredTasks = useMemo(() => {
  // 只在 tasks, selectedListId, selectedTagId, searchQuery, filters 改变时重新计算
  return filterTasks(tasks, { selectedListId, selectedTagId, searchQuery, filters })
}, [tasks, selectedListId, selectedTagId, searchQuery, filters])
```

**Step 3**：实现分页加载（可选，如果虚拟滚动性能已经足够好的话可以跳过）：

- 在 `taskStore.ts` 中添加 `page` 和 `pageSize` state
- `loadTasks` 接受 `page` 参数
- 滚动到底部时 `setPage(page + 1)` 并追加数据

**Step 4**：用 Chrome DevTools Profiler 或 React DevTools Profiler 测试性能，确认优化效果。

#### 验收标准

- [ ] 1000+ 任务时滚动流畅（无掉帧）
- [ ] `useTaskFiltering` 性能优化（用 `performance.now()` 对比优化前后耗时）
- [ ] 虚拟列表 `estimateSize` 准确，滚动条高度正确
- [ ] 如果实现了分页加载，滚动到底部自动加载更多

---

## 四、执行顺序

```
第 1 批（8h）— 核心功能模块
  ① P9-01 任务模板系统（Trae GLM 5.2，5h）
  ② P9-02 习惯统计图表（Trae GLM 5.2，3h）

第 2 批（6h）— 视图优化 + UI/UX
  ③ P9-03 周/日视图时间轴（Workbuddy V4 Pro，3h）
  ④ P9-05 新用户引导教程（Workbuddy V4 Pro，3h）

第 3 批（6h）— 通知 + 快捷键 + 附件
  ⑤ P9-06 通知中心面板（Workbuddy V4 Pro，3h）
  ⑥ P9-07 快捷键自定义（Flash，2h）
  ⑦ P9-04 任务附件支持（Trae GLM 5.2，4h）→ 可调整到第一批

第 4 批（6h）— 架构优化
  ⑧ P9-08 E2E 测试框架（Workbuddy V4 Pro，4h）
  ⑨ P9-09 性能调优（Flash，2h）
```

**建议调整**：P9-04（任务附件）工作量较大（4h），且依赖 Rust 后端编译，建议放在第 2 批或第 3 批。

**优化后执行顺序**（更合理）：

```
第 1 批（8h）
  ① P9-01 任务模板系统（5h）
  ② P9-02 习惯统计图表（3h）

第 2 批（6h）
  ③ P9-03 周/日视图时间轴（3h）
  ④ P9-05 新用户引导教程（3h）

第 3 批（5h）
  ⑤ P9-06 通知中心面板（3h）
  ⑥ P9-07 快捷键自定义（2h）

第 4 批（8h）
  ⑦ P9-04 任务附件支持（4h）
  ⑧ P9-08 E2E 测试框架（4h）

第 5 批（2h）
  ⑨ P9-09 性能调优（2h）
```

---

## 五、给 Workbuddy 的指令

### 第 1 批指令（Trae GLM 5.2 或 Workbuddy V4 Pro）

```
项目路径：C:\Users\50441\Documents\trae开发\滴答清单复刻

执行 Phase 9 第 1 批（2 个功能模块）：

① 任务模板系统（P9-01）：
   - 后端：新建 src-tauri/src/commands/template_commands.rs
     - 实现 create_template / get_templates / update_template / delete_template / apply_template 5 个 Tauri 命令
     - 在 db.rs init_db 中创建 templates 和 subtask_templates 表（含索引）
     - 在 commands/mod.rs 中声明模块，在 lib.rs 中注册命令
   - 前端：
     - 新建 src/api/templateApi.ts
     - 新建 src/types/template.ts
     - 新建 src/components/template/TemplateView.tsx（模板卡片网格 + 应用按钮）
     - 新建 src/components/template/TemplateEditor.tsx（创建/编辑表单）
     - 在 TaskInputBar.tsx 添加"从模板创建"按钮
     - 在 Sidebar.tsx 添加"模板"视图切换
   - 验收：可以创建/应用模板，模板含子任务，Sidebar 有入口

② 习惯周/月统计图表（P9-02）：
   - 安装 recharts：npm install recharts
   - 修改 src/components/habit/HabitStats.tsx：
     - 新增周/月/趋势 3 个 Tab 切换
     - 周视图：BarChart（最近 7 天打卡次数）
     - 月视图：CSS Grid 日历热力图（颜色深浅 = 打卡次数）
     - 趋势视图：LineChart（30 天打卡趋势 + 7 天移动平均）
   - 在 HabitCard.tsx 展开区域集成 HabitStats
   - 验收：3 个图表正确显示，适配深色模式

两个任务都完成后：
git add -A
git commit -m "feat: Phase 9 batch 1 - task templates + habit statistics charts"
不要做其他任务。
```

---

### 第 2 批指令

```
项目路径：C:\Users\50441\Documents\trae开发\滴答清单复刻

执行 Phase 9 第 2 批（2 个 UI/UX 优化）：

③ 周/日视图时间轴优化（P9-03）：
   - 修改 src/components/calendar/WeekView.tsx：
     - 左侧添加小时刻度列（8:00-22:00，w-16，text-xs）
     - 添加当前时间红线（只显示在"今天"列，每分钟更新位置）
     - 用 setInterval 每秒/每分钟更新 currentMinutes state
   - 修改 src/components/calendar/DayView.tsx（如果还没有时间轴，同样添加）
   - 修改 src/components/calendar/DayViewGrid.tsx：
     - 确保时间格高度统一为 64px（1 小时）
     - 任务块高度 = duration_in_minutes / 60 * 64px
   - 验收：时间轴显示正确，红线实时更新，任务块高度正确

④ 新用户引导教程（P9-05）：
   - 安装 react-joyride：npm install react-joyride
   - 新建 src/components/OnboardingTour.tsx：
     - 5 步引导：创建任务 → 管理清单 → 日历视图 → AI 助手 → 设置
     - 首次启动自动弹出（localStorage onboarding_seen 控制）
     - 完成/跳过后将 onboarding_seen 设为 true
   - 在 App.tsx 中引入 <OnboardingTour />
   - 为引导目标元素添加 className（.task-input-bar / .sidebar-lists / .calendar-nav / .ai-assistant-btn / .settings-btn）
   - 在 SidebarFooter.tsx 添加"引导教程"菜单项（清除 onboarding_seen 并重新触发）
   - 验收：首次启动有引导，可重新触发，样式适配深色模式

两个任务都完成后：
git add -A
git commit -m "feat: Phase 9 batch 2 - calendar time axis + onboarding tour"
不要做其他任务。
```

---

### 第 3 批指令

```
项目路径：C:\Users\50441\Documents\trae开发\滴答清单复刻

执行 Phase 9 第 3 批（2 个 UI/UX 优化）：

⑤ 通知中心面板（P9-06）：
   - 在 src/stores/uiStore.ts 添加 notificationHistory state（持久化）
   - 新建 src/utils/notification.ts（封装提醒触发逻辑）
   - 新建 src/components/NotificationCenter.tsx：
     - 从 uiStore 读取通知历史
     - 按日期分组显示，点击跳转任务
     - 清空历史按钮
   - 修改 TaskDetail.tsx 提醒设置：
     - 从简单开关改为"提前量选择器"（正点/5分钟/15分钟/30分钟/1小时/1天）
     - 需要 tasks 表有 reminder_minutes 字段（如果没有，先在 db.rs 中 ALTER TABLE 添加）
   - 在 TitleBar.tsx 右侧添加铃铛图标按钮，点击弹出通知中心
   - 验收：可设置提醒提前量，提醒触发时有 Toast，通知中心显示历史

⑥ 快捷键自定义面板（P9-07）：
   - 修改 src/utils/shortcuts.ts：定义 DEFAULT_SHORTCUTS 数组
   - 在 uiStore.ts 添加 customShortcuts state（localStorage 持久化）
   - 新建 src/components/settings/ShortcutsPanel.tsx：
     - 列表展示所有可自定义快捷键
     - 点击进入录制模式（监听下次 keydown）
     - 冲突检测提示
     - 重置为默认按钮
   - 修改 src/hooks/useKeyboardShortcuts.ts：从 store 读取自定义快捷键
   - 在 SettingsView.tsx 左侧导航添加"快捷键"分类（在"通用"下方）
   - 验收：设置页有快捷键分类，可自定义，实时生效

两个任务都完成后：
git add -A
git commit -m "feat: Phase 9 batch 3 - notification center + custom shortcuts"
不要做其他任务。
```

---

### 第 4 批指令

```
项目路径：C:\Users\50441\Documents\trae开发\滴答清单复刻

执行 Phase 9 第 4 批（2 个任务：附件 + E2E 测试）：

⑦ 任务附件支持（P9-04）：
   - 后端：
     - 在 db.rs init_db 中创建 attachments 表（含索引）
     - 新建 src-tauri/src/commands/attachment_commands.rs
       - add_attachment(task_id, file_path) → 复制文件到应用数据目录，记录数据库
       - get_attachments(task_id) → 返回附件列表
       - delete_attachment(attachment_id) → 删除记录 + 文件
       - open_attachment(attachment_id) → 调用系统程序打开（open crate）
     - Cargo.toml 添加 open = "5" 依赖
   - 前端：
     - 新建 src/api/attachmentApi.ts
     - 修改 TaskDetail.tsx，在备注区域下方添加附件区域：
       - 显示附件列表（文件名 + 大小 + 图标）
       - "添加附件"按钮（tauri-plugin-dialog 选择文件）
       - 图片附件 inline 预览，其他文件点击打开
   - 验收：可添加/预览/打开/删除附件，删除任务时自动删除附件文件

⑧ E2E 测试框架（P9-08）：
   - 安装 Playwright：npx init playwright@latest（选择 TypeScript）
   - 配置 playwright.config.ts：baseURL = http://localhost:1420
   - 编写 5 个测试文件：
     - tests/task-crud.spec.ts（创建/编辑/删除/完成）
     - tests/list-management.spec.ts（创建/编辑/删除清单）
     - tests/calendar-view.spec.ts（切换视图、拖拽任务）
     - tests/ai-assistant.spec.ts（打开 AI 助手、发送消息）
     - tests/settings.spec.ts（切换主题、配置 API）
   - 在 package.json 添加 scripts："test:e2e" 和 "test:e2e:ui"
   - 在 .github/workflows/ci.yml 添加 E2E 测试步骤（需要在 CI 中启动 dev server）
   - 验收：npm run test:e2e 可以运行，测试通过

两个任务都完成后：
git add -A
git commit -m "feat: Phase 9 batch 4 - task attachments + E2E test framework"
不要做其他任务。
```

---

### 第 5 批指令

```
项目路径：C:\Users\50441\Documents\trae开发\滴答清单复刻

执行 Phase 9 第 5 批（1 个性能优化任务）：

⑨ 性能调优（P9-09）：
   - 修改 src/components/TaskList.tsx：
     - useVirtualizer 的 estimateSize 设为 56（任务行固定高度）
     - overscan 设为 10
   - 修改 src/hooks/useTaskFiltering.ts：
     - 确保 filteredTasks 用 useMemo 包裹，依赖项精确（tasks, selectedListId, selectedTagId, searchQuery, filters）
     - 避免不必要的重新计算
   - （可选）实现分页加载：
     - 在 taskStore.ts 添加 page/pageSize state
     - loadTasks 接受 page 参数，scroll 到底部时加载更多
   - 用 performance.now() 测试优化前后 filtering 耗时
   - 验收：1000+ 任务滚动流畅，filtering 性能提升

完成后：
git add -A
git commit -m "perf: Phase 9 batch 5 - virtual list tuning + filtering optimization"
不要做其他任务。
```

---

### 最终版本号更新指令

```
项目路径：C:\Users\50441\Documents\trae开发\滴答清单复刻

执行 Phase 9 收尾（版本号 + README）：

⑩ 更新版本号和 README：
   a. package.json: "version": "1.30.0"
   b. src-tauri/Cargo.toml: version = "1.30.0"
   c. src-tauri/tauri.conf.json: "version": "1.30.0"
   d. README.md badge: version-1.30.0-blue
   e. README.md 添加 v1.30.0 changelog：
      - 新增：任务模板系统（创建/应用/管理模板）
      - 新增：习惯周/月统计图表（recharts 柱状图+热力图+趋势图）
      - 新增：周/日视图时间轴（小时刻度 + 当前时间红线）
      - 新增：新用户引导教程（react-joyride，5 步核心功能引导）
      - 新增：通知中心面板（提醒历史 + 提前量自定义）
      - 新增：快捷键自定义面板（设置页新增分类）
      - 新增：任务附件支持（上传/预览/打开文件）
      - 新增：E2E 测试框架（Playwright，5 个核心流程测试）
      - 优化：虚拟列表性能调优 + 过滤性能提升

全部完成后：
git add -A
git commit -m "release: v1.30.0 — Phase 9 功能模块开发 + UI/UX 优化"
```

---

## 六、Phase 9 完成后的预期成果

| 指标         | v1.29.0    | v1.30.0                     |
| ------------ | ---------- | --------------------------- |
| 任务模板系统 | ❌         | ✅                          |
| 习惯统计图表 | 文字统计   | **周/月/趋势 3 种图表**     |
| 日历时间轴   | 无小时刻度 | **小时刻度 + 当前时间红线** |
| 新用户引导   | ❌         | ✅                          |
| 通知中心     | 系统通知   | **应用内通知历史面板**      |
| 快捷键自定义 | 硬编码     | ✅                          |
| 任务附件     | ❌         | ✅                          |
| E2E 测试     | ❌         | **Playwright 5 个测试**     |
| 虚拟列表性能 | 基础       | **estimateSize 优化**       |
| 测试通过数   | 189        | **194+（含 E2E）**          |

---

## 七、Phase 10 候选方向

| 方向           | 说明                    | 优先级 |
| -------------- | ----------------------- | ------ |
| 多语言 i18n    | 国际化支持（中/英/日）  | P1     |
| 数据可视化增强 | 更丰富的 StatsView 图表 | P2     |
| 任务依赖关系   | 前置任务/后置任务       | P2     |
| 时间追踪       | 任务计时器 + 时间报告   | P2     |
| 日历订阅       | iCalendar 格式导入/导出 | P3     |
| 打印支持       | 任务列表/日历打印       | P3     |
| 语音输入       | 语音转文字创建任务      | P3     |

---

_本文档由 QClaw 生成，可被 Trae / Workbuddy 直接用于执行 Phase 9 优化操作。_
