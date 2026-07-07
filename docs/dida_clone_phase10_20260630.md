# 滴答清单复刻 — Phase 10 优化改进文档

**项目路径**：`C:\Users\50441\Documents\trae开发\滴答清单复刻`
**当前版本**：v1.30.0
**目标版本**：v1.31.0
**文档生成**：2026-06-30 13:20
**阶段主题**：**功能模块深化 + UI/UX 打磨 + 架构清理**

---

## 一、Phase 10 定位

### 与前阶段的关系

| 阶段         | 主题                                     | 状态    |
| ------------ | ---------------------------------------- | ------- |
| Phase 7      | Bug 修复 + 收尾                          | ✅      |
| Phase 8      | 架构拆分 + 功能增强                      | ✅      |
| Phase 9      | 新功能（模板/附件/通知/统计）+ 性能      | ✅      |
| **Phase 10** | **功能模块深化 + UI/UX 打磨 + 架构清理** | 📋 本次 |

### 设计思路

用户提出三大方向：**功能模块开发与优化**、**整体 UI 及交互优化**、**架构优化**。基于当前代码库扫描，我发现以下核心机会：

1. **功能深化**：现有功能有多处"可用但不够好用"的地方
   - AI 助手只能单轮操作，无上下文记忆
   - 任务无重复规则（repeat_rule 字段存在但前后端均未使用）
   - 任务无子任务折叠/批量操作
   - 搜索无高亮、无搜索历史
   - 无任务拖拽到日历的快捷创建（月视图已有，但列表视图无）

2. **UI/UX 打磨**：v1.28.0 虽统一了颜色体系，但交互细节仍有提升空间
   - 任务列表无虚拟滚动（@tanstack/react-virtual 已安装但未使用）
   - 详情面板无滑入动画
   - 右键菜单无键盘导航
   - 暗色模式下若干组件对比度不足
   - 无全局 Loading 状态

3. **架构清理**：v1.29.0 拆分后，还有几处遗留
   - `@tanstack/react-query` 安装但从未使用
   - `vitest.config.ts` 未排除 `tests/*.spec.ts`，导致 Playwright 用例被误收集
   - `useKeyboardShortcuts.ts` 仅 68 行，快捷键已支持自定义但未读取自定义配置
   - Rust 后端 `task_crud.rs` / `task_ops.rs` 拆分后仍有重复逻辑

---

## 二、任务清单

### 方向 A：功能模块深化（4 个任务，~14h）

#### P10-01：任务重复规则（Recurring Tasks）⭐ 重点功能（P0 | GLM 5.2 / V4 Pro，4h）

**需求**：`repeat_rule` 字段在数据库已存在但前后端均未使用。实现完整的重复任务功能。

**当前状态**：

- `db.rs` tasks 表有 `repeat_rule TEXT` 字段
- 前端 `Task` 类型有 `repeat_rule?: string`
- `TaskDetail.tsx` / `TaskContextMenu.tsx` / `TaskMetaPanel.tsx` 均未暴露 UI
- 后端无解析重复规则的逻辑

**实现方案**：

##### 1. 重复规则数据结构（RFC 5545 RRULE 简化版）

```typescript
// src/types/repeat.ts
export type RepeatFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

export interface RepeatRule {
  freq: RepeatFrequency
  interval: number // 每 N 天/周/月/年
  byweekday?: number[] // WEEKLY 时生效，0=周日..6=周六
  endDate?: string // ISO 日期，可选
  count?: number // 重复次数，可选（与 endDate 互斥）
}

export function parseRepeatRule(rule: string | null | undefined): RepeatRule | null
export function serializeRepeatRule(rule: RepeatRule): string
export function getNextOccurrence(rule: RepeatRule, from: Date): Date | null
```

**序列化格式**（存入 `repeat_rule` 字段）：`FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR`（与 RFC 5545 兼容但简化）

##### 2. 后端实现

**新文件**：`src-tauri/src/repeat.rs`（~150 行）

```rust
// 核心函数
pub fn parse_rrule(s: &str) -> Option<RepeatRule>
pub fn next_occurrence(rule: &RepeatRule, from: DateTime<Local>) -> Option<DateTime<Local>>
pub fn expand_recurring_task(task: &Task, from: Date, to: Date) -> Vec<Task> // 在日期范围内展开

// 新 Tauri 命令
#[tauri::command]
pub fn complete_recurring_task(state: State<DbState>, task_id: i64) -> Result<i64, String>
// 逻辑：1) 本次完成 → 创建下一个周期任务，返回新 task_id
//      2) 若规则已到期（endDate/count 到达）→ 普通完成
```

**修改**：`task_ops.rs` 的 `complete_task` 函数检测 `repeat_rule`，若有则调用 `complete_recurring_task`。

##### 3. 前端 UI

**新文件**：`src/components/task-item/menu/RepeatMenu.tsx`（~120 行）

- 从 `TaskContextMenu` 右键菜单"重复"选项打开
- 快捷选项：每天 / 每周 / 每月 / 每年 / 自定义
- 自定义面板：频率（日/周/月/年）+ 间隔 + 指定星期 + 结束条件

**修改**：

- `TaskMetaPanel.tsx` 新增"重复"行，显示规则摘要 + 编辑按钮
- `TaskContextMenu.tsx` 新增"重复"子菜单
- `TaskItem.tsx` 任务标题后显示重复图标 🔁

##### 4. 验收

- 创建每天重复任务，完成一次后自动生成下一天的副本
- 每周指定星期重复（如周一、三、五）
- 设置结束日期后到期不再生成
- 月视图上重复任务有视觉标识

---

#### P10-02：AI 助手对话记忆 + 多轮操作（P1 | GLM 5.2，3h）

**需求**：当前 AI 助手每次发送消息都重新构造 systemPrompt + history，但 `history` 只包含当前会话消息，没有跨会话记忆。用户希望 AI 能记住偏好（如"我喜欢早上 9 点开始处理高优任务"）。

**当前状态**：

- `AIAssistant.tsx` 的 `sendMessage` 每次构造 `backendMessages`，history 来自 `messages.slice(0, -1)`
- 无持久化，关闭 AI 面板后对话丢失
- 无用户偏好记忆

**实现方案**：

##### 1. 对话持久化

```typescript
// src/stores/aiStore.ts
interface AIStore {
  messages: UIMessage[]
  preferences: string[] // AI 记住的用户偏好
  sendMessage: (content: string) => Promise<void>
  clearMessages: () => void
  addPreference: (pref: string) => void
}
// 持久化到 localStorage('ai_chat_history') + localStorage('ai_preferences')
```

##### 2. 用户偏好注入

在 `sendMessage` 的 systemPrompt 中追加：

```
## 用户偏好（请遵循这些偏好）
- 我喜欢早上 9 点开始处理高优任务
- 工作日任务用蓝色标签，周末用绿色
- ...
```

##### 3. 偏好自动检测

在 `parseActions` 后增加 `parsePreferences` 函数：检测 AI 回复中的"记住我..."、"我喜欢..."、"以后都..."等模式，提取为偏好条目，提示用户确认后保存。

##### 4. 验收

- 关闭 AI 面板再打开，对话记录保留
- 偏好自动检测 + 用户确认保存
- 偏好注入到后续对话的 systemPrompt
- 支持"忘记所有偏好"按钮

---

#### P10-03：任务列表虚拟滚动（P1 | GLM 5.2，3h）

**需求**：`@tanstack/react-virtual` 已在 dependencies 中但未使用。任务超过 200 条时列表明显卡顿。

**当前状态**：

- `TaskListPanel.tsx` 直接 map 所有 filteredTasks 渲染
- `TaskItem.tsx` 虽有 `React.memo`，但 200+ 条仍卡顿
- `@tanstack/react-virtual` v3.14.3 已安装

**实现方案**：

##### 1. 改造 TaskListPanel

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

// 在 TaskListPanel 的列表区域：
const parentRef = useRef<HTMLDivElement>(null)
const virtualizer = useVirtualizer({
  count: visibleTasks.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 56, // TaskItem 默认高度
  overscan: 8,
})

return (
  <div ref={parentRef} style={{ height: '100%', overflow: 'auto' }}>
    <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
      {virtualizer.getVirtualItems().map(virtualItem => (
        <div
          key={virtualItem.key}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${virtualItem.start}px)`,
          }}
        >
          <TaskItem task={visibleTasks[virtualItem.index]} {...} />
        </div>
      ))}
    </div>
  </div>
)
```

##### 2. 展开子任务时动态调整高度

子任务展开时，该 item 高度变化，调用 `virtualizer.measureElement(el)` 重新测量。

##### 3. 验收

- 500 条任务流畅滚动（FPS > 50）
- 展开/折叠子任务时高度正确
- 滚动到顶部 / 滚动到底部按钮正常
- 批量选择跨虚拟化边界正常

---

#### P10-04：搜索体验增强（P2 | GLM 5.2，2h）

**需求**：当前搜索仅匹配标题/备注/子任务，无高亮、无搜索历史、无快捷键聚焦。

**当前状态**：

- `taskSearch.ts` 51 行，支持标题/备注/子任务匹配
- `TaskListPanel.tsx` 搜索框 Ctrl+F 聚焦已实现
- 无高亮、无历史

**实现方案**：

##### 1. 搜索高亮

```typescript
// src/utils/searchHighlight.tsx
export function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  const parts = text.split(regex)
  return parts.map((part, i) =>
    regex.test(part) ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-700/40 rounded px-0.5">{part}</mark> : part
  )
}
```

在 `TaskItem.tsx` 标题渲染处调用 `highlightMatch(task.title, searchQuery)`。

##### 2. 搜索历史

```typescript
// localStorage('search_history')，最多保留 10 条
// 搜索框聚焦时，下方显示历史搜索词列表，点击快速搜索
// 搜索时自动去重并加入历史
```

##### 3. 验收

- 搜索关键词在标题/备注中高亮显示
- 搜索框聚焦时显示历史搜索词
- 点击历史词快速搜索
- 清除历史按钮可用

---

### 方向 B：UI/UX 打磨（4 个任务，~10h）

#### P10-05：详情面板滑入动画 + 全局过渡统一（P1 | GLM 5.2，2h）

**需求**：详情面板当前无滑入/滑出动画，打开/关闭生硬。全局过渡时长不统一（有 150ms / 200ms / 300ms 混用）。

**当前状态**：

- `DetailPanel.tsx` 103 行，条件渲染 `{task && <DetailPanel />}`，无动画
- CSS 过渡时长散落各处：`duration-150` / `duration-200` / `duration-300` 混用
- `App.tsx` 中 DetailPanel 的渲染条件复杂（7 个 currentView 判断）

**实现方案**：

##### 1. 详情面板滑入动画

```tsx
// DetailPanel.tsx 改造
<div className="flex flex-col w-[400px] border-l border-[var(--color-border)] bg-[var(--color-surface)] animate-slide-in-right">
  {/* 内容 */}
</div>

// index.css 新增
@keyframes slide-in-right {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
.animate-slide-in-right {
  animation: slide-in-right 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
```

##### 2. 全局过渡变量

```css
:root {
  --transition-fast: 150ms ease;
  --transition-base: 200ms ease;
  --transition-slow: 300ms cubic-bezier(0.16, 1, 0.3, 1);
}
```

全局搜索替换 `duration-150` → `duration-200`（统一到 200ms），特殊情况保留 300ms。

##### 3. 验收

- 点击任务，详情面板从右侧滑入
- 关闭任务，详情面板滑出
- 全局过渡时长统一（200ms 为主，300ms 用于大型面板）

---

#### P10-06：右键菜单键盘导航（P2 | GLM 5.2，2h）

**需求**：右键菜单当前只支持鼠标操作，无键盘导航。用户希望用 ↑↓ 选择、Enter 确认、Esc 关闭。

**当前状态**：

- `TaskContextMenu.tsx` 231 行，仅鼠标交互
- `DateMenu.tsx` / `PriorityMenu.tsx` / `TagMenu.tsx` 子菜单同样无键盘导航

**实现方案**：

##### 1. 键盘导航 Hook

```typescript
// src/hooks/useMenuKeyboard.ts
export function useMenuKeyboard(items: MenuItem[], onClose: () => void) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((i) => (i + 1) % items.length)
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((i) => (i - 1 + items.length) % items.length)
          break
        case 'Enter':
          e.preventDefault()
          items[selectedIndex]?.onClick?.()
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [items, selectedIndex, onClose])

  return { selectedIndex, setSelectedIndex }
}
```

##### 2. 应用到 TaskContextMenu

- 主菜单和所有子菜单使用 `useMenuKeyboard`
- 选中项添加 `bg-[var(--color-accent-light)]` 高亮
- 右键打开时自动聚焦第一项

##### 3. 验收

- 右键打开菜单后，↑↓ 可选择菜单项
- Enter 执行选中项
- Esc 关闭菜单
- 子菜单（日期/优先级/标签）同样支持键盘导航
- Tab 在主菜单和子菜单间切换

---

#### P10-07：暗色模式对比度修复（P2 | GLM 5.2，2h）

**需求**：v1.28.0 虽统一了颜色体系，但暗色模式下仍有若干对比度不足的地方。

**当前问题**（基于代码扫描）：

| 位置                                                                           | 问题                             | 严重度 |
| ------------------------------------------------------------------------------ | -------------------------------- | ------ |
| `TaskItem.tsx` 三级文字 `text-[var(--color-text-tertiary)]` 暗色下为 `#6B7280` | 对比度 3.2:1，低于 WCAG AA 4.5:1 | 中     |
| `HabitCalendar.tsx` 未打卡日期文字                                             | 暗色下几乎不可见                 | 高     |
| `MonthHeatmap.tsx` 低频格子 opacity 0.2                                        | 暗色下几乎不可见                 | 高     |
| `PomodoroTimer.tsx` 番茄钟数字                                                 | 暗色下对比度不足                 | 中     |
| `StatsView.tsx` 图表文字                                                       | 暗色下灰色文字对比度不足         | 中     |

**实现方案**：

##### 1. 调整 CSS 变量

```css
/* index.css 暗色模式 */
[data-theme='dark'] {
  --color-text-tertiary: #9ca3af; /* 原 #6B7280，提升到 4.5:1 */
  --color-text-muted: #6b7280; /* 保留作为更弱化的文字 */
}
```

##### 2. 组件级修复

- `HabitCalendar.tsx`：未打卡日期 `text-[var(--color-text-secondary)]` 而非 tertiary
- `MonthHeatmap.tsx`：低频格子最低 opacity 0.3（原 0.2）
- `PomodoroTimer.tsx`：数字使用 `text-[var(--color-text-primary)]`
- `StatsView.tsx`：图表文字使用 `text-[var(--color-text-secondary)]`

##### 3. 验收

- 使用 Chrome DevTools Contrast Checker 验证所有文字对比度 ≥ 4.5:1
- 暗色模式下所有文字清晰可读
- 不影响浅色模式显示

---

#### P10-08：全局 Loading 状态 + 骨架屏（P2 | GLM 5.2，2h）

**需求**：应用启动时仅显示"加载中..."文字，无骨架屏。数据加载时无视觉反馈。

**当前状态**：

- `App.tsx` loading 状态仅显示 `<p>加载中...</p>`
- 任务列表首次加载无骨架屏
- AI 助手等待回复时有动画但无预估时间

**实现方案**：

##### 1. 骨架屏组件

```tsx
// src/components/common/Skeleton.tsx
export function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-[var(--color-bg-tertiary)] rounded ${className}`} />
}

export function TaskListSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="w-5 h-5 rounded-full" />
          <Skeleton className="flex-1 h-4" />
          <Skeleton className="w-20 h-4" />
        </div>
      ))}
    </div>
  )
}
```

##### 2. 应用启动骨架屏

`App.tsx` loading 时显示完整布局骨架屏（TitleBar + Sidebar + TaskList 骨架）。

##### 3. 全局 Loading 指示器

`uiStore` 新增 `globalLoading: boolean` + `setGlobalLoading`。长时间操作（同步 / 导入 / 导出 / AI 批量操作）时显示顶部进度条。

##### 4. 验收

- 应用启动时显示骨架屏而非"加载中"文字
- 骨架屏结构与实际布局匹配
- 长时间操作有顶部进度条反馈
- 加载完成后平滑过渡到实际内容

---

### 方向 C：架构清理（3 个任务，~6h）

#### P10-09：清理未使用依赖 + 修复 Playwright 配置（P1 | GLM 5.2，2h）

**需求**：项目中有多个已安装但未使用的依赖，Playwright E2E 测试被 vitest 误收集导致失败。

**当前问题**：

| 依赖                            | 状态                                                                                    | 处理方式                            |
| ------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------- |
| `@tanstack/react-query` v5.101  | 已安装，`queryClient.ts` / `queryKeys.ts` / `invalidate.ts` 定义但从未被任何组件 import | **删除**（P10-03 虚拟滚动不需要它） |
| `@tanstack/react-virtual` v3.14 | 已安装，P10-03 将使用                                                                   | **保留**                            |
| `errorHandler.ts`               | 定义但从未导入                                                                          | **删除**                            |

**Playwright 修复**：

```typescript
// vitest.config.ts 修改
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: ['tests/**', 'node_modules/**'], // ← 新增
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/utils/**', 'src/hooks/**', 'src/stores/**'],
    },
  },
})
```

**package.json** 新增脚本：

```json
{
  "scripts": {
    "test:unit": "vitest run",
    "test:e2e": "playwright test"
  }
}
```

**验收**：

- `npm run test:unit` 不再收集 `tests/*.spec.ts`
- `npm run test:e2e` 独立运行 Playwright（需要 `npm run dev` 先启动）
- 删除 react-query 相关文件后 TSC 通过
- `package.json` 无未使用依赖

---

#### P10-10：useKeyboardShortcuts 读取自定义配置（P2 | GLM 5.2，2h）

**需求**：Phase 9 实现了快捷键自定义面板，但 `useKeyboardShortcuts.ts` 仍使用硬编码快捷键，未读取用户自定义配置。

**当前状态**：

- `ShortcutsPanel.tsx` 204 行，保存自定义快捷键到 `localStorage('customShortcuts')`
- `uiStore.ts` 有 `customShortcuts` / `setCustomShortcut` / `resetShortcuts`
- `useKeyboardShortcuts.ts` 68 行，**硬编码** Ctrl+N / Ctrl+F / Ctrl+1/2/3 / Esc / ?/F1
- `shortcuts.ts` 定义 `DEFAULT_SHORTCUT_BINDINGS`（9 项），但 `useKeyboardShortcuts` 未引用

**实现方案**：

##### 1. 重构 useKeyboardShortcuts

```typescript
// src/hooks/useKeyboardShortcuts.ts
import { DEFAULT_SHORTCUT_BINDINGS, type ShortcutBinding } from '../utils/shortcuts'
import { useUIStore } from '../stores/uiStore'

export function useKeyboardShortcuts(...) {
  const customShortcuts = useUIStore(s => s.customShortcuts)

  // 合并默认和自定义快捷键
  const bindings = useMemo(() => {
    const map = new Map<string, string>()
    DEFAULT_SHORTCUT_BINDINGS.forEach(b => map.set(b.id, b.defaultKey))
    customShortcuts.forEach((key, id) => map.set(id, key))
    return map
  }, [customShortcuts])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // 构建当前按键组合字符串
      const parts: string[] = []
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.shiftKey) parts.push('Shift')
      if (e.altKey) parts.push('Alt')
      if (e.metaKey) parts.push('Meta')
      parts.push(e.key === ' ' ? 'Space' : e.key)

      const combo = parts.join('+')

      // 查找匹配的快捷键
      for (const [id, key] of bindings) {
        if (normalizeKey(key) === combo) {
          executeShortcut(id)
          return
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [bindings])
}
```

##### 2. 验收

- 在快捷键设置面板修改 Ctrl+N → Ctrl+T
- 关闭设置后按 Ctrl+T 能聚焦新建输入框
- Ctrl+N 不再触发新建
- 恢复默认后 Ctrl+N 恢复功能
- 快捷键帮助面板显示自定义后的按键

---

#### P10-11：Rust 后端进一步拆分 + 事务安全（P2 | GLM 5.2，2h）

**需求**：`task_crud.rs`（18 行）和 `task_ops.rs`（237 行）行数差距过大，`task_crud.rs` 仅为 re-export，且 `reorder_tasks` / `duplicate_task` 无事务包裹。

**当前状态**：

- `task_commands.rs` 35 行（模块入口）
- `task_crud.rs` 18 行（仅 re-export）
- `task_ops.rs` 237 行（reorder + complete + 辅助函数）
- `task_create.rs` 67 行
- `task_update.rs` 99 行
- `task_query.rs` 180 行
- `reorder_tasks` 和 `duplicate_task` 无事务包裹

**实现方案**：

##### 1. 合并 task_crud.rs 到 task_commands.rs

`task_crud.rs` 仅 18 行 re-export，合并到 `task_commands.rs` 入口文件，减少文件碎片。

##### 2. 事务包裹

```rust
// task_ops.rs
pub fn reorder_tasks(state: State<DbState>, orders: Vec<(i64, f64)>) -> Result<(), String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for (id, sort_order) in &orders {
        tx.execute(
            "UPDATE tasks SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
            params![sort_order, now_rfc3339(), id],
        ).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
```

##### 3. 验收

- `cargo check` 通过
- `reorder_tasks` / `duplicate_task` / `complete_recurring_task` 均使用事务
- 文件结构更清晰（无 18 行的碎片文件）

---

## 三、任务总览

| ID     | 任务                            | 优先级 | 预估 | 方向     |
| ------ | ------------------------------- | ------ | ---- | -------- |
| P10-01 | 任务重复规则（Recurring Tasks） | P0     | 4h   | 功能深化 |
| P10-02 | AI 助手对话记忆 + 多轮操作      | P1     | 3h   | 功能深化 |
| P10-03 | 任务列表虚拟滚动                | P1     | 3h   | 功能深化 |
| P10-04 | 搜索体验增强（高亮 + 历史）     | P2     | 2h   | 功能深化 |
| P10-05 | 详情面板滑入动画 + 过渡统一     | P1     | 2h   | UI/UX    |
| P10-06 | 右键菜单键盘导航                | P2     | 2h   | UI/UX    |
| P10-07 | 暗色模式对比度修复              | P2     | 2h   | UI/UX    |
| P10-08 | 全局 Loading + 骨架屏           | P2     | 2h   | UI/UX    |
| P10-09 | 清理依赖 + 修复 Playwright      | P1     | 2h   | 架构     |
| P10-10 | 快捷键自定义读取                | P2     | 2h   | 架构     |
| P10-11 | Rust 拆分 + 事务安全            | P2     | 2h   | 架构     |

**总计**：11 个任务，~26h（建议 2-3 天完成）

---

## 四、执行顺序建议

### 第一批（功能深化核心）

1. P10-01 任务重复规则（最具价值的新功能）
2. P10-09 清理依赖 + 修复 Playwright（为后续开发清理环境）
3. P10-03 任务列表虚拟滚动（性能基础）

### 第二批（体验打磨）

4. P10-05 详情面板滑入动画
5. P10-07 暗色模式对比度修复
6. P10-04 搜索体验增强

### 第三批（AI + 架构收尾）

7. P10-02 AI 对话记忆
8. P10-06 右键菜单键盘导航
9. P10-08 全局 Loading + 骨架屏
10. P10-10 快捷键自定义读取
11. P10-11 Rust 拆分 + 事务安全

---

## 五、验收标准

| 检查项                | 要求                                                                |
| --------------------- | ------------------------------------------------------------------- |
| `npx tsc --noEmit`    | ✅ 无错误                                                           |
| `cargo check`         | ✅ 无错误                                                           |
| `npx vitest run`      | ✅ 全部通过（且不再收集 `tests/*.spec.ts`）                         |
| `npx playwright test` | ✅ 至少 3 个 E2E 用例通过                                           |
| 单元测试覆盖          | 新增功能（repeat.ts / aiStore.ts / searchHighlight.ts）需有对应测试 |
| 视觉验收              | 暗色模式下所有文字对比度 ≥ 4.5:1                                    |
| 性能                  | 500 条任务滚动 FPS > 50                                             |

---

## 六、给 workbuddy 的指令建议

```
请按照 Phase 10 优化文档执行，项目路径：C:\Users\50441\Documents\trae开发\滴答清单复刻

执行顺序：
1. P10-09 清理依赖 + 修复 Playwright（先清理环境）
2. P10-01 任务重复规则（核心新功能）
3. P10-03 任务列表虚拟滚动
4. P10-05 详情面板滑入动画
5. P10-07 暗色模式对比度修复
6. P10-04 搜索体验增强
7. P10-02 AI 对话记忆
8. P10-06 右键菜单键盘导航
9. P10-08 全局 Loading + 骨架屏
10. P10-10 快捷键自定义读取
11. P10-11 Rust 拆分 + 事务安全

要求：
- 每个任务完成后运行 npx tsc --noEmit 和 npx vitest run 确保无回归
- 新增功能需有对应单元测试
- 提交信息格式：feat: P10-XX 任务描述
- 完成后打 tag v1.31.0 并推送

文档路径：C:\Users\50441\.qclaw\workspace\dida_clone_phase10_20260630.md
```
