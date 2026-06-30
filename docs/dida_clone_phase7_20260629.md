# 滴答清单复刻 — Phase 7 优化改进文档

**项目路径**：`C:\Users\50441\Documents\trae开发\滴答清单复刻`
**当前版本**：v1.26.0
**目标版本**：v1.27.0
**文档生成**：2026-06-29 17:30

---

## 一、Phase 7 定位

### 三个 Bug + 三个优化方向

| 类型 | 内容 | 优先级 |
|---|---|---|
| 🐛 Bug | 四象限模块无法右键删除任务 | P0 |
| 🐛 Bug | 习惯模块只能看 7 天打卡，缺日历图 | P1 |
| 🐛 Bug | AI 快捷技能常驻占用空间，应集成到输入框 | P1 |
| 🔧 优化 | sync.rs 381 行拆分 | P2 |
| 🔧 优化 | SyncPanel.tsx 460 行拆分 | P2 |
| 🔧 优化 | README badge 版本号同步 | P3 |

---

## 二、任务清单

### 方向 A：Bug 修复（3 个任务，5h）

#### P7-01：四象限模块右键删除任务（P0 | ⭐ Flash，1h）

**Bug 描述**：四象限视图中右键任务没有"删除"选项，无法删除任务。

**原因分析**：
- `QuadrantView.tsx` 当前只实现了拖拽改变优先级，没有调用 `TaskContextMenu`
- 需要在四象限的任务卡片上添加 `onContextMenu` 事件，复用现有的 `TaskContextMenu` 组件

**操作步骤**：

1. 在 `src/components/QuadrantView.tsx` 中引入 `TaskContextMenu` 和相关 context：

```tsx
import { useState, useMemo } from 'react'
import { TaskContextMenu } from './task-item/TaskContextMenu'
import { useTaskActionContext } from '../contexts/TaskActionContext'

// 在组件内：
const [contextMenu, setContextMenu] = useState<{ task: Task; x: number; y: number } | null>(null)

function handleContextMenu(e: React.MouseEvent, task: Task) {
  e.preventDefault()
  e.stopPropagation()
  setContextMenu({ task, x: e.clientX, y: e.clientY })
}

function handleCloseContextMenu() {
  setContextMenu(null)
}
```

2. 在任务卡片上添加 `onContextMenu`：

```tsx
<div
  onContextMenu={(e) => handleContextMenu(e, task)}
  onClick={() => onTaskClick(task)}
  // ...其他现有属性
>
  {/* 现有内容 */}
</div>
```

3. 在组件末尾渲染右键菜单：

```tsx
{contextMenu && (
  <TaskContextMenu
    task={contextMenu.task}
    position={{ x: contextMenu.x, y: contextMenu.y }}
    onClose={handleCloseContextMenu}
    onRename={handleCloseContextMenu}
  />
)}
```

4. 确保 `TaskActionContext` 已经在父级提供（检查 `CalendarView.tsx` 是否已包裹 `TaskActionProvider`）。

**验收**：
- 四象限视图中右键任务，弹出完整右键菜单
- 菜单中"删除"选项可用，点击后弹出删除确认
- 删除后任务从四象限消失
- 其他右键功能（日期设置、优先级、标签等）也可用

---

#### P7-02：习惯模块日历图 — 历史打卡记录展示（P1 | ⭐ GLM 5.2 / V4 Pro，3h）

**Bug 描述**：当前习惯模块只显示 7 天打卡情况，用户希望像日历图一样看到所有历史打卡记录。

**原因分析**：
- `HabitView.tsx` 中 `loadHabits` 调用 `habitApi.getRecords(h.id)` **不传日期范围**，后端返回全部记录
- 但 `HabitCard.tsx` 只渲染 `weekDays`（7 天），没有历史日历视图
- 需要新增"展开日历"功能，显示完整月历或全部历史

**操作步骤**：

##### 1. 后端确认（无需改动）

当前 `get_habit_records` 已支持 `start_date` / `end_date` 可选参数，不传则返回全部记录。✅ 后端无需改动。

##### 2. `HabitCard.tsx` 新增"历史日历"展开模式

在 `HabitCard` 中新增一个"日历模式"切换按钮，点击后展开一个**月历视图**，显示该习惯的所有历史打卡记录。

```tsx
// HabitCard.tsx 新增状态
const [showCalendar, setShowCalendar] = useState(false)
const [calendarMonth, setCalendarMonth] = useState(() => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
})

// 加载该习惯的所有记录（已有 records prop，是 Record<string, number> 格式）
// 直接从 habit.records 读取，不需要额外 API 调用
```

##### 3. 月历组件设计

在 `HabitCard` 展开后渲染一个月历：

```tsx
function HabitCalendar({ records, month, onMonthChange }: {
  records: Record<string, number>
  month: Date
  onMonthChange: (dir: 'prev' | 'next') => void
}) {
  const year = month.getFullYear()
  const monthIdx = month.getMonth()
  const firstDay = new Date(year, monthIdx, 1)
  const lastDay = new Date(year, monthIdx + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startWeekday = firstDay.getDay() // 0=周日

  const today = new Date()
  const todayStr = dateKey(today)

  // 构建日历格子（42 格 = 6 行 × 7 列）
  const cells: (Date | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, monthIdx, d))
  }
  while (cells.length < 42) cells.push(null)

  return (
    <div className="mt-3 p-3 bg-[var(--color-bg-secondary)] rounded-lg">
      {/* 月份导航 */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => onMonthChange('prev')} className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">‹</button>
        <span className="text-sm font-medium">{year}年{monthIdx + 1}月</span>
        <button onClick={() => onMonthChange('next')} className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">›</button>
      </div>

      {/* 星期标题 */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['日', '一', '二', '三', '四', '五', '六'].map(d => (
          <div key={d} className="text-xs text-center text-[var(--color-text-tertiary)]">{d}</div>
        ))}
      </div>

      {/* 日期格子 */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />
          const dateStr = dateKey(date)
          const count = records[dateStr] || 0
          const isToday = dateStr === todayStr
          const isFuture = date > today
          const isCompleted = count > 0

          return (
            <div
              key={i}
              className={`
                text-xs text-center py-1.5 rounded relative
                ${isFuture ? 'text-[var(--color-text-tertiary)] opacity-40' : ''}
                ${isCompleted ? 'bg-[var(--color-accent-light)] text-[var(--color-accent-text)] font-medium' : 'text-[var(--color-text-secondary)]'}
                ${isToday ? 'ring-2 ring-[var(--color-accent)]' : ''}
              `}
              title={isCompleted ? `${dateStr}: ${count}次` : dateStr}
            >
              {date.getDate()}
              {isCompleted && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--color-accent)]" />
              )}
            </div>
          )
        })}
      </div>

      {/* 统计 */}
      <div className="mt-2 pt-2 border-t border-[var(--color-border-light)] flex justify-between text-xs text-[var(--color-text-tertiary)]">
        <span>本月打卡: {Object.entries(records).filter(([d]) => {
          const dt = new Date(d)
          return dt.getFullYear() === year && dt.getMonth() === monthIdx
        }).length} 天</span>
        <span>累计打卡: {Object.keys(records).length} 天</span>
      </div>
    </div>
  )
}
```

##### 4. 在 HabitCard 折叠区域添加切换按钮和日历

```tsx
// 在 HabitCard 的展开内容区域（expanded 为 true 时）添加：
<button
  onClick={() => setShowCalendar(!showCalendar)}
  className="text-xs text-[var(--color-accent)] hover:underline mb-2"
>
  {showCalendar ? '收起日历' : '📅 查看历史日历'}
</button>

{showCalendar && (
  <HabitCalendar
    records={habit.records}
    month={calendarMonth}
    onMonthChange={(dir) => {
      const newMonth = new Date(calendarMonth)
      if (dir === 'prev') newMonth.setMonth(newMonth.getMonth() - 1)
      else newMonth.setMonth(newMonth.getMonth() + 1)
      setCalendarMonth(newMonth)
    }}
  />
)}
```

**验收**：
- 习惯卡片展开后有"查看历史日历"按钮
- 点击后显示当月日历，已打卡的日期有高亮
- 可以左右切换月份
- 显示本月打卡天数和累计打卡天数
- 今天的日期有特殊标记

---

#### P7-03：AI 快捷技能集成到输入框（P1 | ⭐ Flash，1h）

**Bug 描述**：当前 AI 快捷技能常驻在聊天界面上方，占用大量空间。用户希望先隐藏技能，将快捷技能按钮集成到输入框和发送按钮之间，点击弹出技能菜单。

**操作步骤**：

##### 1. 修改 `src/components/ai/AIAssistant.tsx`

- 删除顶部的 `<SkillSelector>` 常驻显示
- 删除 `showSkills` 状态（不再需要）
- 在输入框右侧、发送按钮左侧添加一个"技能"图标按钮

```tsx
// 删除：
// const [showSkills, setShowSkills] = useState(true)
// <SkillSelector skills={AI_SKILLS} onSelectSkill={handleSelectSkill} visible={showSkills} />

// 新增：
const [showSkillMenu, setShowSkillMenu] = useState(false)

// 在输入框区域：
<div className="flex items-center gap-2 p-3 border-t border-[var(--color-border-light)] bg-[var(--color-surface)]">
  <input
    type="text"
    value={input}
    onChange={(e) => setInput(e.target.value)}
    onKeyDown={handleKeyDown}
    placeholder={isStreaming ? 'AI 正在生成中…' : (activeSkill ? '请输入...' : '输入问题...')}
    className="flex-1 px-3 py-2 text-sm bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
    disabled={isStreaming}
  />

  {/* 技能按钮：在输入框和发送按钮之间 */}
  <div className="relative">
    <button
      onClick={() => setShowSkillMenu(!showSkillMenu)}
      className={`p-2 rounded-lg transition-colors ${showSkillMenu || activeSkill ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'}`}
      title="快捷技能"
      disabled={isStreaming}
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    </button>

    {/* 技能弹出菜单 */}
    {showSkillMenu && (
      <>
        {/* 点击外部关闭 */}
        <div className="fixed inset-0 z-40" onClick={() => setShowSkillMenu(false)} />
        <div className="absolute bottom-full right-0 mb-2 w-64 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-[var(--color-border-light)]">
            <p className="text-xs font-medium text-[var(--color-text-secondary)]">快捷技能</p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {AI_SKILLS.map(skill => (
              <button
                key={skill.id}
                onClick={() => {
                  handleSelectSkill(skill)
                  setShowSkillMenu(false)
                }}
                className="w-full flex items-center gap-3 p-2.5 hover:bg-[var(--color-accent-light)] transition-colors text-left"
              >
                <span className="text-xl">{skill.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--color-text-primary)]">{skill.name}</div>
                  <div className="text-xs text-[var(--color-text-tertiary)] truncate">{skill.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </>
    )}
  </div>

  {/* 发送按钮 */}
  <button
    onClick={isStreaming ? handleStop : handleSend}
    className={`p-2 rounded-lg ${isStreaming ? 'bg-red-500 text-white' : 'bg-[var(--color-accent)] text-white'}`}
    title={isStreaming ? '停止生成' : '发送'}
  >
    {isStreaming ? (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="6" y="6" width="12" height="12" strokeWidth={2} />
      </svg>
    ) : (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
      </svg>
    )}
  </button>
</div>
```

##### 2. 删除 `SkillSelector.tsx` 中的 `SkillSelector` 组件

保留 `WelcomeScreen` 组件（欢迎页仍需要）。将 `SkillSelector.tsx` 重命名为 `WelcomeScreen.tsx`，或保留文件但删除 `SkillSelector` 导出。

##### 3. 顶部标题栏的"技能列表"按钮也删除

```tsx
// 删除：
// <button onClick={() => setShowSkills(!showSkills)} ...>
//   技能列表图标
// </button>
```

**验收**：
- AI 助手打开后，技能列表不再常驻显示
- 输入框右侧有一个闪电⚡图标按钮
- 点击后弹出技能菜单（上下文菜单样式）
- 选中技能后菜单关闭，进入对应技能模式
- 技能模式下闪电图标高亮
- 发送按钮正常工作

---

### 方向 B：代码结构优化（2 个任务，3h）

#### P7-04：拆分 sync.rs（381→≤200 行 × 2 文件）（P2 | ⭐ Flash，2h）

**操作**：

1. 新建 `src-tauri/src/sync_ops.rs`，将以下函数移入：
   - `init_sync_repo`
   - `pull_changes`
   - `push_changes`

2. `sync.rs` 只保留：
   - `SyncConfig` / `SyncStatus` 结构体定义
   - `get_sync_status`
   - `handle_db_conflict`

3. 在 `sync.rs` 顶部添加：
```rust
mod sync_ops;
pub use sync_ops::{init_sync_repo, pull_changes, push_changes};
```

**验收**：
- `sync.rs` ≤200 行
- `sync_ops.rs` ≤200 行
- `cargo check` 通过

---

#### P7-05：拆分 SyncPanel.tsx（460→≤250 行 × 2 文件）（P2 | ⭐ Flash，1h）

**操作**：

1. 新建 `src/components/settings/SyncStatusPanel.tsx`，将同步状态显示部分移入：
   - 上次同步时间
   - 同步状态指示器
   - 冲突提示

2. `SyncPanel.tsx` 只保留：
   - 配置表单（仓库 URL / 分支 / 自动同步开关 / 间隔）
   - 按钮操作（初始化 / 立即同步 / 保存配置）

**验收**：
- `SyncPanel.tsx` ≤250 行
- `SyncStatusPanel.tsx` ≤200 行
- `npm run build` 通过

---

### 方向 C：收尾（1 个任务，0.5h）

#### P7-06：README badge 版本号同步（P3 | ⭐ 手动，0.5h）

**操作**：

在 `README.md` 中更新：

```markdown
![版本](https://img.shields.io/badge/version-1.27.0-blue)
```

同时在 README 顶部添加 v1.27.0 changelog。

---

## 三、执行顺序

```
第 1 批（2h）— 两个简单 Bug + 收尾
  ① P7-01 四象限右键菜单（Flash，1h）
  ② P7-03 AI 技能按钮集成（Flash，1h）

第 2 批（3h）— 习惯日历图
  ③ P7-02 习惯模块日历图（GLM 5.2 / V4 Pro，3h）

第 3 批（3h）— 代码结构优化
  ④ P7-04 拆 sync.rs（Flash，2h）
  ⑤ P7-05 拆 SyncPanel（Flash，1h）

第 4 批（0.5h）— 版本号
  ⑥ P7-06 README badge（手动，0.5h）
```

**总计**：6 个任务，~8.5h

---

## 四、给 Trae / Workbuddy 的指令

### 第 1 批指令

```
项目路径：C:\Users\50441\Documents\trae开发\滴答清单复刻

执行 Phase 7 第一批（2 个 Bug 修复）：

① 四象限模块右键删除任务：
   - 文件：src/components/QuadrantView.tsx（269 行）
   - 问题：右键任务没有菜单，无法删除
   - 修复：引入 TaskContextMenu，在任务卡片添加 onContextMenu 事件
   - 代码见文档 P7-01 节
   验收：四象限中右键任务弹出完整菜单，删除功能可用

② AI 快捷技能集成到输入框：
   - 文件：src/components/ai/AIAssistant.tsx（266 行）
   - 问题：技能列表常驻占空间
   - 修复：删除常驻 SkillSelector，在输入框和发送按钮之间添加闪电图标按钮，点击弹出技能菜单
   - 代码见文档 P7-03 节
   验收：技能列表不再常驻，输入框右侧有闪电按钮，点击弹出菜单

全部完成后：
git add -A
git commit -m "fix: Phase 7 batch 1 - quadrant context menu + AI skill button integration"
不要做其他任务。
```

### 第 2 批指令

```
项目路径：C:\Users\50441\Documents\trae开发\滴答清单复刻

执行 Phase 7 第二批（习惯日历图）：

③ 习惯模块日历图：
   - 文件：src/components/habit/HabitCard.tsx（390 行）
   - 问题：只显示 7 天打卡，需要历史日历
   - 修复：
     a. 新增 showCalendar 状态和 calendarMonth 状态
     b. 新增 HabitCalendar 子组件（月历，支持左右切换月份）
     c. 已打卡日期高亮，今天有特殊标记
     d. 显示本月打卡天数 + 累计打卡天数
   - 代码见文档 P7-02 节
   验收：
     a. 习惯卡片展开后有"查看历史日历"按钮
     b. 点击后显示当月日历
     c. 可以切换月份
     d. 已打卡日期有高亮
     e. 显示统计信息

全部完成后：
git add -A
git commit -m "feat: Phase 7 batch 2 - habit calendar history view"
不要做其他任务。
```

### 第 3 批指令

```
项目路径：C:\Users\50441\Documents\trae开发\滴答清单复刻

执行 Phase 7 第三批（代码结构优化）：

④ 拆分 sync.rs（381→≤200 行 × 2 文件）：
   - 新建 src-tauri/src/sync_ops.rs
   - 将 init_sync_repo / pull_changes / push_changes 移入
   - sync.rs 只保留结构体定义 + get_sync_status + handle_db_conflict
   - 代码见文档 P7-04 节
   验收：cargo check 通过，两个文件都 ≤200 行

⑤ 拆分 SyncPanel.tsx（460→≤250 行 × 2 文件）：
   - 新建 src/components/settings/SyncStatusPanel.tsx
   - 将同步状态显示部分移入
   - SyncPanel.tsx 只保留配置表单 + 按钮
   - 代码见文档 P7-05 节
   验收：npm run build 通过，两个文件都 ≤250 行

全部完成后：
git add -A
git commit -m "refactor: Phase 7 batch 3 - split sync.rs and SyncPanel.tsx"
不要做其他任务。
```

### 第 4 批指令

```
项目路径：C:\Users\50441\Documents\trae开发\滴答清单复刻

执行 Phase 7 第四批（版本号 + README）：

⑥ 更新版本号和 README：
   a. package.json: "version": "1.27.0"
   b. src-tauri/Cargo.toml: version = "1.27.0"
   c. src-tauri/tauri.conf.json: "version": "1.27.0"
   d. README.md badge: version-1.27.0-blue
   e. README.md 添加 v1.27.0 changelog：
      - 修复：四象限模块右键删除任务
      - 新增：习惯模块历史日历图
      - 优化：AI 快捷技能集成到输入框
      - 重构：拆分 sync.rs 和 SyncPanel.tsx

全部完成后：
git add -A
git commit -m "release: v1.27.0 — Phase 7 bug fixes + habit calendar"
```

---

## 五、Phase 7 完成后的预期成果

| 指标 | v1.26.0 | v1.27.0 |
|---|---|---|
| 四象限右键删除 | ❌ | ✅ |
| 习惯历史日历 | ❌（仅 7 天） | ✅（完整月历） |
| AI 技能按钮 | 常驻占空间 | **集成到输入框** |
| sync.rs 行数 | 381 | **≤200 × 2** |
| SyncPanel.tsx 行数 | 460 | **≤250 × 2** |
| README badge | 1.24.0 | **1.27.0** |
| 超 300 行 .rs 文件 | 1 个 | **0 个** |

---

## 六、Phase 8 候选方向

| 方向 | 说明 |
|---|---|
| 任务模板系统 | 常用任务快速创建（会议/出差/项目启动） |
| E2E 测试 | Playwright 端到端测试 |
| 习惯周/月统计图 | 图表展示打卡趋势 |
| 性能优化 | 虚拟列表 + 大列表优化 |
| 国际化 i18n | 多语言支持 |
