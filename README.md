# 滴答清单（本地版）

基于 Tauri v2 + React + TypeScript + SQLite 构建的本地任务管理桌面应用，集成大模型 AI 能力。数据完全本地存储，无需联网，隐私安全。

![版本](https://img.shields.io/badge/version-1.2.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Tauri](https://img.shields.io/badge/Tauri-v2-orange)
![React](https://img.shields.io/badge/React-18-61dafb)

## 截图

（待补充）

## 功能特性

### 任务管理
- 三栏布局：侧边栏 | 任务列表 | 任务详情
- 任务支持：标题、备注、优先级（高/中/低）、截止时间、时间段、提醒、重复规则
- 子任务：支持多级任务拆解
- 标签与清单：多清单管理，彩色标签分类
- 拖拽排序：任务可拖拽调整顺序
- 右键菜单：删除、重命名、归档/恢复
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
- **通用**：主题（浅色/深色/跟随系统）、一周起始日、删除确认
- **通知**：桌面通知、提醒声音
- **大模型 API**：配置、测试连接、模型选择、厂商管理、思考模式
- **系统**：开机自启、数据导出
- **关于**：应用信息

### UI/UX 优化
- 自定义应用图标
- 系统托盘集成（关闭窗口时最小化到托盘）
- 设计令牌系统、统一 focus ring
- 任务行高 56px、优先级左侧色条
- 打勾弹跳动画、拖拽指示线、细滚动条
- 键盘快捷键：Ctrl+N 新建、Ctrl+F 搜索、Ctrl+1/2/3 切换视图

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
│   │   ├── CalendarView.tsx    # 日历视图容器
│   │   ├── DayView.tsx         # 日视图
│   │   ├── MonthView.tsx       # 月视图
│   │   ├── WeekView.tsx        # 周视图
│   │   ├── SettingsView.tsx    # 设置模块
│   │   ├── Sidebar.tsx         # 侧边栏
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
