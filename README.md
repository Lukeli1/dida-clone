# 滴答清单（本地版）

基于 Tauri v2 + React + TypeScript + SQLite 构建的本地任务管理桌面应用，集成大模型 AI 能力。数据完全本地存储，无需联网，隐私安全。

![版本](https://img.shields.io/badge/version-1.31.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Tauri](https://img.shields.io/badge/Tauri-v2-orange)
![React](https://img.shields.io/badge/React-18-61dafb)
![CI](https://github.com/Lukeli1/dida-clone/actions/workflows/ci.yml/badge.svg)

## 截图

（待补充）

## 功能特性

### 任务管理
- 三栏布局：侧边栏 | 任务列表 | 任务详情
- 任务支持：标题、备注、优先级（高/中/低）、截止时间、时间段、提醒、重复规则
- **Markdown 备注**（v1.8.0）：任务备注支持 Markdown 语法编辑与实时预览，支持 GFM（表格、列表、代码块等）
- **自定义重复规则**（v1.8.0）：重复规则支持每N天、每周特定几天、每月特定日期、每季度、每年等丰富选项
- 子任务：支持多级任务拆解，独立勾选完成
- **子任务双击编辑**（v1.8.0）：任务详情中子任务标题支持双击进入行内编辑，Enter 保存 / Esc 取消
- **子任务进度统计**（v1.8.0）：详情页子任务区域显示"X/Y 已完成"进度统计
- **详情页子任务创建**（v1.7.0）：任务详情页标题栏新增子任务按钮，点击展开子任务列表区域，支持复选框勾选、删除、回车快速添加
- **子任务独立勾选**（v1.7.0）：任务列表和详情页中子任务复选框独立切换完成状态，不再错误标记父任务完成
- 标签与清单：多清单管理，彩色标签分类，二级标签嵌套
- **任务颜色体系**（v1.11.0）：任务继承清单颜色，在任务列表、月视图、周视图、日视图中以彩色条带/圆点/标签形式展示；无清单色时回退到优先级色（高=红、中=黄、低=蓝、无=灰）
- **二级嵌套标签**（v1.8.0）：标签支持父子层级关系，创建时可选择父标签，侧边栏树形展示
- **智能日期识别**（v1.8.0）：输入"明天下午3点开会"等自然语言自动解析时间、优先级和重复规则，输入框下方实时预览识别结果
- 拖拽排序：任务可拖拽调整顺序
- 右键菜单：日期快捷设置（今天/明天/7天后/自定义/清除）、优先级快捷设置（高/中/低/无）、置顶/取消置顶、标签子菜单（勾选+新建）、创建副本、删除确认
- 已过期模块：今日视图聚合逾期未完成任务
- **快速编辑**（v1.2.0）：双击任务标题行内编辑，Enter 保存 / Esc 取消
- **批量操作**（v1.2.0）：多选 + 批量完成/归档/设优先级/移动清单/删除
- **任务归档**（v1.2.0）：完成超 7 天自动归档 + 归档视图 + 一键恢复
- **拖拽到日历**（v1.2.0）：拖任务至浮动迷你日历即可设置截止日期
- **任务搜索增强**（v1.2.0）：组合筛选（优先级/日期范围/标签/清单）

### 日历视图
- 月视图：悬停"+"按钮快速添加，双击打开详细弹窗
- 周视图：单击快速添加，拖拽时间段创建任务
- 日视图：同周视图，支持时间段任务块
- 任务块高度按时长自动计算（支持 end_date 字段）
- **甘特图视图**（v1.2.1）：21 天时间轴，左侧任务列表 + 右侧任务条，支持拖拽调整截止日期
- **看板视图**（v1.2.1）：三列看板（待处理/进行中/已完成），拖拽卡片在列间移动自动改变状态
- **任务侧边栏**（v1.2.1）：日历工具栏新增「侧边栏」按钮，按清单分组显示任务，支持搜索和拖拽到日历
- **更多选项菜单**（v1.2.1）：日历工具栏右上角 ⋯ 按钮，统一切换月/周/日/甘特/看板视图
- **任务拖拽**（v1.2.1）：月视图拖拽任务保留原时间；周/日视图拖拽任务到任意时间格（15 分钟对齐）；保留原任务时长

### AI 智能助手（v1.1.0 新增）
- **AI 对话界面**：ChatGPT 风格多轮对话，始终可访问任务数据
- **10 个预设技能**：
  - 📊 今日总结 — 生成今日工作总结
  - 📅 周报生成 — 生成本周工作周报
  - 🔍 智能搜索 — 自然语言语义搜索任务
  - 🏷️ 自动标签 — 为任务推荐标签分类
  - ⏰ 时间估算 — 估算任务耗时并建议提醒
  - ⚖️ 冲突检测 — 检测时间冲突与重复任务
  - 📋 智能排序 — 按重要紧急矩阵排序
  - 🎯 任务模板 — 生成会议/出差等模板
  - 🧩 任务拆解 — 拆解复杂任务为子任务
  - 💡 优先级建议 — 建议任务优先级
- **自然语言添加任务**：输入"明天下午3点开会"，AI 自动解析时间、优先级

### 半自动操作模式（v1.1.0 新增）
- AI 识别操作意图后返回结构化指令
- 弹窗确认卡片：显示操作描述 + JSON 预览
- 支持 5 种操作：创建/修改/删除/完成任务/创建子任务
- 严格权限白名单，AI 无法执行系统命令或读写文件
- 用户必须主动确认才会执行

### 大模型 API 配置
- 支持 OpenAI 兼容协议（OpenAI、DeepSeek、通义千问、Moonshot 等）
- 测试连接：自动获取可用模型列表
- 模型厂商存储：保存配置后一键切换不同厂商
- 思考模式开关：支持推理模型的 reasoning_effort 参数（低/中/高三档）

### 设置模块
- **外观**：显示字体（7 种预设 + 系统字体选择器）、字体大小（正常/大/超大三档全局缩放）、侧边栏密度（紧凑/舒适/宽松三档间距）
- **通用**：主题（浅色/深色/跟随系统）、一周起始日、删除确认
- **通知**：桌面通知、提醒声音
- **大模型 API**：配置、测试连接、模型选择、厂商管理、思考模式
- **系统**：开机自启、数据导出
- **关于**：应用信息

### 高级视图（v1.3.0 新增）
- **四象限视图**：2×2 Eisenhower 矩阵（重要且紧急 / 重要不紧急 / 紧急不重要 / 不紧急不重要），支持拖拽任务改变优先级
- **番茄钟**：25 分钟专注 / 5 分钟短休息 / 15 分钟长休息，圆环进度展示，支持任务选择、自定义时长、当日/累计专注统计
- **习惯打卡**：每日习惯追踪，7 天迷你日历，进度条，连续打卡统计，支持自定义目标、单位和 emoji

### UI/UX 优化
- 自定义应用图标
- 系统托盘集成（关闭窗口时最小化到托盘）
- 设计令牌系统、统一 focus ring
- 任务行高 56px、优先级左侧色条
- 打勾弹跳动画、拖拽指示线、细滚动条
- 键盘快捷键：Ctrl+N 新建、Ctrl+F 搜索、Ctrl+1/2/3/4/5 切换视图、?/F1 快捷键帮助、Ctrl+B 折叠侧边栏（预留）；支持设置面板自定义快捷键
- **深色模式完善**（v1.2.1）：全局 CSS 覆盖策略，背景/文字/边框/输入框/滚动条/主题色全适配，应用启动立即应用主题
- **设置模块位置**（v1.2.1）：从智能清单列表移至侧边栏左下角固定底部栏

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript + Vite |
| 样式 | Tailwind CSS |
| 桌面端 | Tauri v2（Rust） |
| 本地数据库 | SQLite（rusqlite with bundled feature） |
| HTTP 请求 | reqwest（Rust 端调用 LLM API） |
| 日期处理 | date-fns |
| 大模型协议 | OpenAI 兼容（/v1/models, /v1/chat/completions） |
| 状态管理 | Zustand v5 |
| 虚拟列表 | @tanstack/react-virtual v3 |

## 快速开始

### 环境要求
- Node.js 18+
- Rust（stable）
- 系统依赖：Windows 需要 WebView2

### 安装与运行
```bash
# 安装依赖
npm install

# 开发模式（热更新）
npm run tauri dev

# 打包独立 exe
npm run tauri build
```

打包后 exe 位于 `src-tauri/target/release/dida-clone.exe`。

### 配置大模型 API
1. 打开应用 → 设置 → 大模型 API
2. 填写 API 地址（如 `https://api.deepseek.com/v1`）和密钥
3. 点击"测试连接"获取可用模型列表
4. 选择模型，点击"保存厂商"方便后续切换
5. 回到任务列表，点击输入框右侧 AI 按钮或侧边栏"AI 助手"开始使用

## 项目结构

```
滴答清单复刻/
├── src/                        # 前端源码
│   ├── components/
│   │   ├── AIAssistant.tsx     # AI 对话助手（v1.1.0）
│   │   ├── CalendarView.tsx    # 日历视图容器（v1.2.1 含侧边栏 + 更多选项）
│   │   ├── DayView.tsx         # 日视图
│   │   ├── EmptyState.tsx      # 统一空状态组件（v1.3.0）
│   │   ├── GanttView.tsx       # 甘特图视图（v1.2.1）
│   │   ├── HabitView.tsx       # 习惯打卡视图（v1.3.0）
│   │   ├── KanbanView.tsx      # 看板视图（v1.2.1）
│   │   ├── MonthView.tsx       # 月视图
│   │   ├── PomodoroView.tsx    # 番茄钟视图（v1.3.0）
│   │   ├── QuadrantView.tsx    # 四象限视图（v1.3.0）
│   │   ├── SettingsView.tsx    # 设置模块
│   │   ├── Sidebar.tsx         # 侧边栏（v1.2.1 设置移至左下角，v1.3.0 新增高级视图）
│   │   ├── StatsView.tsx      # 统计面板
│   │   ├── TaskDetail.tsx     # 任务详情
│   │   ├── TaskItem.tsx       # 任务项
│   │   └── Toast.tsx          # 通知组件
│   ├── utils/
│   │   ├── llm.ts             # 大模型工具函数（配置/对话/技能/操作指令）
│   │   └── priority.ts       # 优先级样式
│   ├── App.tsx                # 主应用
│   ├── api.ts                 # API 封装（Tauri invoke + 浏览器降级）
│   └── types.ts               # 类型定义
├── src-tauri/                  # Rust 后端
│   ├── src/
│   │   ├── commands.rs         # Tauri 命令（任务/清单/标签 CRUD）
│   │   ├── db.rs              # SQLite 数据库初始化与迁移
│   │   ├── llm.rs             # 大模型 API 调用（test_llm_connection, llm_chat）
│   │   ├── lib.rs             # 应用入口与命令注册
│   │   └── main.rs            # Windows 子系统配置
│   ├── icons/                 # 应用图标
│   ├── Cargo.toml             # Rust 依赖
│   └── tauri.conf.json        # Tauri 配置
└── package.json
```

## 版本历史

### v1.31.0（2026-06-30）

#### Phase 10 — 功能深化 + UI/UX 打磨 + 架构清理

**方向 A：功能模块深化**
- **任务重复规则**（P10-01）：RFC 5545 RRULE 简化版完整实现（前后端 + 40 个测试用例）；支持每天/每周指定星期/每月/每年重复 + 自定义间隔 + 结束条件；完成任务后自动生成下一个周期副本
- **AI 对话记忆**（P10-02）：aiStore + localStorage 持久化，关闭面板后对话保留；用户偏好自动检测（"记住我…"/"我喜欢…"等模式）+ 确认保存 + 注入 systemPrompt；支持"忘记所有偏好"
- **任务列表虚拟滚动**（P10-03）：@tanstack/react-virtual 替换全量渲染，500+ 条任务流畅滚动（FPS > 50）；动态高度测量 + 子任务展开自适应
- **搜索高亮 + 搜索历史**（P10-04）：搜索关键词在标题中高亮显示（`<mark>` 标签）；搜索框聚焦时显示 10 条历史搜索词，点击快速搜索

**方向 B：UI/UX 打磨**
- **详情面板滑入动画**（P10-05）：右侧滑入 200ms cubic-bezier 缓动；全局过渡时长统一（200ms 为主，300ms 用于大型面板）
- **右键菜单键盘导航**（P10-06）：useMenuKeyboard hook，↑↓ 选择主菜单项、←→ 在水平子菜单中导航、Enter 确认、Esc 关闭；作用域协调器避免子菜单 Enter 重复触发
- **暗色模式对比度修复**（P10-07）：`--color-text-tertiary` 从 #5f6368 提升到 #9CA3AF（对比度 3.2:1 → 6.6:1，达到 WCAG AA 标准）；HabitCalendar、StatsView 等组件对比度修复
- **全局 Loading + 骨架屏**（P10-08）：AppSkeleton 启动骨架屏（模拟 TitleBar + Sidebar + TaskList 布局）；TopProgressBar 顶部进度条 + uiStore.globalLoading 状态

**方向 C：架构清理**
- **清理未使用依赖**（P10-09）：移除 @tanstack/react-query；vitest.config.ts 排除 tests/** 防止 Playwright 用例被误收集；新增 test:unit / test:e2e 独立脚本
- **快捷键自定义读取**（P10-10）：useKeyboardShortcuts 从硬编码改为数据驱动，合并 DEFAULT_SHORTCUT_BINDINGS + uiStore.customShortcuts；normalizeCombo / buildCombo 工具函数；ShortcutsHelp 面板显示当前生效按键
- **Rust 文件合并**（P10-11）：task_crud.rs 合并到 task_commands.rs，减少文件碎片；事务安全验证通过（reorder/complete/duplicate/delete 均已包裹事务）

### v1.30.0（2026-06-30）

#### Phase 9 — 新功能 + 性能优化

**新增功能**
- **任务模板**（P9-01）：后端 template_commands.rs + subtask_templates 表；前端 TemplateView + TemplateEditor，支持从现有任务创建模板、应用模板快速创建任务
- **习惯统计图表**（P9-02）：recharts 实现 7 天柱状图 + 月度热力图 + 30 天趋势折线
- **当前时间红线**（P9-03）：周视图和日视图中显示红色当前时间线
- **任务附件**（P9-04）：后端 attachment_commands.rs + attachments 表 + open crate；前端 TaskAttachments 组件，支持添加/删除/打开附件
- **新手引导**（P9-05）：react-joyride v3 实现 5 步引导流程
- **通知中心**（P9-06）：uiStore + NotificationCenter 组件 + TitleBar 铃铛图标
- **快捷键自定义面板**（P9-07）：录制快捷键 + 冲突检测 + 恢复默认

**测试与性能**
- **Playwright E2E 框架**（P9-08）：5 个测试文件覆盖核心流程
- **性能优化**（P9-09）：React.memo + custom comparison、useMemo、useCallback、lazy loading

### v1.29.0（2026-06-30）

#### Phase 8 — 架构拆分 + 功能增强

**大文件拆分**
- CalendarView（446→83 行）→ CalendarToolbar + ViewRenderer + TaskSidebar + calendarUtils
- TaskContextMenu（437→231 行）→ DateMenu + PriorityMenu + TagMenu + menuItems
- HabitCard（392→199 行）→ HabitStats + HabitActions
- DayView（383→218 行）→ DayViewGrid + DayViewTask + dayViewUtils
- SettingsView 拆分为 AppearancePanel（340→175）+ SystemPanel（325→174）+ FontPanel + DensityPanel + DataPanel + CleanupPanel
- HabitView（311→198 行）→ HabitList
- api.ts（407→30 行）→ 7 个子模块

**功能增强**
- **快捷键帮助面板**（P8-08）：? / F1 键 + TitleBar 帮助按钮触发
- **TaskNotes 编辑/预览**（P8-09）：编辑/预览标签页切换 + localStorage 草稿保存

### v1.28.0（2026-06-29）

#### UI/UX 全面优化

**颜色体系统一**
- 新增 CSS 变量体系：`--color-ai`、`--color-toggle-off/dot`、`--color-tooltip-bg/text`、`--color-mask` 等，浅色/深色双模式全覆盖
- 优先级工具函数 `PRIORITY_STYLES` 的 hex 值与 CSS 变量对齐（高`#ea4335`、中`#f9ab00`、低`#4f86f7`、无`#9aa0a6`）
- 修复 20+ 文件硬编码颜色：AI 助手紫色改用 `--color-ai`，Toggle 开关深色模式可见，TaskDetail/ContextMenu/StatsView/Pomodoro/Quadrant/Habit/ListSection/TagSection/Toast/AppearancePanel 全部统一
- 右键菜单日期按钮 hover 色统一为语义变量，优先级选中态 ring 统一，置顶色改用 warning 变量

**全局确认对话框**
- 新建 `ConfirmDialog` 组件，支持 danger/普通模式、ESC 关闭、点击遮罩关闭、缩放动画
- 替换所有原生 `confirm()`：TaskDetail 删除、ListSection 删除清单、TagSection 删除标签、HabitView 删除习惯、AIAssistant 清空对话、BatchToolbar 批量删除、AppearancePanel 重置默认

**动画体系补全**
- CSS 新增 5 个动画类：`slideInRight/slideOutRight/fadeIn/slideUp/slideDown`
- 详情面板滑入/滑出动画、右键菜单/更多菜单 scale-in 入场、Toast 退出动画
- 可折叠面板平滑展开：SubtaskList/TaskAIPanel/新建清单/新建标签/番茄钟设置面板
- 设置面板右侧内容切换淡入、AI 技能菜单 scale-in、聊天消息 slide-up 入场
- 批量工具栏/筛选栏入场动画

**交互反馈增强**
- 全局按钮按压反馈：`active:scale-[0.97]`，图标按钮 `active:scale-90`
- Toast 增强：退出动画、hover 暂停自动关闭、最多 5 条、useRef 管理 ID、ARIA 属性
- 各场景 Toast 反馈：批量操作、习惯 CRUD、四象限拖拽、清单/标签创建
- 详情面板更多菜单：外部点击关闭 + ESC 关闭
- 弹出菜单边界检测：TaskContextMenu/ListSection/TagSection 自动调整位置防溢出

**样式规范统一**
- Checkbox 尺寸统一（任务列表/四象限/番茄钟 18px，日历紧凑 12-14px）
- 圆角规范：卡片 `rounded-xl`，按钮 `rounded-lg`，小元素 `rounded-md`
- 批量工具栏尺寸优化：padding 增大、focus ring、disabled 光标
- 侧边栏选中态统一：ListSection/TagSection/ViewSwitcher 不透明背景 + 左侧彩色指示条
- 圆点规格统一：清单/标签一级 `w-2.5 h-2.5` + 白边，二级 `w-2 h-2`
- SettingsView 导航图标颜色统一继承
- 筛选栏增强：显示匹配任务数、select hover 效果

**功能体验增强**
- 右键菜单 emoji 全部替换为内联 SVG 图标（太阳/日出/日历/X/优先级圆点）
- 番茄钟增强：document.title 倒计时显示、Notification API 桌面通知、sessionsInCycle 修复
- 滚动条样式优化：6px 圆角精致滚动条

### v1.27.1（2026-06-29）

#### UI 美化全面升级

**视觉设计优化**
- **主题色系统重构**：浅色模式背景调整为更温暖的 `#f8f9fb`，强调色升级为现代蓝 `#4f86f7`；深色模式全面重制为更精致的暗色调配；新增语义化变量（`--color-surface-hover`、`--color-accent-soft`、`--color-text-muted` 等）
- **精致阴影层级**：新增多层阴影变量（`--shadow-xs` 到 `--shadow-modal`），悬停时卡片轻微上浮并投射阴影
- **全局圆角统一**：按钮、输入框、卡片统一为 `rounded-xl` 圆角风格

**动画与交互增强**
- **新增动画**：`float-up`（悬浮上升）、`scale-in`（缩放弹出）、`dropdown-enter`（下拉菜单）
- **优化动画曲线**：统一使用 `cubic-bezier(0.16, 1, 0.3, 1)` 缓动曲线，更自然的弹性感
- **按钮反馈**：所有按钮添加 `active:scale(0.97)` 点击缩放反馈
- **复选框优化**：勾选弹跳动画更流畅，悬停轻微放大
- **输入框焦点光环**：统一 3px focus ring，品牌色柔和光晕

**组件细节美化**
- **任务卡片**：选中状态品牌色光晕 + 卡片阴影；新增优先级彩色圆点指示器；标签改为圆角胶囊样式 + 细边框 + 悬停微动；子任务完成数绿色高亮；悬停显示操作提示
- **侧边栏导航**：导航项统一为圆角 pill 风格；数字徽标改为圆角胶囊；分区标题字母间距加宽；头像区域渐变背景 + 悬停环色变化；下拉菜单 scale-in 动画
- **标题栏**：左侧新增品牌色圆角图标背景，按钮区域更宽敞
- **空状态**：图标外增加圆角背景容器，添加 scale-in 入场动画
- **任务输入栏**：输入框圆角升级 + 更粗的 focus ring；添加按钮增加阴影和 active 缩放反馈

### v1.27.0（2026-06-29）

#### Phase 7 — Bug 修复与收尾打磨

**Bug 修复**
- **四象限右键菜单**（P7-01）：四象限视图任务卡片支持右键菜单（删除/归档/置顶/标签/副本等），与任务列表行为一致
- **习惯模块日历图**（P7-02）：习惯卡片展开后可查看月历历史打卡记录，支持翻月、统计本月/累计打卡天数
- **AI 技能按钮集成**（P7-03）：AI 助手技能选择从常驻列表改为输入框旁闪电⚡按钮弹出菜单，活跃技能显示状态栏

**架构收尾**
- `sync.rs`（381→124 行）→ `sync_ops.rs`（215 行）
- `SyncPanel.tsx`（460→289 行）→ `SyncStatusPanel.tsx`（160 行）

### v1.26.0（2026-06-29）

#### Phase 6 — Git 数据同步与 Rust 文件收尾

**方向 A：Git 数据同步后端**
- `sync.rs` — git2 crate 实现 clone/pull/push/status/conflict，支持 HTTPS+SSH 认证
- `sync_commands.rs` — 5 个 Tauri command（get/save config, init repo, sync now, get status）
- `lib.rs` — 自动同步定时器（启动延迟 10s，按配置间隔循环同步）

**方向 B：同步 UI + 设置入口**
- `types/sync.ts` + `api.ts` syncApi — 前端 API 封装（5 个方法）
- `SyncPanel.tsx` — 完整同步设置面板（仓库配置/自动同步/手动同步/冲突处理）

**方向 C：Rust 文件收尾**
- `data_export.rs`（336→29 行）→ 4 文件（json/csv/markdown 各独立模块）
- `task_crud.rs`（343→22 行）→ 4 文件（create/update/query 各独立模块）

### v1.25.0（2026-06-29）

#### Phase 5 — 主题系统重构与收尾打磨

**方向 A：主题系统重构**
- CSS 变量主题体系（30+ 语义化变量，浅色/深色两套）
- 6 套预设主题（默认蓝/护眼绿/优雅紫/活力橙/玫瑰红/莫兰迪）+ 自定义强调色
- 全组件颜色迁移到 CSS 变量（~50 个文件）
- 主题预览面板 + 实时切换
- 主题持久化 + useTheme hook + 系统主题跟随

**方向 B：拆分最后大文件**
- `AIAssistant.tsx`（533→264 行）→ `ai/` 目录 5 个文件
- `data_commands.rs`（574→12 行）→ `data_export.rs` + `data_import.rs`

**方向 C：测试补强**
- 新增 3 个测试文件（themes/themeUtils/exportImport），19 个用例
- 总测试数：169 → 188

### v1.24.0（2026-06-29）

#### Phase 4 — 功能增强与体验打磨

**方向 A：拆分最后 3 个大文件**
- `WeekView.tsx`（535→229 行）+ `MonthView.tsx`（490→291 行）→ `calendar/` 目录 10 个文件（含 shared/ 共享组件）
- `task_commands.rs`（494→10 行）→ `task_crud.rs`（335 行）+ `task_ops.rs`（237 行）

**方向 B：LLM 流式响应（打字机效果）**
- 后端新增 `llm_chat_stream` command，SSE 流式返回
- 前端 AI 对话接入流式，打字机逐字显示
- 支持中途取消生成
- 保留非流式 `llm_chat` 作为 fallback

**方向 C：数据导出/导入**
- 后端新增 4 个 command：`export_json` / `export_csv` / `export_markdown` / `import_json`
- 前端设置页新增导出/导入 UI
- 支持 JSON（完整备份）/ CSV（Excel 可开）/ Markdown（可读）
- 导入支持合并和替换两种模式

**方向 D：全文搜索增强**
- 搜索从仅匹配标题扩展到标题 + 备注 + 子任务标题
- 搜索结果显示匹配来源标签（"备注命中" / "子任务命中"）
- 新增 18 个搜索测试用例

**方向 E：CI/CD 基础**
- GitHub Actions 自动测试流水线（`.github/workflows/ci.yml`）
- push/PR 自动运行 tsc + vitest + cargo check

### v1.23.0（2026-06-29）

#### Phase 3 — 深度优化

**方向 A：完成剩余大文件拆分**
- `Sidebar.tsx`（722→66 行）→ `sidebar/` 目录 6 个文件
- `TaskItem.tsx`（707→227 行）→ `task-item/` 目录 4 个文件
- `TaskListPanel.tsx`（628→294 行）→ `task-list/` 目录 5 个文件
- `PomodoroView.tsx`（572→247 行）→ `pomodoro/` 目录 5 个文件
- `commands.rs`（857→27 行）→ `commands/` 目录 5 个子模块

**方向 B：习惯数据迁移到 SQLite**
- 新建 `habits` + `habit_records` 表（含索引和外键约束）
- 实现 8 个 Tauri command（CRUD + 打卡记录 + 归档）
- 前端习惯模块从 localStorage 切换到 SQLite
- 旧数据自动迁移脚本（保留 7 天备份）

**方向 C：引入单元测试**
- 配置 vitest 测试环境（jsdom + @testing-library）
- 工具函数测试：smartDate/priority/appearance/avatar（64 用例）
- Store 测试：taskStore/filterStore/uiStore（37 用例）
- LLM 测试：llm.ts + prompts/（50 用例）
- **总计 151 个测试用例全部通过**

### v1.22.0（2026-06-28）

#### 架构重构 — Phase 2
将 6 个超大文件拆分为模块化结构，零功能变更：

- **llm.ts（492→293 行）**：提取 10 个 prompt 模板到 `prompts/` 目录，核心调用逻辑保留在 llm.ts
- **useTaskActions.ts（467→133 行）**：拆分为 5 个子 hook（CRUD/Reorder/Batch/Subtask/InlineEdit）+ 聚合层
- **HabitView.tsx（1439→274 行）**：拆分为 `habit/` 目录下 8 个文件（constants/Card/Editor/IconPicker/FocusTimer/CreateForm/DayCell）
- **SettingsView.tsx（842→133 行）**：拆分为 `settings/` 目录下 8 个文件（Appearance/General/Notification/LLMApi/System/About/Toggle）
- **TaskDetail.tsx（712→197 行）**：拆分为 `detail/` 目录下 4 个文件（SubtaskList/TaskNotes/TaskMetaPanel）
- **App.tsx（740→175 行）**：提取 TaskListPanel/DetailPanel/CalendarPanel 三个子组件 + useTaskListState hook

### v1.21.1（2026-06-28）

#### 安全加固
- **关闭 withGlobalTauri**：禁用 `window.__TAURI__` 全局注入，消除 XSS 攻击面
- **移除 __TAURI__ 检测**：`api.ts` 不再依赖全局变量检测运行环境

#### 后端优化
- **get_tasks 过滤参数**：新增 `list_id`/`include_completed`/`include_archived` 三个可选参数，支持按需查询子集

### v1.19.0（2026-06-28）

#### 安全加固
- **SQLite WAL + 外键约束**：启用 WAL 模式提升并发性能，开启外键约束保障数据完整性
- **CSP 安全策略**：设置内容安全策略，限制脚本/样式/图片/连接来源
- **数据库索引**：新增 8 个索引（list_id/parent_id/completed/archived/pinned/sort_order/task_tags），提升查询性能

#### 架构优化
- **Rust 代码重构**：消除重复 Task 结构体定义，提取 `add_column_if_not_exists` 和 `now_rfc3339` 辅助函数，16 处 `.lock().unwrap()` 改为 `.map_err()` 错误处理
- **get_tasks 性能优化**：标签合并从 O(N*M) 线性查找改为 HashMap O(N)
- **事务原子性**：delete_task/duplicate_task/reorder_tasks/complete_task 4 处操作包裹事务
- **移除死依赖**：删除未使用的 tauri-plugin-shell
- **清理死代码**：删除 src/lib/ 下 4 个未使用的 react-query 基础设施文件

#### 前端改进
- **AI 请求超时**：LLM 请求添加 30 秒（testConnection）/ 60 秒（chat）超时保护
- **alert 替换为 toast**：8 处 alert() 替换为非阻塞式 toast 通知
- **Error Boundary**：新增全局错误边界，防止单组件崩溃导致白屏

### v1.18.0（2026-06-28）

#### 新增功能
- **日历点击打卡**：习惯打卡模块的迷你 7 天视图和展开日历格子均可直接点击完成/取消打卡，未来日期不可点击
- **自定义习惯图标**：新建习惯时支持输入任意 emoji 作为图标，除 8 个预设图标外可自由扩展

#### 改进
- 习惯打卡交互更接近滴答清单原版，减少对 `+1`/`-1` 按钮的依赖

### v1.17.0（2026-06-27）

#### 新增功能
- **自定义 HTML 标题栏**：隐藏原生 Windows 标题栏，替换为与界面风格统一的 HTML 自定义标题栏；左侧显示应用名称和图标，右侧三个窗口控制按钮（最小化/最大化/关闭）；深色模式灰蓝底色、浅色模式浅灰底色，关闭按钮 hover 变红
- **新增 Rust 窗口控制命令**：`window_minimize`/`window_maximize`/`window_unmaximize`/`window_toggle_maximize`/`window_is_maximized`/`window_close`

#### 改进
- 顶部标题栏与主界面风格统一，消除原生白色标题栏的割裂感

### v1.16.0（2026-06-27）

#### 新增功能
- **自定义头像**：侧边栏顶部 logo 区域可上传自定义头像，点击弹出菜单支持上传/更换/移除操作，图片自动裁剪压缩为 128x128 并持久化存储

### v1.15.0（2026-06-27）

#### 新增功能
- **设置中心左右分栏改造**：设置页从单列滚动布局重构为左侧分类导航栏 + 右侧内容区，6 个分类（外观/通用/提醒与通知/大模型 API/系统/关于），每项带 SVG 图标；选中分类蓝色高亮 + 右侧蓝色竖线标识；所有设置项、状态逻辑、useEffect/handler 完全保持不变，纯 UI 重构

#### 改进
- 设置页视觉更接近滴答清单原版，分类清晰，导航效率提升

### v1.14.1（2026-06-27）

#### Bug 修复
- **今日视图创建任务不显示**：在今日视图下创建任务时，若未识别到日期关键词，自动将截止日期设为今天，确保任务立即出现在今日列表
- **设置页版本号不更新**：版本号从 `package.json` 动态读取，不再硬编码

### v1.14.0（2026-06-27）

#### 架构重构
- **App.tsx 拆分为 hooks**：将 1500+ 行的 App.tsx 拆分为 4 个自定义 hook（`useAppInit`、`useKeyboardShortcuts`、`useTaskFiltering`、`useTaskActions`），App.tsx 缩减 45%
- **TaskItem Context 收敛**：TaskItem 的 props 从 29 个简化到 6 个，通过 `TaskActionContext` 传递回调函数，减少组件耦合
- **筛选逻辑合并**：视图筛选 + 组合筛选举合并入 `useTaskFiltering` hook，消除重复逻辑
- **tagStore 本地同步**：`addTagToTask`/`removeTagFromTask` 本地同步更新 taskStore，无需手动 reloadTasks

### v1.13.0（2026-06-27）

#### 新增功能
- **「外观」设置分类**：设置模块新增「外观」分类（排在「通用」之前），整合字体、字号、侧边栏密度三项外观相关设置
- **字体大小**：三档可调（正常 1.0x / 大 1.15x / 超大 1.3x），通过 CSS `zoom` 全局按比例缩放，`localStorage` 持久化
- **侧边栏密度**：三档切换（紧凑 4px / 舒适 8px / 宽松 12px），通过 CSS 变量 `--sidebar-py` 控制侧边栏导航项纵向内边距
- **字体设置迁移**：显示字体设置从「通用」迁移到「外观」分类

### v1.12.0（2026-06-27）

#### 新增功能
- **系统字体选择器**：设置 → 通用「显示字体」新增「更多字体」按钮，点击弹出系统已安装字体列表弹窗，支持搜索过滤，每项用该字体渲染名称（所见即所得）；通过 Rust 后端 `font-loader` crate 枚举系统字体，跨平台支持；选中后即时应用并持久化到 `localStorage`

### v1.11.0（2026-06-27）

#### 新增功能
- **任务颜色体系**：任务继承所属清单的自定义颜色，在任务列表（左边框）、月视图（彩色条带）、周视图/日视图（半透明背景 + 彩色左边框）、任务详情页（彩色圆点 + 清单名称）中统一展示；无清单色时回退到优先级色（高=红 `#EF4444`、中=黄 `#F59E0B`、低=蓝 `#378ADD`、无=灰 `#6B7280`）；新增 `getTaskColor()` 和 `hexToRgba()` 工具函数统一颜色获取逻辑
- **显示字体切换**：设置 → 通用新增「显示字体」设置项，提供 7 种预设字体（系统默认、苹方、微软雅黑、思源黑体、霞鹜文楷、思源宋体、JetBrains Mono）+ 自定义字体输入；通过 CSS 变量 `--app-font-family` 实现即时切换，`localStorage` 持久化，启动自动恢复；设置项含实时字体预览

### v1.9.1（2026-06-27）

#### Bug 修复
- **子任务勾选冒泡修复**：TaskItem 中子任务复选框添加 e.preventDefault() 阻止事件冒泡，确保勾选独立触发，不再错误标记父任务完成
- **日期时区丢失 bug**：TaskDetail 中 dueDate/reminder 状态保持完整 ISO 字符串，修复 .slice(0,16) 截断导致时区标记丢失、datetime-local 显示错误时间的问题

#### 改进
- **已过期任务红色高亮**：任务列表和详情页中，已过期未完成任务日期显示为红色，详情页追加"延期N天"提示

### v1.9.0（2026-06-27）

#### 新增功能
- **右键菜单日期快捷设置**：右键菜单增加日期分组，快速设置今天/明天/7天后截止日期，支持自定义日期选择器和清除日期
- **右键菜单优先级快捷设置**：右键菜单增加优先级分组，四色快捷按钮（高🔴/中🟡/低🔵/无⬜），当前优先级高亮显示
- **任务置顶功能**：数据库新增 `pinned` 列，SQL 查询优先排序置顶任务，列表项显示橙色图钉标识+淡橙色背景，右键菜单支持置顶/取消置顶
- **右键标签子菜单**：右键菜单 hover 展开标签子菜单，显示全部标签勾选列表，底部支持新建标签（自动分配随机颜色）
- **创建副本**：后端新增 `duplicate_task` 命令完整复制任务（含标签关联），mock 模式同步实现，右键菜单"创建副本"按钮
- **删除确认弹窗**：删除操作改为内联确认弹窗，避免误操作

#### 改进
- 排序逻辑全面加入 `pinned` 优先
- 右键菜单 UI 重设计：加宽至 52（208px）、圆角阴影调整、分组分隔线、交互区域菜单内操作不关闭菜单
- TaskItem 新增 `pinned` 背景色高亮 + 置顶图标标识

### v1.8.0（2026-06-27）

#### 新增功能
- **Markdown 备注支持**：任务备注区增加编辑/预览切换按钮，预览模式使用 react-markdown + remark-gfm 渲染 GFM Markdown（表格、列表、代码块等），编辑模式 placeholder 提示支持 Markdown 语法
- **自定义重复规则**：重复规则下拉框从 5 个选项扩展到 14 个预设（含每周一三五、每两周、每两天、每月1号/15号、每季度、每年等），后端 compute_next_due_date 支持 JSON 格式规则解析
- **二级嵌套标签**：tags 表新增 parent_id 列，标签支持父子层级关系；创建标签时可选择父标签；侧边栏标签列表树形展示（一级标签 + 缩进二级标签），彩色圆点标识
- **智能日期识别**：新增 smartDate 本地解析器，无需 AI API；支持识别"今天/明天/下周X/X月X日/上午/下午/晚上/X点"等自然语言，自动提取时间、优先级（高/中/低）、重复规则（每天/每周/每月/工作日）；输入框下方实时蓝色预览条显示识别结果

#### Bug 修复
- **子任务勾选冒泡修复**：TaskItem 中子任务复选框添加 e.preventDefault() 阻止事件冒泡，确保勾选独立触发，不再错误标记父任务完成
- **日期时区丢失 bug**：TaskDetail 中 dueDate/reminder 状态保持完整 ISO 字符串，修复 .slice(0,16) 截断导致时区标记丢失、datetime-local 显示错误时间的问题

#### 改进
- TaskDetail 子任务列表支持双击编辑标题、删除按钮添加 tooltip、完成进度统计（X/Y 已完成）
- TaskDetail 标签选择器支持二级分组展示（父标签 + 缩进子标签）
- Sidebar 标签创建表单增加父标签选择下拉框

### v1.7.0（2026-06-27）

#### 新增功能
- **任务详情页子任务管理**：TaskDetail 重写为滴答清单风格三区布局（固定标题区 + 可滚动内容区 + 固定底部工具栏），标题栏新增子任务按钮，点击展开子任务列表区域，支持复选框勾选、删除、回车快速添加子任务；底部工具栏集成 AI 助手、更多操作菜单

#### Bug 修复
- **子任务复选框错误标记父任务完成**：任务列表中展开的子任务复选框原先调用父任务的 `onToggle`，导致点击子任务勾选框会将父任务标记为完成（添加删除线）；新增 `onToggleSubtask` prop 走 `updateTask` 路径独立更新子任务状态
- **详情页子任务操作触发标题失焦保存**：点击子任务复选框/删除按钮会触发标题 textarea 的 `onBlur` → `handleSave()`，可能在子任务更新之前先保存父任务字段；添加 `onMouseDown preventDefault` 阻止焦点转移
- **右键菜单不消失**：每个 TaskItem 维护独立的 `contextMenu` 状态，右键新任务时旧菜单不关闭；新增 `close-context-menus` 自定义事件通知其他实例关闭，同时监听 `contextmenu`、`scroll`、`Escape` 键
- **删除任务 FK 约束失败**：Rust 后端 `delete_task` 在存在子任务或标签关联时因 FOREIGN KEY 约束删除失败；改为先级联删除 `task_tags` 和子任务再删除主任务

#### 改进
- `taskStore.updateTask` 支持嵌套子任务更新（同时更新顶层任务和父任务的 `subtasks` 数组）
- `taskStore.deleteTask` 支持从父任务的 `subtasks` 数组中移除被删子任务

### v1.6.0（2026-06-26）

#### 新增功能
- **周视图任务时间段拖拽调整**：周视图中任务块的上下边缘出现双向箭头调整手柄，按住拖拽上边缘可改变任务开始时间，拖拽下边缘可改变结束时间，15 分钟对齐，拖拽时显示实时时间提示

#### Bug 修复
- **月视图网格未铺满高度**：月视图日历网格下方出现大片空白，未占满工具栏下方可用空间；修复后网格行自动拉伸填满全部高度

### v1.5.0（2026-06-26）

#### 月视图 UI 重设计
- **彩色任务条带**：月视图任务从半透明文字背景改为纯色实心条带，颜色取自清单色（无清单色时回退到优先级色或循环色板），与滴答清单原版风格一致
- **智能文字颜色**：根据条带背景亮度自动切换白色/深色文字（luminance 算法），保证可读性
- **今日高亮**：日期数字使用蓝色圆形背景 `#378ADD` + 白色文字
- **农历/节气标注**：日期下方显示二十四节气或星期简写
- **任务排序**：未完成在前 + 按时间排序
- **显示 4 条任务**：单日最多显示 4 条，溢出显示 "+N 项"
- **单元格增高**：从 110px 增加到 120px
- **背景色**：整体改为 `#FAFAFA` 浅灰底
- **弹窗样式**：边框/阴影柔化，品牌色统一

#### 改进
- 视图切换按钮激活态文字色从 `text-gray-900` 改为 `text-[#378ADD]`，与品牌色统一

### v1.4.0（2026-06-26）

#### 架构重构
- **Zustand 状态管理层**：引入 6 个独立 store（taskStore/listStore/tagStore/filterStore/uiStore/localStorageStore），将 App.tsx 中 22 个 useState 全部迁移，状态可预测、可测试
- **TanStack Query 缓存层**：引入 QueryClient + queryKeys + invalidate 基础设施，支持 30 秒缓存、乐观更新、错误重试；浏览器降级模式下自动关闭缓存
- **虚拟列表**：新增 TaskList 组件，使用 @tanstack/react-virtual 实现按需渲染，支持动态高度测量（子任务展开自适应）
- **统一错误处理**：新增 AppError 类和 handleApiError 工具函数

#### 性能优化
- **taskTree 算法优化**：从 O(n*m) 的多次 filter 改为 O(n) 的 Map-based 单次遍历，大幅优化大数据量下的列表渲染性能
- **组件拆分**：将内联 TaskItem（~320 行）提取为独立文件，App.tsx 从 1767 行减少到约 1100 行

#### 安全修复
- **移除硬编码 API Key**：`src/utils/llm.ts` 中移除硬编码的 API Key，改为从 localStorage 读取，无配置时返回 null

#### 技术改进
- 新增 `src/stores/` 目录（6 个 Zustand store）
- 新增 `src/lib/` 目录（queryClient/queryKeys/invalidate/errorHandler）
- 新增 `src/components/TaskItem.tsx` 独立任务项组件
- 新增 `src/components/TaskList.tsx` 虚拟列表组件
- `src/main.tsx` 已包裹 QueryClientProvider

### v1.3.0（2026-06-26）

#### 新增功能
- **四象限视图**：Eisenhower 矩阵（重要且紧急 / 重要不紧急 / 紧急不重要 / 不紧急不重要），支持拖拽任务到不同象限自动切换优先级
- **番茄钟**：25 分钟专注 / 5 分钟短休息 / 15 分钟长休息，SVG 圆环进度、任务选择器、自定义时长、当日/累计专注统计
- **习惯打卡**：每日习惯追踪，图标 + 名称 + 今日进度条 + 7 天迷你日历，支持自定义目标、单位、emoji，连续打卡统计
- **主色优化**：品牌色调整为 `#378ADD`（原版滴答清单柔和蓝），全局字体栈改为系统字体（更贴近原生体验）
- **任务卡片化**：任务列表采用卡片式布局（圆角 + 边框 + 悬停效果），批量操作栏减轻视觉权重，右键菜单阴影优化

#### 改进
- 优先级颜色对齐：低优先级从绿色改为蓝色 `#378ADD`，中优先级从 yellow 改为 amber
- 空状态统一：新建 EmptyState 组件，图标 + 标题 + 副标题，各视图复用
- 侧边栏选中态柔化：`bg-blue-50/60 text-[#378ADD]` 替代高饱和蓝色，清单项增加左侧色条标识
- 日历视图更多选项下拉阴影减轻

### v1.2.1（2026-06-25）

#### 新增功能
- **甘特图视图**：21 天时间轴，左侧任务列表（清单色点 + 标题 + 优先级点）+ 右侧任务条（颜色取自清单色），支持拖拽任务条调整截止日期，工具栏上一周/今天/下一周
- **看板视图**：三列看板（待处理/进行中/已完成），卡片显示清单标签/标题/截止日期/子任务进度/备注图标/优先级点；拖拽卡片在列间移动自动改变状态（拖到「已完成」标记完成，拖到「待处理」清除截止日期，拖到「进行中」设置今天为截止日期）
- **任务侧边栏**：日历工具栏新增「三横线」按钮切换右侧固定侧边栏，按清单分组显示任务（带搜索框 + 提示条 + 清单色点 + 优先级色点），支持拖拽任务到月/周/日任何视图的日期格子
- **更多选项菜单**：日历工具栏右上角 ⋯ 按钮（三个竖排圆点），统一切换月/周/日/甘特/看板视图，当前视图显示蓝色对勾
- **日视图任务拖拽**：DayView 添加 onMoveTask prop，任务块 draggable，拖拽到任意时间格（15 分钟对齐）
- **深色模式完善**：全局 CSS 覆盖策略（无需逐组件修改），在 .dark 选择器下覆盖常见 Tailwind 颜色类（背景/文字/边框/悬停/输入框/滚动条/主题色），应用启动时立即应用保存的主题

#### 改进
- **设置模块位置**：从智能清单列表移至侧边栏左下角固定底部栏（带 border-t 分隔线）
- **月视图拖拽**：拖拽任务保留原时间部分，只替换日期
- **周/日视图拖拽**：根据鼠标 Y 位置计算具体时间（15 分钟对齐），保留原任务时长（如有 end_date 则同步调整）
- **handleMoveTask**：保留原任务时长，按原始 end_date - due_date 时长同步调整

#### 修复
- **HTML5 拖拽失效**：Tauri WebView2 默认拦截原生拖拽事件导致显示禁止图标；在 tauri.conf.json 设置 `dragDropEnabled: false` 禁用 Tauri 原生文件拖放拦截
- **dropEffect 不匹配**：MonthView/WeekView/DayView 的 handleDragOver 中 `dropEffect = draggedTaskId ? 'move' : 'copy'` 与源的 `effectAllowed = 'move'` 不匹配导致禁止图标；统一改为 `'move'`
- **侧边栏拖拽失效**：`<li>` 元素在 Tauri WebView2 中 `draggable` 属性不可靠，子元素的 `pointer-events` 干扰拖拽事件；改为 `<div>` + 添加 `select-none` + 子元素 `pointer-events-none`
- **缺少 dragenter preventDefault**：某些 WebView 需要 dragenter 也调用 preventDefault() 才能正常 drop

#### 技术改进
- 新增 GanttView.tsx 组件（左侧任务列表 + 右侧时间轴网格）
- 新增 KanbanView.tsx 组件（三列拖拽看板）
- CalendarView.tsx 重构：拆分为 TaskSidebar 独立组件 + MoreOptionsButton 精简（仅视图切换）
- DayView.tsx 新增 draggedTaskId state 和 handleDragStart/handleDragOver/handleDrop
- tailwind.config.js 启用 `darkMode: 'class'`
- index.css 添加深色模式全局覆盖样式

### v1.2.0（2026-06-25）

#### 新增功能
- **快速编辑**：双击任务标题进入行内编辑模式，Enter 保存 / Esc 取消 / 失焦自动保存；右键菜单新增"重命名"入口
- **批量操作**：header 新增"批量"按钮切换批量模式；支持全选/取消、批量完成、批量归档、批量设优先级、批量移动清单、批量删除；批量工具栏实时显示已选数量
- **拖拽到日历**：从任务列表开始拖拽时自动弹出浮动迷你日历（MiniCalendarDropzone）；拖到日期格子即设置该日 9:00 为截止时间；支持月份前后切换
- **任务归档**：新增 `archived` 字段全栈支持（SQLite 迁移 + Rust CRUD + 前端类型）；完成超过 7 天的任务自动归档（仅运行一次的 useEffect）；侧边栏新增"归档"入口显示归档数量；归档视图右键菜单显示"恢复任务"
- **任务搜索增强**：header 新增"筛选"按钮（带激活状态指示器）；组合筛选面板支持优先级、日期范围（今天/本周/本月/已过期/无截止日期）、标签、清单四维度；多条件叠加，一键清除所有筛选

#### 技术改进
- 后端 `UpdateTaskRequest` 新增 `list_id` 字段，支持批量移动清单
- `filteredTasks` 新增 `hasActiveFilters` 判断和归档视图分支
- 新增 `MiniCalendarDropzone` 组件，使用 date-fns 生成 7×6 月历网格
- TaskItem 组件新增 8 个可选 props（batchMode/isSelectedForBatch/onToggleSelect/onInlineEdit/onArchive/onUnarchive/isArchivedView/onDragStartGlobal）
- 拖拽时通过 `onDragStartGlobal` / `onDragEndGlobal` 触发浮动日历显示/隐藏

### v1.1.0（2026-06-25）

#### 新增
- **AI 对话助手**：ChatGPT 风格多轮对话界面，10 个预设技能快捷按钮
- **半自动操作模式**：AI 识别意图 → 弹窗确认 → 执行，支持 5 种任务操作
- **思考模式开关**：支持推理模型的 reasoning_effort 参数（低/中/高三档）
- **模型厂商存储列表**：保存 API 配置，一键切换不同厂商

#### 修复
- AI 日期解析错误：注入完整当前时间（ISO + 北京时间 + 星期）
- API URL 双 `/v1` 问题：新增 `build_url()` 智能处理

#### 技术改进
- Rust 后端 `llm_chat` 新增 `history` 参数支持多轮对话
- 新增 `formatTasksContext()` 将任务列表格式化为 AI 可读文本
- 新增 `parseActions()` 解析 AI 返回的操作指令

### v1.0.0（2026-06-25）

#### 首次发布
- **大模型 AI 集成**：接入 OpenAI 兼容协议 API
- **自然语言添加任务**：输入"明天下午3点开会"，AI 自动解析
- **智能任务拆解**：AI 自动拆解为 3-7 个子任务
- **AI 优先级建议**：根据任务内容推荐优先级
- **AI 智能摘要**：统计面板一键生成工作总结
- **设置模块**：主题/通知/大模型 API/系统/关于
- **日历视图优化**：月/周/日视图任务添加，时间段任务
- **任务管理增强**：右键删除、已过期模块、拖拽排序
- **UI/UX 优化**：自定义图标、系统托盘、设计令牌、动画细节

## 开发说明

## E2E 测试

```bash
# 1. 启动 dev server
npm run dev

# 2. 在另一个终端运行 E2E 测试
npm run test:e2e
```

### 数据存储
- 任务数据存储在 SQLite 数据库（位于系统 AppData 目录）
- 应用配置存储在 localStorage
- 浏览器预览模式下任务数据为内存临时存储，刷新会丢失

### AI 功能架构
```
用户输入 → formatTasksContext() → 文本快照 → AI → 文本回复
                                                    ↓
                                          parseActions() 提取操作指令
                                                    ↓
                                          弹窗确认 → api.createTask() → 数据库
```

AI 助手采用"只读 + 建议型"设计，所有实际操作都需要用户确认后才会执行。

### 安全机制
- AI 无法直接执行系统命令或读写文件
- 操作指令通过严格权限白名单（仅 5 种预定义操作）
- 所有操作都通过现有 API 接口，受 Tauri 命令白名单限制

## License

MIT
