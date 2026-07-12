# 整体导航、设置入口与命令面板 UX 优化可执行操作文档

> 适用阶段：v1.38.x 全局效率入口增强  
> 执行方式：按模块分阶段顺序开发。每个阶段完成后先完成本阶段验证，再进入下一阶段。  
> 范围：侧边栏显示控制、全局命令面板、快捷键、README 截图占位清理。

## 1. 项目现状总结

主路由在 `src/App.tsx`，侧边栏由 `src/components/sidebar/Sidebar.tsx`、`ViewSwitcher.tsx`、`ListSection.tsx`、`TagSection.tsx`、`SidebarFooter.tsx` 组成。快捷键在 `src/hooks/useKeyboardShortcuts.ts`、`src/utils/shortcuts.ts`、`src/components/ShortcutsHelp.tsx`、`src/components/settings/ShortcutsPanel.tsx`。设置入口在 `src/components/settings/SettingsView.tsx`。

| 编号 | 问题描述 | 影响范围 | 复现路径 |
|---|---|---|---|
| U-01 | 侧边栏入口很多，智能清单、高级视图、清单、标签叠加后信息密度高。 | 导航效率、窄屏体验 | 创建多个清单和标签后查看完整侧边栏。 |
| U-02 | 折叠态图标条固定显示大量入口，用户不能隐藏低频模块。 | 平板、折叠侧边栏 | 按 Ctrl+B 折叠侧边栏，观察图标数量。 |
| U-03 | 没有全局命令面板，跳转视图、创建任务、搜索任务分散在多个入口。 | 高频操作、键盘用户 | 想快速跳到模板或目标，只能找侧边栏。 |
| U-04 | README 截图区域仍为裸“（待补充）”。 | 文档与发布材料 | 打开 `README.md` 截图区。 |
| U-05 | 快捷键已有自定义，但缺少统一命令入口默认快捷键。 | 键盘工作流 | 当前只能 Ctrl+N、Ctrl+F 或视图切换。 |

## 2. 优化方案

| 编号 | 优先级 | 优化策略 | 优化目标 | 预期效果 |
|---|---|---|---|---|
| U-01 | P1 | 增加“侧边栏显示设置”。 | 用户可隐藏低频模块。 | 降低视觉噪音。 |
| U-02 | P1 | 折叠态图标条读取同一份显示配置。 | 折叠态更短。 | 平板导航更清爽。 |
| U-03 | P0 | 新增全局命令面板。 | 快速执行跳转、新建、搜索。 | 高频路径减少 1-3 次点击。 |
| U-04 | P2 | README 截图区改为明确版本说明或真实图片引用。 | 发布材料不留裸占位。 | 新用户理解成本下降。 |
| U-05 | P0 | 默认快捷键增加 `Ctrl+K` 打开命令面板。 | 建立统一键盘入口。 | 快捷键体系更完整。 |

## 3. 执行步骤

### 阶段 0：开发前置检查

```bash
git status --short --branch
git pull --ff-only
```

如果工作区有未提交改动或快进失败，停止执行。

### 阶段 1：新增命令面板 ✅ 已完成

新增文件：

- `src/components/CommandPalette.tsx`
- `src/hooks/useCommandPalette.ts`
- `src/components/__tests__/CommandPalette.test.tsx`
- `tests/command-palette.spec.ts`

修改文件：`src/App.tsx`、`src/stores/uiStore.ts`（新增 `commandPaletteOpen` / `setCommandPaletteOpen`）

命令范围（真实 view ID）：

| 命令 | 行为 |
|---|---|
| 全部任务 | `currentView = 'tasks'`，清除 list/tag 选择 |
| 今日任务 | `currentView = 'today'` |
| 日历 | `currentView = 'calendar'` |
| 统计 | `currentView = 'stats'` |
| AI 助手 | `currentView = 'ai'` |
| 四象限 | `currentView = 'quadrant'` |
| 番茄钟 | `currentView = 'pomodoro'` |
| 习惯 | `currentView = 'habit'` |
| 模板 | `currentView = 'template'` |
| 目标 / OKR | `currentView = 'goals'` |
| 设置 | `currentView = 'settings'` |
| 新建任务 | 确保列表视图后聚焦 `newTaskInputRef` |
| 聚焦搜索 | 确保列表视图后聚焦 `searchInputRef` |
| 打开快捷键帮助 | `setShortcutsHelpOpen(true)` |

搜索任务：输入任务标题关键词后展示前 10 条匹配任务（排除归档、忽略大小写、中文包含匹配）；点击/Enter 后设置 `selectedTaskId`，必要时切回 `tasks` 以保证详情可见，并关闭面板。空输入不展示任务列表。

UI：`Esc` 关闭并尽量恢复焦点，↑↓ 移动，Enter 执行，输入框自动聚焦，最大高度 70vh，结果区内滚动；语义化 dialog / listbox。

焦点策略（关闭时单一路径，消除竞争）：

| 关闭路径 | 策略 |
|---|---|
| Esc / 遮罩点击 / 普通视图跳转 / 再次 Ctrl+K | `restore`：恢复打开前焦点（目标仍在 document 且可聚焦） |
| 新建任务 | `target` → `newTaskInputRef` |
| 聚焦搜索 | `target` → `searchInputRef` |
| 打开快捷键帮助 | `none`：不恢复旧焦点，避免抢占帮助弹层 |

验证：`CommandPalette.test.tsx` 含焦点路径通过；全量单测通过；`typecheck` 通过；`lint` 0 errors。

### 阶段 2：注册 Ctrl+K 快捷键 ✅ 已完成

修改文件：

- `src/hooks/useKeyboardShortcuts.ts`
- `src/utils/shortcuts.ts`
- `src/components/settings/ShortcutsPanel.tsx`（通过 `DEFAULT_SHORTCUT_BINDINGS` 自动展示，无需单独 UI 逻辑）
- `src/components/ShortcutsHelp.tsx`（同上，自动包含可自定义绑定）

新增快捷键 ID：`commandPalette`，默认按键 `Ctrl+K`；macOS 兼容 `Meta+K`（默认绑定为 Ctrl+K 时额外注册）。

行为：输入框内按 `Ctrl+K` 也允许打开命令面板；打开时 `preventDefault()` + `stopPropagation()`；再次按下可关闭。已接入现有自定义/冲突检测机制（`DEFAULT_SHORTCUT_BINDINGS` + `customShortcuts`）。

### 阶段 3：侧边栏显示设置 ✅ 已完成

新增/修改文件：

- `src/utils/sidebarVisibility.ts`（集中定义默认配置、合并、判断、解析）
- `src/stores/uiStore.ts`（`visibleSidebarItems` / `setSidebarItemVisible` / `isSidebarItemVisible`）
- `src/components/settings/GeneralPanel.tsx`（侧边栏显示 Toggle 列表）
- `src/components/sidebar/ViewSwitcher.tsx`（完整侧边栏按配置过滤）
- `src/components/sidebar/Sidebar.tsx`（折叠图标条按同一配置过滤）
- `src/config/localStorageKeys.ts`（命名空间映射）
- 测试：`src/utils/__tests__/sidebarVisibility.test.ts`、`uiStore` 侧边栏用例、`GeneralPanel.test.tsx`、`sidebarVisibilityFilter.test.tsx`、`tests/settings.spec.ts`

状态模型：

```ts
visibleSidebarItems: Record<string, boolean>
setSidebarItemVisible(id: string, visible: boolean): void
isSidebarItemVisible(id: string): boolean
```

持久化：

- 逻辑名称：`sidebar_visible_items`
- **正式存储位置**：`STORAGE_KEYS.sidebarVisibleItems` → **`dida:sidebar_visible_items`**
  （`SIDEBAR_VISIBLE_ITEMS_KEY` 指向该 namespaced key，不维护第二份裸字符串常量）
- **legacy 兼容**：旧裸 key `sidebar_visible_items` 仅用于读取；`loadSidebarVisibility()` 在 namespaced 缺失时读 legacy，并尽力立即写入 namespaced（不覆盖已有 namespaced）
- 同次启动即可用旧配置，不依赖 `useAppInit` / `migrateStorageKeys` 完成后再生效
- 写入：`saveSidebarVisibility` / `setSidebarItemVisible` **只写 namespaced key**，禁止回写 legacy
- 缺失 / 损坏 JSON / 非对象 → 回退默认（全部可选入口可见）
- 合并策略：已知入口缺失默认 `true`；不盲目整表覆盖，兼容未来新增入口

不可隐藏入口（数据层 + UI 层双防护）：

- `tasks` 全部任务
- `today` 今日任务
- `settings` 设置

可隐藏入口：`archived`、`calendar`、`stats`、`ai`、`quadrant`、`pomodoro`、`habit`、`template`、`goals`。

完整态 / 折叠态：共用 `isSidebarItemVisible(id, visibleSidebarItems)`；空分组不渲染标题，避免孤立分隔。

隐藏当前可选视图：同一更新周期内 `currentView → 'tasks'`，并清理 `selectedListId` / `selectedTagId`。

验证：`typecheck` 通过；全量单测 673 通过；`lint` 0 errors；`tests/settings.spec.ts` e2e 6 通过。

### 阶段 4：README 截图占位清理 ✅ 已完成

> 发布版本：v1.42.0（2026-07-12）

修改文件：`README.md`、本执行文档、`docs/product-optimization-roadmap.md`

采用策略：

- 仓库内无与当前界面相符的可信截图资源（仅有应用图标与过时本地截图文件，未作为 README 界面图引用）
- **不编造图片路径、不引用不存在的 Release 附件**
- 将「截图」区改为明确说明：以功能清单、使用说明和发布说明作为功能依据，避免静态截图与桌面端脱节
- README 中已不包含裸文本 `（待补充）` 或同义占位语

同步补充 README 已实现能力的准确描述（不夸大规划项）：

- Ctrl+K 全局命令面板（跳转、新建、搜索、快捷键帮助；任务标题最多 10 条）
- 设置 → 通用 → 侧边栏显示（完整/折叠同步；tasks / today / settings 不可隐藏）

## 4. 代码修改规则

| 改动 | 文件完整路径 | 修改前 | 修改后 |
|---|---|---|---|
| 命令面板 | `src/components/CommandPalette.tsx` | 不存在 | 新增全局命令面板 |
| App 挂载 | `src/App.tsx` | 无 CommandPalette | 根节点挂载 CommandPalette |
| 快捷键 | `src/hooks/useKeyboardShortcuts.ts` | 无 Ctrl+K 命令入口 | 支持打开命令面板 |
| 快捷键配置 | `src/utils/shortcuts.ts` | 无 `commandPalette` | 增加默认绑定 |
| 侧边栏状态 | `src/stores/uiStore.ts` | 无 visibleSidebarItems | 增加持久化字段 |
| 完整侧边栏 | `src/components/sidebar/ViewSwitcher.tsx` | 固定渲染所有入口 | 按 visible 配置过滤 |
| 折叠图标条 | `src/components/sidebar/Sidebar.tsx` | 固定 items 数组 | 按 visible 配置过滤 |
| 设置入口 | `src/components/settings/GeneralPanel.tsx` | 无侧边栏显示设置 | 增加 Toggle 列表 |
| README | `README.md` | 截图为裸“（待补充）” | 改为明确说明或真实图片引用 |

禁止事项：禁止删除任何现有视图；禁止隐藏“全部任务”“今日任务”“设置”；禁止把命令面板做成营销式大弹窗；禁止在 README 引用不存在的截图文件。

## 5. 验证标准

### 必跑命令

```bash
npm run typecheck
npm test
npm run lint
npm run test:e2e -- tests/settings.spec.ts
```

### 目标测试文件

- 新增 `src/components/__tests__/CommandPalette.test.tsx`
- 更新 `src/stores/__tests__/uiStore.test.ts`
- 更新 `tests/settings.spec.ts`

### 可量化验收项

| 验收项 | 标准 |
|---|---|
| Ctrl+K | 非输入状态和输入状态按下后命令面板均打开 |
| 搜索命令 | 输入“日历”后列表包含“日历”，Enter 后 `currentView === 'calendar'` |
| 搜索任务 | 输入任务标题关键词，最多展示 10 条任务 |
| 隐藏高级视图 | 关闭“番茄钟”后，完整侧边栏和折叠图标条均不显示番茄钟入口 |
| 必选入口 | 全部任务、今日任务、设置没有隐藏 Toggle |
| README | 仓库中 `README.md` 不再包含裸文本 `（待补充）` |
