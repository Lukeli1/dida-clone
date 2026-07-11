# 滴答清单（本地版）

基于 Tauri v2 + React + TypeScript + SQLite 构建的本地任务管理桌面应用，集成大模型 AI 能力。数据完全本地存储，无需联网，隐私安全。

![版本](https://img.shields.io/badge/version-1.41.0-blue)
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
- 子任务：支持一层任务拆解，独立勾选完成
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
- 支持 4 种 AI 操作：创建/修改/完成任务/创建子任务；删除任务需用户手动执行，避免无法无损恢复附件、时间记录和目标关联
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

| 层级       | 技术                                            |
| ---------- | ----------------------------------------------- |
| 前端框架   | React 18 + TypeScript + Vite                    |
| 样式       | Tailwind CSS                                    |
| 桌面端     | Tauri v2（Rust）                                |
| 本地数据库 | SQLite（rusqlite with bundled feature）         |
| HTTP 请求  | reqwest（Rust 端调用 LLM API）                  |
| 日期处理   | date-fns                                        |
| 大模型协议 | OpenAI 兼容（/v1/models, /v1/chat/completions） |
| 状态管理   | Zustand v5                                      |
| 虚拟列表   | @tanstack/react-virtual v3                      |

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

### v1.34.0（2026-07-01）

#### UI 一致性全面改进（Phase 13）

**方向 A：核心功能修复**

- **全部任务视图已过期分区**：扩展 `overdueTaskTree` 计算到全部任务视图，从 `incompleteTaskTree` 排除已过期任务避免重复显示；修正计数逻辑
- **空白区域修复**：EmptyState 条件修正（`incompleteTaskTree.length` 替代 `filteredTasks.length`）；`min-h-[200px]` 替代 `h-full`；`estimateSize` 56→72 减少滚动跳动；TaskInputBar padding 收紧
- **DetailPanel 布局**：添加 `shrink-0 h-full` 防止窄窗压缩；移除入场动画冲突（`animate-slide-in-right` → `transition-transform`）
- **暗色模式对比度**：`--color-titlebar-fg` 提亮至 `#9aa0a6`；`--color-text-muted` 提亮至 `#6b7280`（WCAG AA 达标）
- **DayView 硬编码颜色**：30+ 处 `dark:bg-gray-*` / `dark:border-gray-*` 替换为 CSS 变量

**方向 B：一致性统一**

- **Header 结构统一**：PomodoroView/HabitView/StatsView/GoalView 从无固定 Header 改为「固定 Header + 可滚动内容区」
- **侧边栏样式统一**：ViewSwitcher/ListSection/TagSection/SidebarFooter 分组标题、导航项尺寸（`py-[9px] rounded-xl text-[13px]`）、选中态（`shadow-sm`）、计数徽标（胶囊样式）全部对齐
- **EmptyState 复用**：4 个内容类视图内联空状态替换为统一 EmptyState 组件
- **虚拟滚动语义**：`<li>` → `<div role="listitem">`，`<ul>` → `<div role="list">`，新增 `animateOnMount` prop 禁用虚拟滚动闪烁动画
- **硬编码颜色清理**：KanbanView/QuadrantView/GanttView/PomodoroTimer hex 颜色替换为 CSS 变量；`hexWithAlpha` 增强 `color-mix` 支持
- **index.css 清理**：删除通配符 transition 和 gray 色板覆盖
- **日历类标题统一**：MonthView/KanbanView/QuadrantView 标题统一为 `text-lg font-semibold`

**方向 C：细节打磨**

- 分区展开添加 `animate-slide-down` 动画；工具栏 padding 统一为 `p-2.5`；间距方向统一为 `mt-4`
- 标题栏按钮 hover 统一（最小化/最大化补 `hover:bg-[var(--color-bg-tertiary)]`）
- TaskDetail 标题 textarea 加 `max-h-40`；底部菜单加 `max-h-[300px] overflow-y-auto`
- 折叠态选中补 `shadow-sm`；hover 浮层加 `delay-150`
- TaskBar opacity 统一为 40；点击交互统一（week 变体 onClick 绑定到根元素）

### v1.33.0（2026-06-30）

#### Phase 12 — 响应式布局 + 时间追踪 + AI 排程 + 目标管理 + 性能监控

**方向 A：响应式与自适应**

- **窗口宽度自适应**（P12-01）：useWindowSize hook（mobile/tablet/desktop 三态断点）；Sidebar 三态响应（移动端抽屉 + 平板折叠图标条 + 桌面固定）；DetailPanel 窄屏全屏覆盖；TitleBar 汉堡按钮；AIAssistant 窄屏全屏；Ctrl+B 切换侧边栏；窗口最小宽度降至 480px

**方向 B：时间追踪与统计**

- **时间追踪**（P12-04）：time_entries 表（task_id/start/end/duration/note）；开始/停止计时 + 实时秒级更新；localStorage 恢复计时状态；StatsView 新增本周时间分布柱状图（按清单分组）
- **周/月报自动化**（P12-05）：reports 表（type/period/content/stats_json）；周日 21:00 自动生成周报（localStorage 幂等）；StatsView 月度趋势折线图（完成/逾期双线）；历史报告列表 + markdown 渲染 + 手动生成按钮

**方向 C：AI 能力深化**

- **AI 自动排程**（P12-02）：autoSchedulePrompt 生成明日日程（优先级 + 时长估算 + 工作时间规则）；意图检测（"帮我安排明天"等关键词）；SchedulePreviewDialog 预览面板 + 批量应用；CalendarToolbar "AI 排程"入口按钮
- **任务关联推荐**（P12-03）：relatedTasksPrompt 分析同一项目/人物/地点/主题关联；RelatedTasksPanel 延迟加载 + JSON 容错解析；点击关联任务跳转

**方向 D：目标管理与性能监控**

- **目标/OKR 管理**（P12-06）：goals + goal_tasks 表（年度/季度/月度目标）；GoalView 卡片网格 + 进度条；GoalEditor 创建/编辑对话框；TaskGoalsPanel 任务详情中关联目标；Sidebar 新增"目标"入口
- **性能数据化**（P12-07）：perfMonitor 工具（measureAsync/measure + localStorage 持久化 200 条）；PerfPanel 性能监控设置面板（操作名/次数/平均/最大/最近）；useAppInit 关键操作埋点

### v1.32.0（2026-06-30）

#### Phase 11 — 系统通知 + 同步增强 + 视图扩展 + 性能调优

**方向 A：系统通知与提醒**

- **系统级通知**（P11-01）：引入 tauri-plugin-notification，后台 30 秒扫描到期 reminder，发送系统通知（Windows 通知中心）；ReminderMenu 设置 UI（5 分/15 分/30 分/1 小时/1 天前/自定义）；tasks 表新增 last_notified 字段防重复通知；emit task-reminder 事件驱动应用内 Toast
- **提醒规则增强**（P11-02）：uiStore 新增 defaultReminderOffset，创建任务时自动填充 reminder = due_date - offset；修改 due_date 时自动同步 reminder（仅自动生成的）；设置面板新增"默认提醒时间"下拉
- **通知权限管理**（P11-03）：首次启动请求系统通知权限（仅一次）；设置面板显示三态权限状态（已开启/未开启/未决定）；"重新请求权限"+"发送测试通知"按钮

**方向 B：数据同步增强**

- **WebDAV 同步**（P11-04）：webdav_sync.rs 完整实现（MKCOL/PUT/GET/PROPFIND）；支持坚果云/Nextcloud/群晖；自动同步策略（本地更新→上传/远程更新→下载）；SyncPanel 新增 WebDAV 配置表单 + 测试连接按钮
- **同步冲突解决 UI**（P11-05）：SyncConflictDialog 三种策略（保留本地/保留远程/两者都保留）；resolve_sync_conflict 命令根据 sync_type 分发到 Git 或 WebDAV

**方向 C：视图能力扩展**

- **看板视图完善**（P11-06）：CalendarToolbar 直接暴露看板/甘特图按钮；分组逻辑改为标签驱动（@进行中 标签）；列间拖拽改变状态 + 列内拖拽排序；卡片显示优先级色条 + 截止日期 + 标签；右键菜单接入
- **甘特图完善**（P11-07）：任务名显示在色条上（截断 + tooltip）；今天红色指示线；周末背景区分；拖拽目标日期 tooltip；鼠标滚轮横向滚动；列头日期 + 星期
- **周视图 Resize 修复**（P11-08）：修复 draggable=true 干扰 resize handle 的 bug（添加 draggable={false}）；无 end_date 任务支持拖下边缘创建 end_date；handle 加粗 h-1.5→h-2；hover 颜色改为 CSS 变量适配暗色模式；DayView 同步添加 resize 支持

**方向 D：性能与体验调优**

- **错误边界增强**（P11-09）：errorLogger 持久化错误日志到 localStorage（最多 50 条）；全局 unhandledrejection 监听；ErrorBoundary 增强为错误摘要 + 技术详情 + 复制/刷新/返回首页按钮；设置面板新增错误日志查看/导出/清除
- **导入导出进度反馈**（P11-10）：后端 emit data-progress 事件；前端监听并显示进度条（百分比 + 消息）；TopProgressBar 同步显示
- **启动性能优化**（P11-11）：tasks/lists/tags 并行加载（Promise.all）；habits/templates 延后非阻塞加载；secondaryDataLoaded 两阶段标记；db.rs 预热查询

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
- **移除 **TAURI** 检测**：`api.ts` 不再依赖全局变量检测运行环境

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
- 操作指令通过严格权限白名单（创建、修改、完成、创建子任务；AI 删除任务会被拒绝）
- 所有操作都通过现有 API 接口，受 Tauri 命令白名单限制

## 版本更新记录

### v1.41.0（2026-07-12）- 目标 KR 数据与 UI 闭环

- 新增 `goal_key_results` 表与索引，安全扩展目标模块持久化；删除目标时在同一事务中清理 KR，避免半完成状态
- 补齐 KR CRUD 的 Rust command 与 TypeScript API 契约：查询、新增、更新、删除关键结果
- 目标进度规则统一：有 KR 时按各 KR 完成度算术平均；无 KR 时继续按关联任务完成率，兼容旧数据
- `GoalEditor` 支持在编辑已有目标时增删改 KR，前端校验目标值/当前值边界；`GoalCard` 展示 KR 明细与平均进度
- 超额完成展示封顶 100%，但保留真实 `current_value`；单位更新契约为 undefined 不改、空字符串清空
- 补充前后端回归测试，并通过桌面端验收：50%+100%=75%、无 KR 回退任务进度、清空单位持久化、删除后重启无残留

### v1.40.0（2026-07-11）- 模板应用配置增强


- 模板页和任务输入栏的“从模板创建”统一改为配置弹窗；用户必须选择有效目标清单，不再静默写入收件箱
- 应用模板时可设置主任务截止日期和多选标签；日期按本地日历日保存为当天 23:59，子任务不继承日期或标签
- 新增 `{project}` 等变量替换，父任务标题、备注和子任务标题使用同一规则；未知变量保留原占位符
- 后端 `apply_template` 增加清单和标签校验，并在同一事务中写入主任务、标签和子任务；失败时整体回滚，不留下半截数据
- 补充模板弹窗、日期时区、变量替换、错误恢复和提交防重复测试
- 验证通过：623 个前端测试、97 个 Rust 测试、TypeScript、ESLint、Cargo 检查和版本一致性检查

### v1.39.0（2026-07-10）- 时间追踪与番茄钟工时闭环

- 后端全局限制仅一条活跃时间记录；开始另一任务计时时会明确提示先停止当前计时，避免任务工时重复累计
- 新增 `add_time_entry` 命令，番茄钟在选中任务的完整专注 session 结束后自动写入已完成工时记录，无需手动补录
- 番茄钟锁定 session 启动时长，运行中禁用时长设置；本地专注统计与任务工时记录使用同一时长口径
- 修复数据快照列表排序不稳定：快照文件名加入排序序列号，并兼容解析旧、新文件名中的快照原因
- 补充时间追踪单活跃、番茄钟工时写入、session 时长锁定、快照排序与文件名兼容的回归测试
- 验证通过：588 个前端测试、87 个 Rust 测试、TypeScript、ESLint、Clippy、生产构建和版本一致性检查

### v1.38.3（2026-07-10）- AI 批量动作安全与撤销边界

- 新增 AI 批量动作预览、确认执行和撤销记录链路，执行前绑定 proposal token 并对任务快照重新校验，防止预览后任务变化仍继续执行
- 新增后端 `execute_ai_batch` 事务命令，AI 创建、更新、完成和创建子任务在同一事务内执行，任一失败会整体回滚
- 收紧 AI 删除边界：AI `delete_task` 暂时禁用，避免附件、时间记录、目标关联和原任务 ID 无法无损恢复时仍承诺撤销成功
- 修复重复任务完成语义：AI 完成 RRULE 重复子任务时保留 `parent_id`，已完成任务重复完成会被拒绝，同一批内重复修改同一任务会被拒绝
- 收紧子任务层级：当前明确只支持一层子任务，前端校验、后端创建/更新和 AI batch 均拒绝嵌套子任务，避免删除/撤销语义不一致
- 修复撤销安全：撤销前直接获取最新任务列表，失败时中止；重复任务撤销会先确认下一周期任务未被用户修改，再恢复原任务完成态
- 后端 `update_task` 现在会检查影响行数，更新不存在任务会返回错误，不再静默成功
- 验证通过：581 个前端测试、79 个 Rust 测试、TypeScript、ESLint、Clippy、生产构建和版本一致性检查

### v1.38.2（2026-07-09）- 数据安全快照、导入预览与同步日志

- 新增数据快照系统：使用 SQLite `VACUUM INTO` 创建一致性快照，正确处理 WAL 模式；支持手动创建、列表、恢复和删除，最多保留 20 个；恢复/删除操作含文件名安全校验，防止路径穿越
- 新增自动快照触发：导入替换模式、WebDAV 下载、WebDAV 同步下载、Git/WebDAV 冲突解决覆盖本地前，后端自动创建快照；**快照创建失败将中止后续破坏性操作**，不会继续清空或覆盖数据
- 新增快照恢复安全策略：写入 pending-restore 文件，应用重启时完成恢复，避免长期连接冲突
- 新增导入预览命令 `import_json_preview`：merge 模式覆盖主要唯一约束冲突（ID 冲突、tags UNIQUE name 冲突、habit_records UNIQUE(habit_id,date) 冲突），外键异常仍以实际导入结果为准；replace 模式按清空后数据库计算，仅检测 JSON 内部自冲突（重复 ID/name），现有库冲突仅在 `existing_counts` 中展示删除提示
- 导入流程改为必须先预览才能确认导入，replace 模式展示醒目警告和自动快照提示
- 新增独立同步日志 `sync_logs.jsonl`：记录 Git/WebDAV 同步、上传、下载、冲突解决和错误，不写入主数据库避免远程覆盖丢失；设置页展示最近 10 条
- JSON 导出新增附件元信息（文件名、大小、MIME 类型），UI 明确标注"含附件记录，不含附件文件本体；导入暂不支持恢复附件记录"
- 前端新增 SnapshotPanel、SyncLogPanel 组件，CleanupPanel 增加预览结果展示
- 版本检查脚本新增 package-lock.json 校验
- 验证通过：516 个前端测试、57 个 Rust 测试、TypeScript、ESLint、Clippy、版本一致性（含 lockfile）

### v1.38.1（2026-07-09）- 日历规划能力稳定性回归

- 补充 CalendarToolbar、CalendarFilterMenu、CalendarView 和 CalendarMainFlow 组件/集成回归测试，覆盖视图切换、过滤菜单、侧边栏同步和 AI 排程入口
- 扩展 AgendaView 测试，覆盖 14 天范围边界、完成状态视觉区分、跨天全天片段和重复任务已知限制
- 扩展 taskStore 测试，覆盖 RRule 重复任务完成路径、规则到期返回 0 和完成状态不一致数据的容错
- 更新日历 E2E 烟雾测试说明，明确 Tauri IPC 限制，并以组件/集成测试覆盖日历主流程
- 发布门禁通过：516 个前端测试、44 个 Rust 测试、TypeScript、ESLint、Clippy 和版本一致性检查

### v1.38.0（2026-07-09）- 任务数据语义与详情编辑闭环

- 补齐 `completed_at`、`status`、`reminder_minutes` 三个任务字段，区分完成时间与最后编辑时间，看板状态不再依赖标签模拟
- 详情页日程面板增加全天开关，全天/跨天任务编辑后保持正确的全天语义，不再固定写入 `all_day: false`
- 看板改为原生 `status` 驱动（todo/in_progress/done），拖拽切换列时同步 `status`、`completed`、`completed_at`，不再创建"进行中"标签
- Rust 导入导出、重复任务生成、模板应用路径全部接入新字段，旧数据自动兼容
- 新增 SchedulePanel 全天编辑测试（10 用例）和 KanbanView status 驱动测试（7 用例）

### v1.37.0（2026-07-09）- 日历任务视图显示优化

- 月视图任务显示优化：未完成任务优先、已完成任务折叠、动态任务容量、`+N 更多` 原地浮层和快速添加布局修复
- 周视图 / 日视图重叠任务布局：同时间段任务自动并排，完全重叠和部分重叠都不再互相遮挡
- 统一日历任务块组件：月 / 周 / 日视图共用任务块基础逻辑，统一颜色、完成态、复选框、拖拽和轻量标识处理
- 新增跨天 / 推导全天任务展示：月视图具备连续条带感，周 / 日视图新增顶部全天 / 跨天任务区
- 拖拽跨天 / 全天任务时保留本地自然日跨度，避免移动后全天任务变成普通时间段任务
- 补充 layout、occurrence、任务块、周视图、日视图、store 移动逻辑等回归测试；`npm run typecheck` 与 `npm test` 均通过

### v1.36.1（2026-07-08）- 自动更新功能完善

- 修复 Tauri updater 在系统代理环境下无法访问 GitHub 的问题：Rust 端启动时自动读取 Windows 注册表代理设置并同步到环境变量
- updater endpoint 改用 `raw.githubusercontent.com` 避免 GitHub Releases 重定向问题
- 优化 404 错误处理：未发布 Release 时显示"已是最新版本"而非报错
- 改进 AboutPanel 错误提示：Toast 中显示完整错误信息便于排查
- 发版脚本兼容 `.exe` 产物（新版 Tauri v2.11+ 不再生成 `.nsis.zip`）
- 端到端验证通过：v1.36.0 → 检测到 v1.36.1 → 下载安装 → 自动重启

### v1.36.0（2026-07-08）- 自动更新功能

- 新增应用内自动更新功能：基于 Tauri v2 `tauri-plugin-updater` 插件，更新包托管在 GitHub Releases
- 设置 → 关于页面新增"检查更新"按钮，支持手动检查、查看更新说明、下载安装并自动重启
- 应用启动 5 秒后静默检查更新，发现新版本时 Toast 提示一次（同一版本不重复提示）
- 新增 `tauri-plugin-process` 插件用于更新后自动重启应用
- 新增 `src/api/updaterApi.ts` 封装更新检查/下载/安装逻辑
- 新增 `scripts/publish-release.mjs` 半自动发版脚本（生成 latest.json + 上传 GitHub Release）
- 配置 `createUpdaterArtifacts` 生成 `.nsis.zip` 更新包和 `.sig` 签名文件
- `.gitignore` 排除 `.tauri/` 签名私钥目录

### v1.35.2（2026-07-08）- 月视图任务溢出修复 + 安全闭环发布

- 修复日历月视图单日任务过多时任务卡片溢出日期格、覆盖下方日期的问题
- 月格内默认展示 2 条任务，超出部分显示 +N 折叠入口，点击可展开查看当天全部任务
- 为月视图任务折叠新增组件级回归测试，覆盖 5 条任务时的折叠与展开行为
- 合并 WebDAV 密码明文落盘/返回、secret fallback 清理、Cargo.lock 版本同步等安全闭环修复

### v1.35.1（2026-07-08）- 代码审核反馈修复（安全增强 + E2E 修复 + 架构补全）

针对 v1.35.0 架构优化的代码审核反馈，修复安全实现缺陷、E2E 失败与架构未落地项。

**P0：E2E 与工作区污染修复**

- 修复 E2E 3 项失败 -> 11 项全部通过：测试前关闭新手引导避免遮挡首屏；修复 settings strict mode 多元素匹配；任务创建测试改为验证 UI 不崩溃
- `.gitignore` / `.prettierignore` 增加 `test-results/`

**P1：安全实现实质提升**

- **secret 存储升级为 OS keychain**：引入 `keyring` crate，凭据存入 Windows Credential Manager（DPAPI）/ macOS Keychain / Linux Secret Service，取代先前 hex 编码文件方案
- **WebDAV 密码保存路径补全**：`handleSaveWebdavConfig` 现也调用 `setSecret` 保存密码
- **fs plugin 彻底移除**：删除 Cargo 依赖、插件注册、`fs:default` 权限、前端依赖
- LLMProvider apiKey 已确认不进 localStorage

**P2：架构与性能补全**

- `task_query` 分页 + 视图过滤编译错误修复 + 5 个 Rust 测试
- 补齐 taskTree selectors + 单测
- KanbanView 已用 tagService；tagService tag_ids 更新已 Set 去重

**验收**：前端 lint/format/typecheck/test(377)/build/check:version + Rust fmt/clippy/test(34) + E2E(11) 全通过

### v1.35.0（2026-07-07）— 安全增强 + 架构解耦 + 性能优化 + 测试补强（架构优化 Phase 1~5）

本次为向下兼容的 Minor 版本，聚焦安全边界、数据语义、架构解耦、查询性能与测试体系，无破坏性 API 改动。

**Phase 1：数据语义与安全边界**

- **任务字段清空语义修正**：后端 `task_update` 引入 `Option<Option<T>>` 双层 Patch DTO，区分"不更新 / 清空（NULL）/ 更新"三种语义；前端清空日期/提醒/重复规则时传 `null`，数据库正确存为 `NULL` 而非空字符串
- **收紧 Tauri 文件权限**：新增后端 `file_commands`（`export_text_file`/`import_text_file` 受控读写，系统对话框 + 扩展名限制 + 拒绝目录）；移除前端 `@tauri-apps/plugin-fs` 直用；`capabilities/default.json` 删除 `fs:allow-write-text-file`/`read-text-file` 的 `"path": "**"` 任意路径权限
- **凭据迁移后端安全存储**：新增后端 `secret_commands`（`set_secret`/`get_secret`/`delete_secret`，存 app_data_dir/secrets.json，hex 编码不明文）；LLM API Key 与 WebDAV 密码不再存 localStorage / sync_config.json 明文；前端 `secretApi` 统一访问

**Phase 2：解耦 API / Store / localStorage**

- **统一 invoke client**：新增 `src/api/invokeClient.ts`，所有 API 子模块通过统一入口调用 Tauri command（含错误归一化），非测试文件不再直接依赖 `@tauri-apps/api/core`
- **service 层**：新增 `src/services/tagService.ts`，跨 Store 操作（给任务加/移标签后同步 taskStore）统一在 service 层完成，`tagStore` 不再动态 import `taskStore`，消除分包 dynamic import 警告
- **统一 localStorage facade**：新增 `src/utils/storage.ts`（getItem/setItem/removeItem/getJSON/setJSON + 敏感 key 拒绝写入），业务代码不再裸用 `localStorage.*`

**Phase 3：性能与可扩展性**

- **任务查询优化**：`task_query` 标签关系从全表扫描 `SELECT ... FROM task_tags` 改为 `WHERE task_id IN (...)` 按需查询，只取当前任务 ID 的标签关系；新增 1000 任务 + 3000 标签关系测试
- **前端 selector 优化**：新增 `src/stores/selectors/taskSelectors.ts`（todayCount/archivedCount/taskCounts/overdueTasks 纯函数），`useTaskFiltering` 调用 selectors，新增 7 个 selector 单测
- **分包优化**：移除未用依赖 `rehype-raw`；函数式 `manualChunks` 把 react/react-dom 独立为 vendor chunk；**主入口 gzip 从 110KB 降至 81KB**（< 90KB 目标达成）

**Phase 4：测试体系补强**

- Playwright `webServer` 自动启动 dev server，无需手动 `npm run dev`
- 关键组件加 `data-testid`（task-input / nav-calendar / nav-ai / nav-settings / sidebar-lists），E2E 改用 `getByTestId` 替代脆弱 CSS class 选择器
- 扩充 E2E 覆盖：任务创建、视图切换、清单显示等关键路径

**Phase 5：文档与发布治理**

- 新增 `scripts/check-version.mjs` 版本一致性检查脚本，校验 package.json / Cargo.toml / tauri.conf.json / README badge 四处版本一致

**验收结果**

- 前端：lint(0 error) / format:check / typecheck / test(377 passed) / build / check:version 全部通过
- Rust：cargo fmt / clippy(-D warnings) / test(31 passed) 全部通过
- 安全：无 `localStorage.setItem('llm_api_key')`、无 `@tauri-apps/plugin-fs` 直用、无 `"path": "**"` 权限、无 `await import('./taskStore')`

### v1.34.2（2026-07-07）— 工具链与质量门禁修复（架构优化 Phase 0）

本次为向下兼容的质量修复版本，无新功能、无破坏性改动，重点修复测试链路、构建污染与 CI 不稳定问题，建立稳定的代码质量门禁。

**测试链路修复**

- 降级 `vitest@4.1.9 → ^2.1.9`，解决与 `vite@5.4.21` 不兼容导致的 `ERR_PACKAGE_PATH_NOT_EXPORTED`，368 个单元测试恢复运行

**构建污染根除**

- `build` 脚本从 `tsc -b && vite build` 改为 `npm run typecheck && vite build`，消除 `tsc -b` 编译 `vite.config.ts` 生成 `vite.config.js`/`.d.ts`/`*.tsbuildinfo` 污染工作区的问题
- 移除 `tsconfig.node.json` 的 `composite` 项目引用，改用 `noEmit` 纯类型检查
- `.gitignore` 追加 `*.tsbuildinfo`、`vite.config.js/d.ts`、`playwright-report/`、`coverage/`、`output/`、`src-tauri/gen/`
- `git rm --cached` 移除已被追踪的生成文件（`vite.config.js`、`vite.config.d.ts`、`playwright-report/index.html`、`src-tauri/gen/`）

**ESLint/Prettier 质量门禁**

- 新增 `eslint.config.js`（flat config，含 typescript-eslint + react-hooks + react-refresh）
- 新增 `.prettierrc`（统一 `semi:false`/`singleQuote`/`printWidth:120`/`trailingComma:all`）与 `.prettierignore`
- 统一 200 个源码文件的代码格式
- 新增 `typecheck`/`lint`/`format`/`format:check` npm 脚本

**CI 修正**

- CI 从 `npx eslint .` / `npx prettier --check .` / `npx tsc --noEmit` 改为 `npm run lint` / `npm run format:check` / `npm run typecheck`，CI 与本地环境一致

**Rust 质量门禁**

- `cargo fmt` 统一 Rust 代码格式
- 修复 11 个 clippy error（`useless_asref`、`unnecessary_cast`、`assign_op_pattern`、`map_identity`、`collapsible_match`，及 `type_complexity`/`too_many_arguments` 添加 allow 注解）

**验收结果**

- `npm run lint`：0 error
- `npm run format:check`：通过
- `npm run typecheck`：通过
- `npm run test`：368 passed
- `npm run build`：通过
- `cargo fmt --check` / `cargo clippy -D warnings` / `cargo test`（26 passed）：全部通过

## License

MIT
