# 滴答清单复刻 Phase 8 优化文档

**日期**：2026-06-30
**当前版本**：v1.28.0
**目标版本**：v1.29.0
**工时**：~10h

---

## 一、当前状态

### 1.1 已完成版本总览

| 版本    | 说明                                                |
| ------- | --------------------------------------------------- |
| v1.28.0 | UI/UX 全面优化（颜色变量、ConfirmDialog、动画体系） |
| v1.27.0 | Phase 7 Bug 修复 + 架构收尾                         |
| v1.26.0 | Phase 6 Git 数据同步 + Rust 文件收尾                |
| v1.25.0 | Phase 5 主题系统重构                                |
| v1.24.0 | Phase 4 AI流式+导出+CI                              |
| v1.23.0 | Phase 3 深度优化（测试+习惯SQLite）                 |
| v1.22.0 | Phase 2 架构重构                                    |
| v1.21.1 | Phase 1 Bug修复                                     |

### 1.2 编译状态

| 检查项       | 结果      |
| ------------ | --------- |
| tsc --noEmit | ✅ 通过   |
| cargo check  | ✅ 通过   |
| 测试用例     | ✅ 190 个 |

### 1.3 待优化点

**7 个超 300 行 .tsx 文件**：

| 文件                | 行数 | 拆分建议                     |
| ------------------- | ---- | ---------------------------- |
| CalendarView.tsx    | 435  | 拆出视图切换逻辑/共享工具    |
| TaskContextMenu.tsx | 429  | 拆出菜单项定义/子菜单组件    |
| HabitCard.tsx       | 387  | 拆出打卡日历/统计/操作按钮   |
| DayView.tsx         | 383  | 拆出时间格计算/任务块渲染    |
| AppearancePanel.tsx | 338  | 拆出字体/主题/密度子面板     |
| SystemPanel.tsx     | 322  | 拆出数据导出/导入/清理子面板 |
| HabitView.tsx       | 309  | 拆出习惯列表/创建表单        |

**其他可优化**：

- `api.ts` 387 行：按模块拆分（task/habit/sync/list/tag）
- `StatsView.tsx` 243 行：可拆出统计卡片组件
- 缺少 e2e 测试
- 缺少快捷键帮助面板

---

## 二、Phase 8 任务清单

### 方向 A：代码拆分（7 个文件）

#### P8-01 拆分 CalendarView.tsx（435→<250 行）

**目标**：将视图切换逻辑和共享工具拆出
**拆分方案**：

```
src/components/CalendarView.tsx（主组件，<200 行）
├── src/components/calendar/ViewSwitcher.tsx（已有，可复用）
├── src/components/calendar/CalendarToolbar.tsx（工具栏）
├── src/components/calendar/ViewRenderer.tsx（视图分发）
└── src/utils/calendarUtils.ts（日期计算工具）
```

**工时**：2h | **推荐模型**：GLM 5.2

#### P8-02 拆分 TaskContextMenu.tsx（429→<250 行）

**目标**：拆出菜单项定义和子菜单组件
**拆分方案**：

```
src/components/task-item/TaskContextMenu.tsx（主组件，<200 行）
├── src/components/task-item/menu/DateMenu.tsx（日期子菜单）
├── src/components/task-item/menu/PriorityMenu.tsx（优先级子菜单）
├── src/components/task-item/menu/TagMenu.tsx（标签子菜单）
└── src/components/task-item/menu/menuItems.ts（菜单项配置）
```

**工时**：1.5h | **推荐模型**：Flash

#### P8-03 拆分 HabitCard.tsx（387→<250 行）

**目标**：拆出打卡日历、统计和操作按钮
**拆分方案**：

```
src/components/habit/HabitCard.tsx（主组件，<200 行）
├── src/components/habit/HabitCalendar.tsx（已有 HabitCalendar，扩展）
├── src/components/habit/HabitStats.tsx（统计展示）
└── src/components/habit/HabitActions.tsx（操作按钮）
```

**工时**：1.5h | **推荐模型**：Flash

#### P8-04 拆分 DayView.tsx（383→<250 行）

**目标**：拆出时间格计算和任务块渲染
**拆分方案**：

```
src/components/calendar/DayView.tsx（主组件，<200 行）
├── src/components/calendar/DayViewGrid.tsx（时间网格）
├── src/components/calendar/DayViewTask.tsx（任务块渲染）
└── src/utils/dayViewUtils.ts（时间计算）
```

**工时**：1.5h | **推荐模型**：GLM 5.2

#### P8-05 拆分 AppearancePanel.tsx + SystemPanel.tsx（660→<400 行）

**目标**：拆分设置面板子模块
**拆分方案**：

```
src/components/settings/AppearancePanel.tsx（主面板，<150 行）
├── src/components/settings/appearance/FontPanel.tsx
├── src/components/settings/appearance/ThemePanel.tsx
└── src/components/settings/appearance/DensityPanel.tsx

src/components/settings/SystemPanel.tsx（主面板，<150 行）
├── src/components/settings/system/DataPanel.tsx
├── src/components/settings/system/CleanupPanel.tsx
└── src/components/settings/system/ExportPanel.tsx
```

**工时**：2h | **推荐模型**：Flash

#### P8-06 拆分 HabitView.tsx（309→<200 行）

**目标**：拆出习惯列表和创建表单
**拆分方案**：

```
src/components/habit/HabitView.tsx（主组件，<150 行）
├── src/components/habit/HabitList.tsx（列表）
└── src/components/habit/CreateHabitForm.tsx（已有，可复用）
```

**工时**：1h | **推荐模型**：Flash

#### P8-07 拆分 api.ts（387→<200 行）

**目标**：按模块拆分 API 调用
**拆分方案**：

```
src/api.ts（统一导出，<50 行）
├── src/api/taskApi.ts（任务相关）
├── src/api/habitApi.ts（习惯相关）
├── src/api/syncApi.ts（同步相关）
├── src/api/listApi.ts（清单相关）
└── src/api/tagApi.ts（标签相关）
```

**工时**：1h | **推荐模型**：Flash

### 方向 B：功能增强（2 个任务）

#### P8-08 快捷键帮助面板

**目标**：按 `?` 或 `F1` 弹出快捷键速查面板
**实现**：

- 新建 `src/components/ShortcutsHelp.tsx`
- 收集所有快捷键定义到 `src/utils/shortcuts.ts`
- 在 TitleBar 添加帮助按钮
  **工时**：1h | **推荐模型**：Flash

#### P8-09 任务详情面板增强

**目标**：详情面板支持 markdown 预览模式切换
**实现**：

- TaskNotes.tsx 添加编辑/预览切换按钮
- 支持实时预览（react-markdown 已有）
- 记住用户的偏好（编辑/预览模式）
  **工时**：1h | **推荐模型**：Flash

---

## 三、执行批次

| 批次     | 内容                                                    | 推荐模型 | 工时       |
| -------- | ------------------------------------------------------- | -------- | ---------- |
| 第 1 批  | P8-01 + P8-04（CalendarView + DayView，日历相关一起拆） | GLM 5.2  | 3.5h       |
| 第 2 批  | P8-02 + P8-03 + P8-06（菜单 + 习惯相关）                | Flash    | 4h         |
| 第 3 批  | P8-05 + P8-07（设置面板 + API 拆分）                    | Flash    | 3h         |
| 第 4 批  | P8-08 + P8-09（功能增强）                               | Flash    | 2h         |
| **合计** | **9 个任务**                                            |          | **~12.5h** |

---

## 四、验收清单

### 4.1 代码拆分验收

- [ ] 所有 .tsx 文件 < 300 行
- [ ] api.ts < 200 行
- [ ] tsc --noEmit 通过
- [ ] cargo check 通过
- [ ] 现有 190 个测试全部通过
- [ ] 拆分后功能无回归（手动验证核心流程）

### 4.2 功能增强验收

- [ ] 快捷键帮助面板可正常弹出
- [ ] 快捷键帮助内容完整准确
- [ ] 任务详情 markdown 预览/编辑切换正常
- [ ] 用户偏好可持久化

### 4.3 版本发布验收

- [ ] package.json / tauri.conf.json / Cargo.toml 版本号一致（1.29.0）
- [ ] README badge 版本号更新
- [ ] README changelog 更新
- [ ] git commit + push 到 main 分支
- [ ] GitHub Actions CI 通过

---

## 五、给 workbuddy 的指令建议

```
请按以下顺序执行 Phase 8 优化：

第 1 批（GLM 5.2）：
1. 拆分 CalendarView.tsx（435→<250 行）：拆出 CalendarToolbar.tsx + ViewRenderer.tsx + calendarUtils.ts
2. 拆分 DayView.tsx（383→<250 行）：拆出 DayViewGrid.tsx + DayViewTask.tsx + dayViewUtils.ts

第 2 批（Flash）：
3. 拆分 TaskContextMenu.tsx（429→<250 行）：拆出 DateMenu.tsx + PriorityMenu.tsx + TagMenu.tsx + menuItems.ts
4. 拆分 HabitCard.tsx（387→<250 行）：拆出 HabitStats.tsx + HabitActions.tsx（复用已有 HabitCalendar.tsx）
5. 拆分 HabitView.tsx（309→<200 行）：拆出 HabitList.tsx

第 3 批（Flash）：
6. 拆分 AppearancePanel.tsx（338→<150 行）+ SystemPanel.tsx（322→<150 行）：各拆出 3 个子面板
7. 拆分 api.ts（387→<200 行）：按 task/habit/sync/list/tag 模块拆分

第 4 批（Flash）：
8. 新增快捷键帮助面板：ShortcutsHelp.tsx + shortcuts.ts，TitleBar 添加帮助按钮
9. TaskNotes.tsx 添加 markdown 编辑/预览切换

验收标准：
- 所有 .tsx < 300 行，api.ts < 200 行
- tsc --noEmit + cargo check + 190 个测试全部通过
- 版本号统一为 1.29.0，README 更新

注意：
- 拆分时保持功能完全不变，仅做结构性重构
- 每拆完一个文件就跑一次 tsc + vitest 确保无回归
- 不要修改任何业务逻辑，只做代码组织优化
```

---

## 六、附录：当前文件行数分布

### 6.1 前端文件（Top 15）

| 文件                | 行数 | 状态    |
| ------------------- | ---- | ------- |
| CalendarView.tsx    | 435  | ⚠️ 待拆 |
| TaskContextMenu.tsx | 429  | ⚠️ 待拆 |
| api.ts              | 387  | ⚠️ 待拆 |
| HabitCard.tsx       | 387  | ⚠️ 待拆 |
| DayView.tsx         | 383  | ⚠️ 待拆 |
| AppearancePanel.tsx | 338  | ⚠️ 待拆 |
| SystemPanel.tsx     | 322  | ⚠️ 待拆 |
| HabitView.tsx       | 309  | ⚠️ 待拆 |
| QuadrantView.tsx    | 295  | ✅      |
| SubtaskList.tsx     | 284  | ✅      |
| TaskItem.tsx        | 280  | ✅      |
| PomodoroView.tsx    | 280  | ✅      |
| TaskListPanel.tsx   | 279  | ✅      |
| ListSection.tsx     | 279  | ✅      |
| AIAssistant.tsx     | 273  | ✅      |

### 6.2 Rust 文件（全部 < 300 行 ✅）

| 文件              | 行数 |
| ----------------- | ---- |
| habit_commands.rs | 258  |
| db.rs             | 207  |
| task_ops.rs       | 201  |
| sync_ops.rs       | 189  |
| llm.rs            | 184  |

### 6.3 测试统计

| 指标               | 值   |
| ------------------ | ---- |
| 测试文件数         | 13   |
| 测试用例数         | 190  |
| 测试覆盖率（估算） | ~60% |
