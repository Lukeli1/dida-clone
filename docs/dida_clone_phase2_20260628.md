# 滴答清单复刻 — Phase 2 架构重构文档

**生成日期**：2026-06-28 20:30 (Asia/Shanghai)
**当前版本**：v1.21.1（已验收，未 commit）
**前置条件**：Phase 1 完成（get_tasks 过滤参数 + withGlobalTauri 关闭）
**项目路径**：`C:\Users\50441\Documents\trae开发\滴答清单复刻`

---

## 一、Phase 2 目标

**把 5 个超大文件拆成可维护的小模块，不改变任何功能行为。**

| 指标 | 当前 | 目标 |
|---|---|---|
| >500 行的文件 | 6 个 | 0 个 |
| >300 行的组件 | 10 个 | ≤3 个 |
| App.tsx | 778 行 | ≤200 行 |
| HabitView.tsx | 1439 行 | ≤300 行 |
| SettingsView.tsx | 842 行 | ≤200 行 |
| useTaskActions.ts | 467 行 | ≤100 行（聚合 re-export） |
| llm.ts | 492 行 | ≤150 行 |

**原则**：纯重构，零功能变更，零行为变更。拆完后 `tsc --noEmit` + `cargo check` + 全量功能回归通过。

---

## 二、当前问题诊断（v1.21.1 基线）

### 2.1 文件行数排行

| 文件 | 行数 | 问题 |
|---|---|---|
| `HabitView.tsx` | 1439 | 类型定义+常量+列表+卡片+编辑器+日历+统计全塞一个文件 |
| `SettingsView.tsx` | 842 | 6 个设置模块平铺，每个模块逻辑耦合 |
| `App.tsx` | 778 | God Component，37 个 selector + 20 个 action + JSX 路由 |
| `Sidebar.tsx` | 722 | 清单管理+标签管理+视图切换+底部设置区全在一起 |
| `TaskDetail.tsx` | 712 | 任务详情+子任务+备注+标签+附件+评论全在一起 |
| `TaskItem.tsx` | 707 | 任务行+内联编辑+批量选择+拖拽+右键菜单+子任务展开 |
| `WeekView.tsx` | 600 | 周视图+任务条渲染+拖拽+点击交互 |
| `PomodoroView.tsx` | 572 | 番茄钟+统计+设置+任务选择 |
| `MonthView.tsx` | 531 | 月视图+任务条+拖拽 |
| `AIAssistant.tsx` | 430 | 对话+技能+操作解析 |
| `useTaskActions.ts` | 467 | 26 个 action 挤一个 hook |
| `llm.ts` | 492 | 10 个 prompt 模板内联 |

### 2.2 架构问题

1. **App.tsx 是 God Component**：37 个 store selector、20+ 个 action、3 个 useState、2 个 useRef、JSX 里 5 层嵌套条件渲染
2. **HabitView 一个文件装了 5 个组件**：列表、卡片、编辑器、日历、统计
3. **SettingsView 6 个面板平铺**：外观/通用/通知/AI/系统/关于
4. **useTaskActions 26 个函数**：CRUD+批量+拖拽+子任务+内联编辑全混一起
5. **llm.ts 10 个 prompt 内联**：修改 prompt 要在 492 行里找

---

## 三、任务清单（6 个任务，按风险从低到高排序）

### P2-01：拆分 `llm.ts` → 11 个文件（风险：极低）

**当前**：`src/utils/llm.ts` 492 行，10 个技能 prompt 内联

**目标**：核心调用逻辑 ≤150 行，每个 prompt 独立文件

**拆分方案**：
```
src/utils/
├── llm.ts (150 行) — 核心调用/配置/错误处理/流式接口
└── prompts/
    ├── index.ts (20 行) — re-export 所有 prompt
    ├── todaySummary.ts (30 行)
    ├── weeklyReport.ts (40 行)
    ├── smartSearch.ts (30 行)
    ├── autoTag.ts (30 行)
    ├── timeEstimate.ts (30 行)
    ├── conflictDetect.ts (40 行)
    ├── smartSort.ts (30 行)
    ├── taskTemplate.ts (40 行)
    ├── taskBreakdown.ts (40 行)
    └── prioritySuggest.ts (30 行)
```

**操作步骤**：
1. 创建 `src/utils/prompts/` 目录
2. 从 `llm.ts` 中提取每个 prompt 函数到独立文件
3. `prompts/index.ts` 统一 re-export
4. `llm.ts` 改为 `import { todaySummary, weeklyReport, ... } from './prompts'`
5. 删除 `llm.ts` 中的 prompt 原代码
6. 验证：`tsc --noEmit` 通过

**验收**：
- [ ] `llm.ts` ≤ 150 行
- [ ] 每个 prompt 文件 ≤ 50 行
- [ ] 所有 import 路径正确
- [ ] `tsc --noEmit` 通过
- [ ] AI 助手功能不变（所有技能仍可用）

---

### P2-02：拆分 `useTaskActions.ts` → 5 个文件（风险：低）

**当前**：`src/hooks/useTaskActions.ts` 467 行，26 个 action

**目标**：主文件 ≤100 行（聚合 re-export），每个子 hook ≤120 行

**拆分方案**：
```
src/hooks/
├── useTaskActions.ts (100 行) — 聚合 re-export + 返回统一 actions 对象
├── useTaskCRUD.ts (120 行) — 创建/删除/复制/归档/取消归档
├── useTaskReorder.ts (80 行) — 拖拽排序/移动到其他清单
├── useTaskBatch.ts (100 行) — 批量选择/批量删除/批量归档/批量改优先级
├── useTaskSubtask.ts (80 行) — 创建子任务/切换子任务/删除子任务
└── useTaskInlineEdit.ts (60 行) — 内联编辑标题/设置日期/设置优先级/置顶/切换标签
```

**操作步骤**：
1. 按职责把 26 个函数分到 5 个子 hook
2. 每个子 hook 返回自己的函数集合
3. `useTaskActions.ts` 调用 5 个子 hook，合并返回
4. 保持返回值结构不变（`actions.handleXxx` 调用方式不变）
5. 验证：`tsc --noEmit` 通过

**依赖关系**：
- `useTaskCRUD` 和 `useTaskReorder` 无互相依赖
- `useTaskBatch` 依赖 `useTaskCRUD` 的 delete/archive
- `useTaskSubtask` 独立
- `useTaskInlineEdit` 独立

**验收**：
- [ ] `useTaskActions.ts` ≤ 100 行
- [ ] 每个子 hook ≤ 120 行
- [ ] `App.tsx` 里的 `actions.handleXxx` 调用方式不变
- [ ] `tsc --noEmit` 通过
- [ ] 任务增删改查/拖拽/批量操作/子任务/内联编辑全部正常

---

### P2-03：拆分 `HabitView.tsx` → 5 个文件（风险：中）

**当前**：`src/components/HabitView.tsx` 1439 行

**目标**：主文件 ≤300 行，每个子组件 ≤300 行

**拆分方案**：
```
src/components/habit/
├── HabitView.tsx (250 行) — 容器：状态管理 + 列表渲染 + 新建表单
├── HabitCard.tsx (300 行) — 单个习惯卡片：展示 + 打卡 + 7 天日历
├── HabitEditor.tsx (350 行) — 编辑弹窗：名称/图标/颜色/目标/单位
├── HabitIconPicker.tsx (200 行) — 图标选择器弹窗：emoji 网格 + 自定义文字
├── HabitFocusTimer.tsx (150 行) — 专注计时器弹窗
└── constants.ts (100 行) — PRESET_EMOJIS / PRESET_COLORS / ICON_PRESETS / STORAGE_KEY
```

**操作步骤**：
1. 创建 `src/components/habit/` 目录
2. 提取常量到 `constants.ts`
3. 提取图标选择器到 `HabitIconPicker.tsx`（含 emoji 网格 + 文字图标输入）
4. 提取专注计时器到 `HabitFocusTimer.tsx`
5. 提取编辑弹窗到 `HabitEditor.tsx`（引用 HabitIconPicker）
6. 提取卡片到 `HabitCard.tsx`（引用 HabitFocusTimer）
7. 主文件 `HabitView.tsx` 只保留容器逻辑 + 列表渲染 + 新建表单
8. 更新 `App.tsx` 的 import 路径：`from './components/HabitView'` → `from './components/habit/HabitView'`
9. 验证：`tsc --noEmit` 通过

**注意**：
- HabitView 用 localStorage 存储数据，这次**不迁移到 SQLite**（那是 Phase 3 的事）
- 所有 props/state 类型定义跟着组件走
- 右键菜单逻辑跟着 HabitCard 走

**验收**：
- [ ] `HabitView.tsx` ≤ 300 行
- [ ] 每个子组件 ≤ 350 行
- [ ] 习惯打卡/编辑/删除/归档/专注计时器全部正常
- [ ] 图标选择器（emoji + 自定义文字）正常
- [ ] `tsc --noEmit` 通过

---

### P2-04：拆分 `SettingsView.tsx` → 7 个文件（风险：中）

**当前**：`src/components/SettingsView.tsx` 842 行

**目标**：主文件 ≤150 行，每个面板 ≤250 行

**拆分方案**：
```
src/components/settings/
├── SettingsView.tsx (120 行) — Tab 容器 + 面板切换
├── AppearancePanel.tsx (150 行) — 深色模式/字体/密度
├── GeneralPanel.tsx (100 行) — 通用设置
├── NotificationPanel.tsx (100 行) — 通知/提醒
├── LLMApiPanel.tsx (250 行) — 大模型 API 配置（最复杂）
├── SystemPanel.tsx (80 行) — 开机自启/数据导出
└── AboutPanel.tsx (50 行) — 应用信息
```

**操作步骤**：
1. 创建 `src/components/settings/` 目录
2. 按 Tab 分割代码到各面板文件
3. 每个面板独立 export，接收必要的 props（或直接用 store）
4. `SettingsView.tsx` 只保留 Tab 状态 + 面板切换
5. 更新 `App.tsx` 的 import 路径
6. 验证：`tsc --noEmit` 通过

**注意**：
- LLMApiPanel 最复杂（API 配置/测试连接/模型选择/厂商管理），保持完整逻辑不拆
- 各面板共享的状态（如主题设置）通过 store 传递，不走 props

**验收**：
- [ ] `SettingsView.tsx` ≤ 150 行
- [ ] `LLMApiPanel.tsx` ≤ 250 行
- [ ] 每个面板功能正常（切换设置项立即生效）
- [ ] 深色模式/字体切换/密度切换正常
- [ ] AI API 配置/测试连接正常
- [ ] `tsc --noEmit` 通过

---

### P2-05：拆分 `TaskDetail.tsx` → 4 个文件（风险：中）

**当前**：`src/components/TaskDetail.tsx` 712 行

**目标**：主文件 ≤250 行，每个子组件 ≤250 行

**拆分方案**：
```
src/components/detail/
├── TaskDetail.tsx (200 行) — 容器：任务基本信息 + 子组件编排
├── SubtaskList.tsx (200 行) — 子任务列表：增删改查 + 双击编辑 + 进度统计
├── TaskNotes.tsx (150 行) — 备注区：Markdown 编辑 + 预览切换
└── TaskMetaPanel.tsx (150 行) — 日期/优先级/标签/附件/链接
```

**操作步骤**：
1. 创建 `src/components/detail/` 目录
2. 提取子任务列表到 `SubtaskList.tsx`
3. 提取备注区到 `TaskNotes.tsx`（含 Markdown 编辑/预览）
4. 提取元信息面板到 `TaskMetaPanel.tsx`（日期选择器/优先级/标签管理）
5. 主文件只保留容器 + 任务标题/备注等基本信息
6. 更新 `App.tsx` 的 import 路径
7. 验证：`tsc --noEmit` 通过

**验收**：
- [ ] `TaskDetail.tsx` ≤ 250 行
- [ ] 子任务增删改查/双击编辑/进度统计正常
- [ ] Markdown 备注编辑/预览正常
- [ ] 日期/优先级/标签设置正常
- [ ] `tsc --noEmit` 通过

---

### P2-06：拆分 `App.tsx` → 5 个文件（风险：高，最后做）

**当前**：`src/App.tsx` 778 行

**目标**：主文件 ≤200 行，每个子组件 ≤200 行

**拆分方案**：
```
src/
├── App.tsx (150 行) — 布局容器 + Provider + 视图路由
├── components/
│   ├── TaskListPanel.tsx (200 行) — 任务列表区：输入栏 + 列表 + 批量工具栏 + 过滤栏
│   ├── DetailPanel.tsx (120 行) — 右侧详情区：TaskDetail 或空状态
│   └── CalendarPanel.tsx (100 行) — 日历视图区：路由到 Month/Week/Day/Gantt
├── hooks/
│   ├── useTaskListState.ts (100 行) — 列表状态：newTaskTitle + 过滤 + 搜索 + 批量
│   └── useTaskListActions.ts (150 行) — 列表专属 action：创建/选择/批量操作
```

**操作步骤**：
1. 先做 P2-01 ~ P2-05（降低 App.tsx 的依赖复杂度）
2. 提取 `useTaskListState.ts`：把 App.tsx 里的 newTaskTitle + 搜索 + 批量选择 + 过滤逻辑集中
3. 提取 `useTaskListActions.ts`：把 App.tsx 里的 handleCreateTask / selectAllTasks 等列表专属 action 集中
4. 提取 `TaskListPanel.tsx`：把任务列表区域的 JSX + 逻辑搬过去
5. 提取 `DetailPanel.tsx`：把右侧详情区域的 JSX 搬过去
6. 提取 `CalendarPanel.tsx`：把日历视图的 JSX 路由搬过去
7. `App.tsx` 只保留：TitleBar + Sidebar + 视图路由（currentView switch）+ Provider
8. 验证：`tsc --noEmit` + 全量功能回归

**注意**：
- 这是风险最高的任务，因为 App.tsx 是所有组件的汇聚点
- **必须最后做**，等 P2-01 ~ P2-05 把子组件拆完后，App.tsx 的依赖才足够清晰
- 拆完后 App.tsx 应该只有布局 + 路由，不直接持有任何业务状态

**验收**：
- [ ] `App.tsx` ≤ 200 行
- [ ] 没有任何组件超过 500 行
- [ ] 所有视图切换正常（今日/全部/日历/看板/四象限/番茄钟/习惯/统计/设置/归档）
- [ ] 任务增删改查/拖拽/批量/搜索/过滤全部正常
- [ ] AI 助手/番茄钟/习惯打卡全部正常
- [ ] `tsc --noEmit` 通过

---

## 四、执行顺序 & 里程碑

```
第 1 批（低风险，~8h）：
  P2-01 拆分 llm.ts           (2h)
  P2-02 拆分 useTaskActions    (3h)
  → 验收点 A：tsc + 功能测试

第 2 批（中风险，~12h）：
  P2-03 拆分 HabitView         (4h)
  P2-04 拆分 SettingsView      (3h)
  P2-05 拆分 TaskDetail        (3h)
  → 验收点 B：tsc + 功能测试

第 3 批（高风险，~4h）：
  P2-06 拆分 App.tsx           (4h)
  → 验收点 C：tsc + 全量回归测试
```

**每批完成后**：
1. `tsc --noEmit` 通过
2. `npm run dev` 启动应用手动测试
3. git commit（不要一次提交太多）
4. 推 GitHub

---

## 五、给 workbuddy / Trae 的指令建议

### 第 1 批指令（P2-01 + P2-02，可并行）

```
# P2-01：拆分 llm.ts
"重构 src/utils/llm.ts。当前 492 行，10 个技能 prompt 内联。
步骤：
1) 创建 src/utils/prompts/ 目录
2) 把每个 prompt 函数提取到独立文件（todaySummary.ts / weeklyReport.ts / smartSearch.ts / autoTag.ts / timeEstimate.ts / conflictDetect.ts / smartSort.ts / taskTemplate.ts / taskBreakdown.ts / prioritySuggest.ts）
3) 创建 prompts/index.ts 统一 re-export
4) llm.ts 改为从 ./prompts import，只保留核心调用逻辑
5) 目标：llm.ts ≤ 150 行，每个 prompt 文件 ≤ 50 行
6) tsc --noEmit 通过
不修改任何 prompt 内容，不修改函数签名，纯文件拆分。"

# P2-02：拆分 useTaskActions.ts
"重构 src/hooks/useTaskActions.ts。当前 467 行，26 个 action 函数。
步骤：
1) 按职责拆分为 5 个子 hook：
   - useTaskCRUD.ts（创建/删除/复制/归档/取消归档）
   - useTaskReorder.ts（拖拽排序/移动清单）
   - useTaskBatch.ts（批量选择/批量删除/批量归档/批量优先级）
   - useTaskSubtask.ts（子任务增删改查）
   - useTaskInlineEdit.ts（内联编辑/日期/优先级/置顶/标签）
2) useTaskActions.ts 改为聚合 re-export，调用 5 个子 hook 合并返回
3) 返回值结构不变（actions.handleXxx 调用方式不变）
4) 目标：useTaskActions.ts ≤ 100 行，每个子 hook ≤ 120 行
5) tsc --noEmit 通过
纯重构，不改任何功能逻辑。"
```

### 第 2 批指令（P2-03 + P2-04 + P2-05，可并行）

```
# P2-03：拆分 HabitView.tsx
"重构 src/components/HabitView.tsx。当前 1439 行。
步骤：
1) 创建 src/components/habit/ 目录
2) 提取常量到 constants.ts（PRESET_EMOJIS / PRESET_COLORS / ICON_PRESETS / STORAGE_KEY）
3) 提取图标选择器到 HabitIconPicker.tsx（emoji 网格 + 自定义文字输入）
4) 提取专注计时器到 HabitFocusTimer.tsx
5) 提取编辑弹窗到 HabitEditor.tsx（引用 HabitIconPicker）
6) 提取卡片到 HabitCard.tsx（引用 HabitFocusTimer）
7) 主文件 HabitView.tsx 只保留容器逻辑 + 列表渲染 + 新建表单
8) 更新 App.tsx 的 import 路径
9) 目标：HabitView.tsx ≤ 300 行，每个子组件 ≤ 350 行
10) tsc --noEmit 通过
不迁移 localStorage 到 SQLite（Phase 3 再做）。纯文件拆分。"

# P2-04：拆分 SettingsView.tsx
"重构 src/components/SettingsView.tsx。当前 842 行。
步骤：
1) 创建 src/components/settings/ 目录
2) 按 Tab 拆分为 6 个面板：
   - AppearancePanel.tsx（深色模式/字体/密度）
   - GeneralPanel.tsx（通用设置）
   - NotificationPanel.tsx（通知/提醒）
   - LLMApiPanel.tsx（大模型 API 配置，最复杂）
   - SystemPanel.tsx（开机自启/数据导出）
   - AboutPanel.tsx（应用信息）
3) SettingsView.tsx 只保留 Tab 状态 + 面板切换
4) 更新 App.tsx 的 import 路径
5) 目标：SettingsView.tsx ≤ 150 行，LLMApiPanel ≤ 250 行
6) tsc --noEmit 通过
纯重构，不改任何设置逻辑。"

# P2-05：拆分 TaskDetail.tsx
"重构 src/components/TaskDetail.tsx。当前 712 行。
步骤：
1) 创建 src/components/detail/ 目录
2) 拆分为 3 个子组件：
   - SubtaskList.tsx（子任务列表：增删改查 + 双击编辑 + 进度统计）
   - TaskNotes.tsx（Markdown 备注：编辑 + 预览切换）
   - TaskMetaPanel.tsx（日期/优先级/标签/附件）
3) TaskDetail.tsx 只保留容器 + 任务基本信息
4) 更新 App.tsx 的 import 路径
5) 目标：TaskDetail.tsx ≤ 250 行，每个子组件 ≤ 250 行
6) tsc --noEmit 通过
纯重构，不改任何功能逻辑。"
```

### 第 3 批指令（P2-06，最后做）

```
# P2-06：拆分 App.tsx
"重构 src/App.tsx。当前 778 行，是 God Component。
前置条件：P2-01 ~ P2-05 已完成。
步骤：
1) 提取 useTaskListState.ts hook：把 newTaskTitle + 搜索 + 批量选择 + 过滤状态集中
2) 提取 useTaskListActions.ts hook：把 handleCreateTask / selectAllTasks 等列表专属 action 集中
3) 提取 TaskListPanel.tsx：任务列表区 JSX（输入栏 + 列表 + 批量工具栏 + 过滤栏）
4) 提取 DetailPanel.tsx：右侧详情区 JSX（TaskDetail 或空状态）
5) 提取 CalendarPanel.tsx：日历视图路由 JSX
6) App.tsx 只保留：TitleBar + Sidebar + currentView switch + Provider
7) 目标：App.tsx ≤ 200 行
8) tsc --noEmit 通过
9) 全量功能回归：所有视图切换 + 任务增删改查 + AI 助手 + 番茄钟 + 习惯打卡
这是风险最高的重构，必须等 P2-01 ~ P2-05 全部完成后再做。"
```

---

## 六、验收清单（最终）

### 编译
- [ ] `tsc --noEmit` 通过（0 错误 0 警告）
- [ ] `cargo check` 通过

### 文件行数
- [ ] 没有任何 `.tsx` / `.ts` 文件超过 500 行
- [ ] `App.tsx` ≤ 200 行
- [ ] `HabitView.tsx` ≤ 300 行
- [ ] `SettingsView.tsx` ≤ 150 行
- [ ] `TaskDetail.tsx` ≤ 250 行
- [ ] `useTaskActions.ts` ≤ 100 行
- [ ] `llm.ts` ≤ 150 行

### 功能回归（全量）
- [ ] 任务 CRUD + 子任务 + 拖拽排序 + 批量操作
- [ ] 日历视图（月/周/日/甘特）+ 看板 + 四象限
- [ ] AI 助手 10 个技能全部正常
- [ ] 习惯打卡 + 番茄钟 + 统计
- [ ] 深色模式 + 字体切换 + 密度切换
- [ ] 设置全部面板（外观/通用/通知/AI/系统/关于）
- [ ] 系统托盘 + 开机自启

### 版本管理
- [ ] 版本号 bump 到 v1.22.0（架构重构是 Minor 级别）
- [ ] README 更新日志
- [ ] git commit + push

---

## 七、风险控制

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 拆分后 import 路径错误 | 高 | 低 | tsc 立即报错，修 import 即可 |
| Props 传递遗漏 | 中 | 中 | 拆分时先保持 props 不变，纯搬移 |
| Context 依赖断裂 | 低 | 高 | TaskActionContext 保持不变 |
| 循环依赖 | 低 | 中 | 子组件不互相 import，只通过父组件传递 |
| App.tsx 拆分后状态丢失 | 中 | 高 | 必须最后做，全量回归测试 |

**回滚策略**：每批一个 commit，如果出问题直接 `git revert` 回滚整批。

---

## 八、不建议在 Phase 2 做的事

1. ❌ **不迁移 HabitView 的 localStorage 到 SQLite** — 这是功能变更，Phase 3 做
2. ❌ **不优化 get_tasks 的前端调用** — Phase 1 已预埋后端能力，前端切换等任务量瓶颈再说
3. ❌ **不引入单元测试** — Phase 3 做
4. ❌ **不引入 LLM 流式响应** — Phase 3 做
5. ❌ **不改任何功能行为** — 纯文件拆分，零功能变更

Phase 2 的唯一目标：**把大文件拆小，让代码可维护**。
