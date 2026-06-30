# 滴答清单复刻 — Phase 5 主题系统与收尾打磨文档

**生成日期**：2026-06-29 13:30 (Asia/Shanghai)
**当前版本**：v1.24.0（Phase 4 功能增强已完成）
**前置条件**：Phase 1 ✅、Phase 2 ✅、Phase 3 ✅、Phase 4 ✅
**项目路径**：`C:\Users\50441\Documents\trae开发\滴答清单复刻`

---

## 一、Phase 5 目标

**Phase 5 聚焦两件事：主题系统从"能用"升级到"好看"+ 拆完最后几个大文件。**

| 方向 | 核心目标 | 量化指标 |
|---|---|---|
| A. 主题系统重构（⭐ 用户指定） | CSS 变量 + 多套配色 + 自定义强调色 | 3 套预设 → 6+ 套 + 自定义 |
| B. 拆分最后大文件 | 0 个文件超过 500 行 | 3 个 → 0 个 |
| C. 测试补强 | 主题系统 + 导出/导入测试 | 169 → 200+ 用例 |

---

## 二、当前主题系统现状（v1.24.0 基线）

### 2.1 已有的主题能力

| 能力 | 实现方式 | 问题 |
|---|---|---|
| 深色/浅色/跟随系统 | `document.documentElement.classList.add('dark')` | ✅ 基础功能正常 |
| 字体大小 | CSS zoom（normal/large/xlarge） | ✅ 可用 |
| 侧边栏密度 | CSS 变量 `--sidebar-py` | ✅ 可用 |
| 显示字体 | 预设 + 系统字体选择 | ✅ 可用 |

### 2.2 主题系统的核心问题

**问题 1：颜色硬编码，无法整体切换**

当前所有颜色直接写在 Tailwind class 里，如 `bg-blue-600`、`text-gray-900`、`border-gray-200`。这些颜色是"写死"的，想换个主题色（比如从蓝色换成绿色）要改几百处代码。

**问题 2：只有"深色/浅色"两套，没有配色方案**

用户不能选择"暖色系""护眼绿""莫兰迪"等配色。XMind / TickTick 都有多套配色，滴答清单复刻目前没有。

**问题 3：没有强调色（Accent Color）概念**

所有按钮/链接/选中态都是蓝色（`blue-600`）。用户不能自定义强调色。

**问题 4：深色模式覆盖不完整**

部分组件在深色模式下颜色不对（如任务条颜色、日历视图背景），需要手动 patch。

---

## 三、任务清单（8 个任务，3 个方向）

### 方向 A：主题系统重构（5 个任务，⭐ Phase 5 核心）

---

### P5-01：建立 CSS 变量主题体系

**目标**：把所有硬编码颜色替换为 CSS 变量，建立完整的主题变量体系。

**新增文件**：`src/styles/theme-variables.css`

**CSS 变量设计**（语义化命名，不绑具体颜色）：
```css
:root {
  /* ===== 基础色 ===== */
  --color-bg: #ffffff;           /* 页面背景 */
  --color-bg-secondary: #f9fafb;  /* 次要背景（卡片、侧边栏） */
  --color-bg-tertiary: #f3f4f6;   /* 三级背景（hover、输入框） */
  --color-surface: #ffffff;       /* 卡片/面板表面 */
  --color-border: #e5e7eb;        /* 边框 */
  --color-border-light: #f3f4f6;  /* 浅边框 */

  /* ===== 文字色 ===== */
  --color-text-primary: #111827;    /* 主文字 */
  --color-text-secondary: #6b7280;  /* 次要文字 */
  --color-text-tertiary: #9ca3af;   /* 提示文字 */
  --color-text-inverse: #ffffff;    /* 反色文字（深色背景上） */

  /* ===== 强调色（Accent）===== */
  --color-accent: #3b82f6;          /* 强调色（按钮、链接、选中） */
  --color-accent-hover: #2563eb;    /* 强调色 hover */
  --color-accent-light: #dbeafe;    /* 强调色浅（背景高亮） */
  --color-accent-text: #1d4ed8;     /* 强调色文字 */

  /* ===== 语义色 ===== */
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  --color-info: #3b82f6;

  /* ===== 优先级色 ===== */
  --color-priority-high: #ef4444;
  --color-priority-medium: #f59e0b;
  --color-priority-low: #3b82f6;
  --color-priority-none: #6b7280;

  /* ===== 标题栏 ===== */
  --color-titlebar-bg: #f8fafc;
  --color-titlebar-fg: #64748b;

  /* ===== 滚动条 ===== */
  --color-scrollbar: rgba(0, 0, 0, 0.15);
  --color-scrollbar-hover: rgba(0, 0, 0, 0.25);
}

/* 深色模式覆盖 */
.dark {
  --color-bg: #1a1a2e;
  --color-bg-secondary: #16213e;
  --color-bg-tertiary: #0f3460;
  --color-surface: #1e293b;
  --color-border: #334155;
  --color-border-light: #1e293b;

  --color-text-primary: #f1f5f9;
  --color-text-secondary: #94a3b8;
  --color-text-tertiary: #64748b;
  --color-text-inverse: #0f172a;

  --color-accent: #3b82f6;
  --color-accent-hover: #60a5fa;
  --color-accent-light: #1e3a5f;
  --color-accent-text: #93c5fd;

  --color-success: #34d399;
  --color-warning: #fbbf24;
  --color-danger: #f87171;
  --color-info: #60a5fa;

  --color-priority-high: #f87171;
  --color-priority-medium: #fbbf24;
  --color-priority-low: #60a5fa;
  --color-priority-none: #64748b;

  --color-titlebar-bg: #0f172a;
  --color-titlebar-fg: #64748b;

  --color-scrollbar: rgba(255, 255, 255, 0.15);
  --color-scrollbar-hover: rgba(255, 255, 255, 0.25);
}
```

**操作步骤**：
1. 创建 `src/styles/theme-variables.css`，定义所有 CSS 变量
2. 在 `index.css` 中 `@import './styles/theme-variables.css';`
3. 修改 `index.css` 中的硬编码颜色为 CSS 变量（标题栏、滚动条等）
4. **不改动组件代码**（组件改动在 P5-03）
5. 验证：现有深色/浅色切换仍然正常

**验收**：
- [ ] `theme-variables.css` 创建，包含 30+ 个语义化 CSS 变量
- [ ] 深色模式变量覆盖完整
- [ ] `index.css` 引入新文件
- [ ] 现有深色/浅色切换仍正常
- [ ] `tsc --noEmit` 通过

---

### P5-02：实现 6 套预设主题 + 自定义强调色

**目标**：提供 6 套预设配色方案 + 用户自定义强调色。

**新增文件**：`src/styles/themes.ts`

**6 套预设主题**：
```typescript
export interface ThemePreset {
  id: string
  name: string        // 显示名称
  description: string // 一句话描述
  variables: Record<string, string>  // CSS 变量覆盖
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'default',
    name: '默认蓝',
    description: '清爽的蓝色调',
    variables: {
      '--color-accent': '#3b82f6',
      '--color-accent-hover': '#2563eb',
      '--color-accent-light': '#dbeafe',
      '--color-accent-text': '#1d4ed8',
    },
  },
  {
    id: 'green',
    name: '护眼绿',
    description: '柔和的绿色调，长时间使用不疲劳',
    variables: {
      '--color-accent': '#10b981',
      '--color-accent-hover': '#059669',
      '--color-accent-light': '#d1fae5',
      '--color-accent-text': '#047857',
    },
  },
  {
    id: 'purple',
    name: '优雅紫',
    description: '沉静的紫色调',
    variables: {
      '--color-accent': '#8b5cf6',
      '--color-accent-hover': '#7c3aed',
      '--color-accent-light': '#ede9fe',
      '--color-accent-text': '#6d28d9',
    },
  },
  {
    id: 'orange',
    name: '活力橙',
    description: '温暖的橙色调',
    variables: {
      '--color-accent': '#f97316',
      '--color-accent-hover': '#ea580c',
      '--color-accent-light': '#ffedd5',
      '--color-accent-text': '#c2410c',
    },
  },
  {
    id: 'rose',
    name: '玫瑰红',
    description: '柔和的玫红色调',
    variables: {
      '--color-accent': '#f43f5e',
      '--color-accent-hover': '#e11d48',
      '--color-accent-light': '#ffe4e6',
      '--color-accent-text': '#be123c',
    },
  },
  {
    id: 'morandi',
    name: '莫兰迪',
    description: '低饱和度的灰调配色，高级感',
    variables: {
      '--color-accent': '#8896a3',
      '--color-accent-hover': '#64748b',
      '--color-accent-light': '#e2e8f0',
      '--color-accent-text': '#475569',
      '--color-bg': '#f5f5f0',
      '--color-bg-secondary': '#eeece4',
      '--color-surface': '#faf9f5',
    },
  },
]
```

**自定义强调色**：用户可以从颜色选择器中选择任意颜色作为强调色，系统根据该颜色自动计算 hover/light/text 变体。

**主题存储**：`localStorage['theme_preset']` + `localStorage['theme_accent']`

**操作步骤**：
1. 创建 `src/styles/themes.ts`，定义 6 套预设 + 类型
2. 创建 `src/utils/themeUtils.ts`：
   - `applyThemePreset(presetId: string)` — 应用预设主题
   - `applyAccentColor(color: string)` — 应用自定义强调色（自动计算变体）
   - `getCurrentTheme()` — 获取当前主题
3. 修改 `AppearancePanel.tsx`：
   - 在"主题"区域下方添加"配色方案"区域
   - 6 个预设主题卡片（预览色 + 名称 + 描述）
   - 自定义强调色选择器（`<input type="color">` + 预设色板）
4. 验证：切换配色方案后全局颜色立即变化

**验收**：
- [ ] 6 套预设主题可切换
- [ ] 自定义强调色可选择任意颜色
- [ ] 切换后全局颜色立即变化
- [ ] 重启应用后主题保持
- [ ] 深色模式下配色方案仍然生效
- [ ] `tsc --noEmit` 通过

---

### P5-03：组件颜色迁移到 CSS 变量

**目标**：把组件中硬编码的 Tailwind 颜色 class 替换为 CSS 变量引用。

**这是工作量最大的任务**，需要系统性替换。

**替换规则**：
| 原 Tailwind class | 替换为 |
|---|---|
| `bg-white` | `bg-[var(--color-surface)]` |
| `bg-gray-50` | `bg-[var(--color-bg-secondary)]` |
| `bg-gray-100` | `bg-[var(--color-bg-tertiary)]` |
| `text-gray-900` | `text-[var(--color-text-primary)]` |
| `text-gray-600` | `text-[var(--color-text-secondary)]` |
| `text-gray-400` | `text-[var(--color-text-tertiary)]` |
| `border-gray-200` | `border-[var(--color-border)]` |
| `border-gray-100` | `border-[var(--color-border-light)]` |
| `bg-blue-600` / `text-blue-600` | `bg-[var(--color-accent)]` / `text-[var(--color-accent)]` |
| `hover:bg-blue-50` | `hover:bg-[var(--color-accent-light)]` |
| `hover:bg-gray-100` | `hover:bg-[var(--color-bg-tertiary)]` |

**操作步骤**：
1. **分批替换**，按模块进行（避免一次性改太多）：
   - 第 1 批：`Sidebar/` + `sidebar/` 子组件
   - 第 2 批：`task-item/` + `task-list/` 子组件
   - 第 3 批：`settings/` 子组件
   - 第 4 批：`calendar/` + `pomodoro/` + `habit/` 子组件
   - 第 5 批：`AIAssistant.tsx` + `TaskDetail` + 其他组件
2. 每批替换后跑 `tsc --noEmit` + 手动检查深色模式
3. 重点检查：
   - 深色模式下文字是否可见
   - 选中态/hover 态颜色是否正确
   - 边框在深色模式下是否可见
4. 验证：深色/浅色切换 + 6 套配色方案切换都正常

**注意**：
- 优先级颜色（`text-red-500` / `text-yellow-500` / `text-blue-500`）替换为 `var(--color-priority-*)`
- 语义色（成功/警告/危险）替换为 `var(--color-success/warning/danger)`
- **不要替换图标颜色**（lucide 图标用 `currentColor`，跟随文字色即可）

**验收**：
- [ ] 所有 `bg-white` / `bg-gray-*` / `text-gray-*` / `border-gray-*` 替换为 CSS 变量
- [ ] 所有 `bg-blue-*` / `text-blue-*` 替换为 `var(--color-accent-*)`
- [ ] 深色模式下所有组件颜色正确
- [ ] 6 套配色方案切换后所有组件颜色正确
- [ ] 自定义强调色切换后所有组件颜色正确
- [ ] `tsc --noEmit` 通过

---

### P5-04：主题预览面板 + 实时切换

**目标**：在 AppearancePanel 中添加主题预览卡片，点击即可实时切换。

**UI 设计**：
```
┌─────────────────────────────────────────────────┐
│ 配色方案                                         │
│                                                  │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │
│ │ 默认蓝 │ │ 护眼绿 │ │ 优雅紫 │ │ 活力橙 │ │ 玫瑰红 │  │
│ │  ●●●  │ │  ●●●  │ │  ●●●  │ │  ●●●  │ │  ●●●  │  │
│ │ 选中✓  │ │       │ │       │ │       │ │       │  │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘  │
│                                                  │
│ ┌──────┐                                         │
│ │ 莫兰迪 │                                         │
│ │  ●●●  │                                         │
│ └──────┘                                         │
│                                                  │
│ 自定义强调色                                      │
│ [颜色选择器] [预设色板: ● ● ● ● ● ●]              │
└─────────────────────────────────────────────────┘
```

**操作步骤**：
1. 在 `AppearancePanel.tsx` 中添加"配色方案"区域
2. 6 个预设主题卡片，每个卡片显示 3 个预览色（强调色+浅色+文字色）
3. 当前选中的主题卡片有蓝色边框 + ✓ 图标
4. 点击卡片立即切换主题
5. 下方添加自定义强调色选择器
6. 添加"重置为默认"按钮

**验收**：
- [ ] 6 个预设主题卡片正确显示预览色
- [ ] 当前主题有选中标识
- [ ] 点击卡片立即切换全局配色
- [ ] 自定义强调色选择器可用
- [ ] "重置为默认"按钮可用
- [ ] `tsc --noEmit` 通过

---

### P5-05：主题持久化 + 系统主题跟随

**目标**：主题选择持久化存储，且"跟随系统"模式下系统主题变化时自动切换。

**操作步骤**：
1. 修改 `useAppInit.ts`：
   - 启动时从 localStorage 读取主题预设 + 强调色
   - 应用主题到 document.documentElement
   - 监听 `window.matchMedia('(prefers-color-scheme: dark)')` 变化
2. 修改 `AppearancePanel.tsx`：
   - 主题切换时同时保存到 localStorage + 应用到 document
3. 新增 `src/hooks/useTheme.ts`：
   - 统一管理主题状态（浅色/深色/系统 + 预设 + 强调色）
   - 提供 `useTheme()` hook 给组件使用
4. 修改 `AppearancePanel.tsx` 使用 `useTheme()` hook

**验收**：
- [ ] 主题选择重启后保持
- [ ] "跟随系统"模式下系统切换深浅色时自动响应
- [ ] `useTheme()` hook 可用
- [ ] `tsc --noEmit` 通过

---

### 方向 B：拆分最后大文件（2 个任务）

---

### P5-06：拆分 `AIAssistant.tsx`（533行 → ≤300行）

**当前**：`src/components/AIAssistant.tsx` 533 行

**拆分方案**：
```
src/components/ai/
├── AIAssistant.tsx (200 行) — 容器：对话区 + 输入栏 + 技能选择
├── ChatMessage.tsx (100 行) — 单条消息渲染（含打字机光标）
├── SkillSelector.tsx (80 行) — 技能快捷选择栏
├── ActionParser.ts (60 行) — 解析 AI 回复中的操作指令
└── types.ts (30 行) — AI 相关类型
```

**操作步骤**：
1. 创建 `src/components/ai/` 目录
2. 提取消息渲染逻辑到 `ChatMessage.tsx`
3. 提取技能选择栏到 `SkillSelector.tsx`
4. 提取操作指令解析到 `ActionParser.ts`
5. 主文件只保留容器 + 状态管理 + 流式调用
6. 更新 `App.tsx` 的 import 路径
7. 验证：`tsc --noEmit` 通过

**验收**：
- [ ] `AIAssistant.tsx` ≤ 300 行
- [ ] 每个子组件 ≤ 100 行
- [ ] AI 对话 + 流式 + 技能 + 操作指令全部正常
- [ ] `tsc --noEmit` 通过

---

### P5-07：拆分 `data_commands.rs`（574行 → ≤300行）

**当前**：`src-tauri/src/commands/data_commands.rs` 574 行

**拆分方案**：
```
src-tauri/src/commands/
├── data_commands.rs (20 行) — mod 声明 + re-export
├── data_export.rs (200 行) — export_json / export_csv / export_markdown
└── data_import.rs (200 行) — import_json（含 merge/replace 逻辑）
```

**操作步骤**：
1. 按职责把 4 个函数分到 2 个子模块
2. `data_commands.rs` 改为 mod 声明 + re-export
3. `commands/mod.rs` 的 import 路径不变
4. 验证：`cargo check` 通过

**验收**：
- [ ] `data_commands.rs` ≤ 30 行
- [ ] 每个子模块 ≤ 200 行
- [ ] `cargo check` 通过
- [ ] 导出/导入功能不变

---

### 方向 C：测试补强（1 个任务）

---

### P5-08：主题系统 + 导出/导入测试

**目标**：为新主题系统和 P4 的导出/导入功能补充测试。

**新增测试文件**：
```
src/styles/__tests__/themes.test.ts     — 主题预设测试（8+ 用例）
src/utils/__tests__/themeUtils.test.ts  — 主题工具函数测试（5+ 用例）
src/utils/__tests__/exportImport.test.ts — 导出/导入格式测试（5+ 用例）
```

**测试用例**：
- 6 套预设主题都有 id/name/variables
- 自定义强调色变体计算正确（hover/light/text）
- applyThemePreset 正确设置 CSS 变量
- 导出 JSON 包含所有数据表
- 导出 CSV 包含表头和任务数据
- 导出 Markdown 按清单分组

**验收**：
- [ ] 新增测试用例 ≥18 个
- [ ] 总测试数 ≥187 个
- [ ] `npm run test` 全部通过

---

## 四、执行顺序 & 里程碑

```
第 1 批（主题基础，~6h）：
  P5-01 CSS 变量体系                (2h)
  P5-02 6 套预设 + 自定义强调色      (3h)
  P5-05 主题持久化 + useTheme hook   (1h)
  → 验收点 A：主题系统基础可用（6 套配色可切换）

第 2 批（组件迁移，~5h）：
  P5-03 组件颜色迁移到 CSS 变量      (4h)
  P5-04 主题预览面板                 (1h)
  → 验收点 B：全组件颜色跟随主题

第 3 批（收尾，~4h）：
  P5-06 拆分 AIAssistant.tsx        (2h)
  P5-07 拆分 data_commands.rs       (1h)
  P5-08 测试补强                     (1h)
  → 验收点 C：0 个文件超 500 行 + 测试 ≥187
```

---

## 五、给 workbuddy / Trae 的指令建议

### 第 1 批指令（P5-01 + P5-02 + P5-05）

```
# P5-01：CSS 变量主题体系
"创建 src/styles/theme-variables.css。
定义 30+ 个语义化 CSS 变量（基础色/文字色/强调色/语义色/优先级色/标题栏/滚动条）。
包含 :root（浅色默认）和 .dark（深色覆盖）两套。
在 index.css 中 @import './styles/theme-variables.css'。
修改 index.css 中硬编码的颜色为 CSS 变量。
不改动组件代码（组件改动在后续任务）。
tsc --noEmit 通过。"

# P5-02：6 套预设主题 + 自定义强调色
"创建 src/styles/themes.ts，定义 6 套预设主题：
默认蓝/护眼绿/优雅紫/活力橙/玫瑰红/莫兰迪。
每套包含 id/name/description/variables（CSS 变量覆盖）。
创建 src/utils/themeUtils.ts：
- applyThemePreset(presetId) — 应用预设
- applyAccentColor(color) — 应用自定义强调色（自动计算 hover/light/text 变体）
- getCurrentTheme() — 获取当前主题
修改 AppearancePanel.tsx 添加配色方案选择区域 + 自定义强调色选择器。
tsc --noEmit 通过。"

# P5-05：主题持久化 + useTheme hook
"创建 src/hooks/useTheme.ts。
统一管理：浅色/深色/系统 + 预设 + 强调色。
监听 window.matchMedia('(prefers-color-scheme: dark)') 变化。
修改 useAppInit.ts 启动时恢复主题。
修改 AppearancePanel.tsx 使用 useTheme() hook。
tsc --noEmit 通过。"
```

### 第 2 批指令（P5-03 + P5-04）

```
# P5-03：组件颜色迁移到 CSS 变量
"把所有组件中硬编码的 Tailwind 颜色 class 替换为 CSS 变量引用。
替换规则：
- bg-white → bg-[var(--color-surface)]
- bg-gray-50 → bg-[var(--color-bg-secondary)]
- bg-gray-100 → bg-[var(--color-bg-tertiary)]
- text-gray-900 → text-[var(--color-text-primary)]
- text-gray-600 → text-[var(--color-text-secondary)]
- text-gray-400 → text-[var(--color-text-tertiary)]
- border-gray-200 → border-[var(--color-border)]
- border-gray-100 → border-[var(--color-border-light)]
- bg-blue-600/text-blue-600 → var(--color-accent)
- hover:bg-blue-50 → hover:bg-[var(--color-accent-light)]
- hover:bg-gray-100 → hover:bg-[var(--color-bg-tertiary)]
分 5 批替换：
1) sidebar/ 子组件
2) task-item/ + task-list/ 子组件
3) settings/ 子组件
4) calendar/ + pomodoro/ + habit/ 子组件
5) AIAssistant + TaskDetail + 其他
每批替换后 tsc --noEmit 验证。
重点检查深色模式下文字可见性。"

# P5-04：主题预览面板
"修改 src/components/settings/AppearancePanel.tsx。
添加配色方案预览区域：
- 6 个预设主题卡片，每个显示 3 个预览色
- 当前选中主题有边框 + ✓ 标识
- 点击立即切换
- 下方自定义强调色选择器（input type=color + 预设色板）
- '重置为默认'按钮
tsc --noEmit 通过。"
```

### 第 3 批指令（P5-06 + P5-07 + P5-08）

```
# P5-06：拆分 AIAssistant.tsx
"重构 src/components/AIAssistant.tsx。当前 533 行。
拆分到 src/components/ai/ 目录：
- AIAssistant.tsx (≤300行) — 容器+状态+流式调用
- ChatMessage.tsx — 单条消息渲染（含打字机光标）
- SkillSelector.tsx — 技能快捷选择栏
- ActionParser.ts — 解析 AI 回复中的操作指令
- types.ts — AI 相关类型
更新 App.tsx 的 import 路径。tsc --noEmit 通过。纯重构。"

# P5-07：拆分 data_commands.rs
"重构 src-tauri/src/commands/data_commands.rs。当前 574 行。
拆分为：
- data_export.rs — export_json / export_csv / export_markdown
- data_import.rs — import_json（含 merge/replace 逻辑）
data_commands.rs 改为 mod 声明 + re-export。
commands/mod.rs 的 import 路径不变。cargo check 通过。纯重构。"

# P5-08：测试补强
"新增 3 个测试文件：
1) src/styles/__tests__/themes.test.ts — 6 套预设主题完整性（8+ 用例）
2) src/utils/__tests__/themeUtils.test.ts — 主题工具函数（5+ 用例）
3) src/utils/__tests__/exportImport.test.ts — 导出/导入格式（5+ 用例）
总测试数 ≥187。npm run test 全部通过。"
```

---

## 六、验收清单（最终）

### 编译
- [ ] `tsc --noEmit` 通过
- [ ] `cargo check` 通过
- [ ] `npm run test` 全部通过（≥187 用例）
- [ ] GitHub Actions CI 绿

### 文件行数
- [ ] 没有任何 `.tsx` / `.ts` 文件超过 500 行
- [ ] 没有任何 `.rs` 文件超过 300 行

### 主题系统（⭐ 核心验收）
- [ ] 6 套预设主题可切换（默认蓝/护眼绿/优雅紫/活力橙/玫瑰红/莫兰迪）
- [ ] 自定义强调色可选择任意颜色
- [ ] 切换主题后全局颜色立即变化
- [ ] 重启应用后主题保持
- [ ] 深色模式下配色方案仍然生效
- [ ] "跟随系统"模式下系统切换深浅色时自动响应
- [ ] 主题预览面板正确显示 6 个卡片
- [ ] 所有组件颜色使用 CSS 变量（无硬编码）

### 功能回归
- [ ] 任务 CRUD + 子任务 + 拖拽 + 批量
- [ ] 日历视图（月/周/日/甘特/看板）
- [ ] AI 助手 + 流式打字机 + 取消
- [ ] 习惯打卡 + 番茄钟
- [ ] 数据导出 JSON/CSV/Markdown + 导入
- [ ] 全文搜索（标题+备注+子任务）

### 版本管理
- [ ] 版本号 bump 到 v1.25.0
- [ ] README 更新日志
- [ ] git commit + push

---

## 七、风险控制

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| P5-03 颜色替换遗漏 | 高 | 中 | 分 5 批替换，每批验证深色模式 |
| P5-03 深色模式文字不可见 | 中 | 高 | 每批替换后手动检查关键页面 |
| P5-02 自定义强调色变体计算不准 | 中 | 低 | 用颜色库或简单算法，可接受近似值 |
| P5-05 系统主题监听器泄漏 | 低 | 低 | 组件卸载时 removeEventListener |

**回滚策略**：
- A 方向：每任务一个 commit，颜色替换分批 commit
- B 方向：纯重构，每任务一个 commit
- C 方向：测试不影响功能

---

## 八、Phase 5 之后的展望（Phase 6 候选）

1. **主题市场** — 用户分享/导入主题
2. **任务模板系统** — 常用任务快速创建
3. **多设备同步** — Git / WebDAV
4. **国际化 i18n** — 中/英切换
5. **E2E 测试** — Playwright
6. **性能优化** — 虚拟列表、懒加载、SQL 优化
7. **插件系统** — 第三方扩展
8. **LLM 流式 + 操作流式执行** — AI 边生成边执行操作

---

## 九、不建议在 Phase 5 做的事

1. ❌ **不做主题市场** — Phase 6 做
2. ❌ **不做 E2E 测试** — Phase 6 做
3. ❌ **不拆 task_crud.rs（343行）** — 接近边界，可接受
4. ❌ **不做自定义 CSS 编辑** — 复杂度过高
5. ❌ **不加更多预设主题** — 6 套够用，后续按需添加

Phase 5 的核心目标：**主题系统从"深浅切换"升级到"6 套配色 + 自定义强调色 + CSS 变量体系" + 拆完最后大文件**。
