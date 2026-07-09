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

### 阶段 1：新增命令面板

新增文件：

- `src/components/CommandPalette.tsx`
- `src/hooks/useCommandPalette.ts`

修改文件：`src/App.tsx`

命令范围：全部任务、今日任务、日历、统计、AI 助手、四象限、番茄钟、习惯、模板、目标/OKR、设置、新建任务、聚焦搜索、打开快捷键帮助。

搜索任务：输入任务标题关键词后展示前 10 条匹配任务，点击后设置 `selectedTaskId`。

UI 要求：`Esc` 关闭，上下键移动，Enter 执行，输入框自动聚焦，最大高度 70vh，内部滚动。

### 阶段 2：注册 Ctrl+K 快捷键

修改文件：

- `src/hooks/useKeyboardShortcuts.ts`
- `src/utils/shortcuts.ts`
- `src/components/settings/ShortcutsPanel.tsx`
- `src/components/ShortcutsHelp.tsx`

新增快捷键 ID：`commandPalette`，默认按键 `Ctrl+K`。

行为：输入框内按 `Ctrl+K` 也允许打开命令面板；打开后阻止事件继续传播。

### 阶段 3：侧边栏显示设置

修改文件：

- `src/stores/uiStore.ts`
- `src/components/settings/GeneralPanel.tsx`
- `src/components/sidebar/ViewSwitcher.tsx`
- `src/components/sidebar/Sidebar.tsx`

新增状态：

```ts
visibleSidebarItems: Record<string, boolean>
setSidebarItemVisible(id: string, visible: boolean): void
```

持久化 key：`sidebar_visible_items`，通过 `src/utils/storage.ts` 读写。

规则：`tasks`、`today`、`settings` 不允许隐藏；完整侧边栏和折叠图标条必须使用同一配置。

### 阶段 4：README 截图占位清理

修改文件：`README.md`

操作：将“（待补充）”替换为明确说明，例如“当前版本截图将在发布前补充；本节不再作为功能验收依据”，或替换为真实图片引用。

禁止写入不存在的图片路径。

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
