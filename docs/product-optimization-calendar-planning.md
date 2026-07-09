# 日历规划能力与视图过滤优化可执行操作文档

> 适用阶段：v1.38.0 日历规划体验增强  
> 执行方式：按模块分阶段顺序开发。每个阶段完成后先完成本阶段验证，再进入下一阶段。  
> 范围：日历过滤、Agenda 日程列表、日历工具栏、AI 排程入口参数化。

## 1. 项目现状总结

日历入口为 `src/components/CalendarView.tsx`，工具栏为 `src/components/calendar/CalendarToolbar.tsx`，视图分发为 `src/components/calendar/ViewRenderer.tsx`。当前已包含月视图、周视图、日视图、甘特图、看板，并已支持全天/跨天任务展示、重叠任务布局和任务拖拽。

| 编号 | 问题描述 | 影响范围 | 复现路径 |
|---|---|---|---|
| C-01 | 日历没有清单、标签、优先级、完成状态过滤器。 | 月/周/日/甘特/看板所有日历子视图 | 进入日历，尝试只查看某个清单或标签的任务，当前无入口。 |
| C-02 | 没有 Agenda 日程列表视图，任务密集时只能在网格中阅读。 | 密集任务日、窄屏、移动端抽屉模式 | 在同一周创建多条任务后，切换月/周/日视图查看。 |
| C-03 | AI 排程按钮固定填入“帮我安排明天的任务”，不能选择排程日期、工作时间或候选任务范围。 | AI 排程、日历规划 | 点击日历工具栏“AI 排程”，直接跳转 AI 助手。 |
| C-04 | 工具栏同时平铺月/周/日/看板/甘特，窄屏下按钮密度偏高。 | 平板和窄屏日历 UI | 缩小窗口宽度到 480-768px，观察工具栏。 |

## 2. 优化方案

| 编号 | 优先级 | 优化策略 | 优化目标 | 预期效果 |
|---|---|---|---|---|
| C-01 | P0 | 新增日历过滤 store、过滤纯函数和工具栏过滤菜单。 | 统一在 CalendarView 层过滤任务。 | 高任务量日历可读性提升。 |
| C-02 | P1 | 新增 `agenda` viewMode 和 `AgendaView.tsx`。 | 用列表方式查看连续日期内的日程。 | 密集任务和窄屏场景更易扫描。 |
| C-03 | P2 | AI 排程按钮先弹出配置面板，再生成 prompt。 | 让排程范围和约束可控。 | 减少 AI 排程误改任务时间。 |
| C-04 | P2 | 工具栏只平铺月/周/日，Agenda/甘特/看板放入更多菜单。 | 降低工具栏拥挤。 | 480px 宽度下不溢出。 |

## 3. 执行步骤

### 阶段 0：开发前置检查

```bash
git status --short --branch
git pull --ff-only
```

如果工作区有未提交改动或快进失败，停止执行。

### 阶段 1：扩展 ViewMode 与视图分发

涉及文件：

- `src/utils/calendarUtils.ts`
- `src/components/calendar/ViewRenderer.tsx`
- `src/components/calendar/CalendarToolbar.tsx`

操作：

1. 在 `ViewMode` 中增加 `'agenda'`。
2. 在 `ViewRenderer` 中增加 `agenda` 分支，渲染 `AgendaView`。
3. 工具栏更多菜单增加“日程列表”。
4. 默认视图仍保持 `month`，不能改变现有首次进入行为。

### 阶段 2：新增日历过滤状态与纯函数

新增文件：

- `src/stores/calendarStore.ts`
- `src/utils/calendarFilters.ts`

`CalendarFilters` 字段：

```ts
interface CalendarFilters {
  listId: number | null
  tagId: number | null
  priority: number | null
  showCompleted: boolean
  allDayOnly: boolean
}
```

默认值：`listId/tagId/priority` 为 `null`，`showCompleted: true`，`allDayOnly: false`。  
`filterCalendarTasks(tasks, filters)` 必须是纯函数，不读取 store。

### 阶段 3：实现过滤工具栏菜单

新增文件：`src/components/calendar/CalendarFilterMenu.tsx`

修改文件：

- `src/components/calendar/CalendarToolbar.tsx`
- `src/components/CalendarView.tsx`

菜单字段：清单下拉、标签下拉、优先级下拉、显示已完成 toggle、仅全天 toggle、重置按钮。  
激活任一条件时，过滤按钮必须显示激活态。

### 阶段 4：在 CalendarView 统一过滤任务

修改文件：`src/components/CalendarView.tsx`

修改前：

```tsx
<ViewRenderer tasks={tasks} ... />
<TaskSidebar tasks={tasks} ... />
```

修改后：

```tsx
const visibleTasks = useMemo(() => filterCalendarTasks(tasks, filters), [tasks, filters])
<ViewRenderer tasks={visibleTasks} ... />
<TaskSidebar tasks={visibleTasks} ... />
```

注意事项：过滤只影响展示和侧边栏候选任务，不改变数据库任务。

### 阶段 5：实现 AgendaView

新增文件：`src/components/calendar/AgendaView.tsx`

功能要求：

1. 默认展示当前日期起 14 天。
2. 使用 `getOccurrencesForRange` 获取任务 occurrence。
3. 按 `dateKey` 分组。
4. 每天分为全天任务和定时任务两段。
5. 定时任务按 `start` 升序。
6. 支持点击任务、勾选完成、空状态。

### 阶段 6：AI 排程入口参数化

新增文件：`src/components/calendar/AIScheduleMenu.tsx`

修改文件：`src/components/calendar/CalendarToolbar.tsx`

菜单字段：排程日期、工作开始时间、工作结束时间、是否包含无日期任务、是否仅排当前过滤结果。  
点击确认后，将配置拼成 `aiPresetMessage`，再跳转 AI 助手。

## 4. 代码修改规则

| 改动 | 文件完整路径 | 修改前 | 修改后 |
|---|---|---|---|
| ViewMode | `src/utils/calendarUtils.ts` | 无 `agenda` | 增加 `agenda` 类型 |
| 视图分发 | `src/components/calendar/ViewRenderer.tsx` | 只分发 month/week/day/gantt/kanban | 增加 AgendaView 分支 |
| 过滤状态 | `src/stores/calendarStore.ts` | 不存在 | 新增独立 Zustand store |
| 过滤函数 | `src/utils/calendarFilters.ts` | 不存在 | 新增纯函数，不读写 store |
| 过滤菜单 | `src/components/calendar/CalendarFilterMenu.tsx` | 不存在 | 新增可重置过滤菜单 |
| 日程列表 | `src/components/calendar/AgendaView.tsx` | 不存在 | 新增 14 天日程列表 |
| 日历容器 | `src/components/CalendarView.tsx` | 透传全部 tasks | 透传 filtered visibleTasks |
| AI 排程 | `src/components/calendar/CalendarToolbar.tsx` | 固定 prompt | 使用配置面板生成 prompt |

禁止事项：禁止复制 occurrence 拆分逻辑；禁止在各视图内重复实现过滤；禁止破坏月/周/日拖拽、resize、快速创建行为。

## 5. 验证标准

### 必跑命令

```bash
npm run typecheck
npm test
npm run lint
npm run test:e2e -- tests/calendar-view.spec.ts
```

### 目标测试文件

- 新增 `src/utils/__tests__/calendarFilters.test.ts`
- 新增 `src/components/calendar/__tests__/AgendaView.test.tsx`
- 更新 `src/components/calendar/__tests__/MonthView.test.tsx`
- 更新 `src/components/calendar/__tests__/WeekView.test.tsx`
- 更新 `src/components/__tests__/DayView.test.tsx`

### 可量化验收项

| 验收项 | 标准 |
|---|---|
| 清单过滤 | 只渲染目标 `list_id` 的任务 |
| 标签过滤 | 只渲染包含目标 `tag_id` 的任务 |
| 优先级过滤 | 只渲染对应 `priority` 的任务 |
| 隐藏已完成 | `completed=true` 任务不渲染 |
| Agenda 范围 | 默认只展示今天起 14 天内 occurrence |
| Agenda 排序 | 同一天定时任务按开始时间升序 |
| 工具栏窄屏 | 480px 宽度下按钮不换行、不溢出父容器 |
