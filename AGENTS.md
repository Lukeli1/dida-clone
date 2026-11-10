# AGENTS.md - 滴答清单复刻项目规则

本文件是当前项目的项目级补充规则。通用协作流程、工作区安全、任务分级、提交推送限制、测试结果汇报等默认继承用户全局 AGENTS.md。

本文件只定义当前项目特有的技术边界、风险模块、验证重点和阶段目标。

## 项目概况

本项目是一个滴答清单类任务管理应用，采用 Tauri 桌面端架构。

主要技术栈和目录：

- 前端：React + TypeScript
- 桌面端与后端命令：Tauri + Rust
- 前端 API 封装：`src/api`
- 前端组件：`src/components`
- 日历视图：`src/components/calendar`、`src/components/DayView.tsx`
- 任务列表与详情：`src/components/task-list`、`src/components/detail`
- 状态管理：`src/stores`
- Hooks：`src/hooks`
- 类型定义：`src/types.ts`
- 日期和日历工具：`src/utils`
- Rust 命令层：`src-tauri/src/commands`
- 数据库逻辑：`src-tauri/src/db.rs`

## 当前阶段重点

当前阶段重点模块应根据项目版本目标、路线图、近期分支、近期提交和用户明确指令动态调整。

截至当前阶段：

- 版本方向：`v1.53.3` 已发布（发布提交 `6b6ae30`；tag `v1.53.3`；GitHub Release 签名安装包与 `latest.json` 1.53.3 已发布；workflow run `42850932363`，10m48s；机器人回写 `598df75`）
- 当前重点：日历任务快捷详情弹窗紧凑化 + OpenCode `x-opencode-session` 会话路由修复
- 重点范围：
  - `CalendarTaskQuickDetail` 默认尺寸由约 810×600 收紧为约 440×360：保留完成状态 / 日期摘要 / 优先级 / 更多菜单、标题 / 备注、所属清单 / 日期编辑器 / 保存 / 关闭；窄窗口与短窗口按视口夹取，日期摘要允许换行，不产生横向溢出
  - OpenCode Go / Zen 聊天请求统一携带稳定的 `x-opencode-session`：UUID v4 会话标识存 localStorage `llm_chat_session_id`，同一对话跨请求 / 重启稳定，清空对话轮换；仅 `opencode.ai` 及其子域发送，空白值不发送，普通 OpenAI-compatible provider 不增加该头
  - 保留：`/models` 连接测试行为、流式 / 非流式 / Web fallback 三条聊天路径、标题 / 日期 / 备注单飞排空保存、全天 / 跨日语义、任务切换与窄窗口定位
  - 自动化验收：Rust `llm::tests` 7/7；OpenCode 相关前端 6 文件 / 76 项；日期弹窗 3 文件 / 78 项；`tests/calendar-quick-detail.spec.ts` 14/14；typecheck、build、`cargo check --locked`、`npm run check:version` 1.53.3 通过；ESLint 0 error（4 个既有 warning）；修改文件 Prettier 通过（`AIAssistant.tsx` 受仓库既有 CRLF / 换行基线影响，未做大范围格式化）；`git diff --check` 通过；`v1.53.3` 已发布（安装包 5,919,044B，SHA-256 `62e58d5f…df78c`，签名 key ID `0EC1DE27780EDC04` 实测验签通过）
  - 人工验证待用户完成：真实 OpenCode Go / Zen 流式对话、多轮 / 重启 / 清空对话 session 生命周期、普通 provider 不受影响、紧凑弹窗在真实 Tauri / WebView2 窗口下的视觉与操作
- 上一版本 `v1.53.2`（发布提交 `907ce03`，tag `v1.53.2`，run `42788292508`，机器人回写 `49c0b25`）：快捷详情宽面板重构、日期编辑器与逾期日期红色摘要；`v1.53.1`（tag `cc53d6e`，run `42649891777`，机器人回写 `88a055f`）：周视图跨日全天条只显示复选框 / 优先级 / 标题；`v1.53.0`（tag `4e3d3cd`，run `42593430736`，机器人回写 `eeee038`）：周视图全天区跨日拖选与高度调节、日历任务轻量详情、异步保存可靠性

当新版本目标、路线图、分支方向或用户明确指令发生变化时，应建议更新本区块。

## 本项目高风险模块

以下模块默认按中高风险任务处理，除非用户明确说明只是咨询或小修：

- 任务创建、更新、删除、完成状态
- 重复任务规则
- 日期边界、全天任务、跨天任务
- 日历 occurrence 计算
- 日视图、周视图、月视图展示逻辑
- 任务排序、拖拽、重排
- 数据导入导出
- 数据库 schema 或持久化结构
- Rust command 与 TypeScript API 契约
- AI 动作解析和自动任务修改
- 版本发布、更新器、安装包相关逻辑

## 前端开发补充规则

前端界面应保持任务管理工具风格：紧凑、清晰、可扫描、适合高频操作。

涉及日历、任务列表、详情面板时，必须关注：

- 文本不溢出
- 控件尺寸稳定
- hover、选中、拖拽状态不造成明显布局跳动
- 日期、时间、标题、标签、完成状态不互相遮挡
- 移动端和窄屏下仍可正常操作

不得添加与当前功能无关的营销页式布局、装饰性背景、过度动画或大型 UI 风格改造。

## 后端与数据补充规则

修改 `src-tauri/src/commands`、`src-tauri/src/db.rs` 或任务数据结构时，必须同步检查：

- TypeScript 类型定义
- `src/api` 调用参数
- Rust command 入参和返回值
- serde 字段
- 数据库读写路径
- 导入导出格式

涉及数据库结构、任务持久化、重复任务结构、排序字段、完成状态或日期时间字段时，必须说明兼容性影响。

不得在未确认迁移策略的情况下破坏已有用户数据。

## 日期、重复任务和日历规则

日期、重复任务和日历展示是本项目的核心风险区域。

涉及以下逻辑时，应优先补充或更新测试：

- 全天任务
- 跨天任务
- 重复任务 occurrence 生成
- 已完成重复任务
- 任务拖拽到不同日期
- 任务完成后在日历中的表现
- 日视图、周视图、月视图展示差异
- 日期零点边界
- 时区相关边界
- 日历 all-day segment 计算

优先修改集中计算函数，不应在多个组件中复制日期判断逻辑。

## 本项目测试矩阵

根据改动范围优先运行相关测试：

- 日视图：`src/components/__tests__/DayView.test.tsx`
- 周视图：`src/components/calendar/__tests__/WeekView.test.tsx`
- Store：`src/stores/__tests__/taskStore.test.ts`
- occurrence 计算：`src/utils/__tests__/calendarTaskOccurrences.test.ts`
- all-day segment：`src/utils/__tests__/calendarAllDaySegments.test.ts`

跨前后端契约变更时，应同时验证 TypeScript 类型、前端 API 调用、Rust command 和数据库读写路径。

## 版本与文档补充规则

当前源码版本为 `v1.53.3`，在 v1.53.2 基础上把日历任务快捷详情弹窗从约 810×600 收紧为约 440×360（保留完成状态 / 日期摘要 / 优先级 / 更多菜单、标题 / 备注、所属清单 / 日期编辑器 / 保存 / 关闭；窄窗口与短窗口按视口夹取，日期摘要允许换行，不产生横向溢出），并修复 OpenCode Go / Zen 聊天缺少 `x-opencode-session` 导致的 `400 MissingSessionID`：同一对话使用 UUID v4 会话标识（localStorage `llm_chat_session_id`，跨请求 / 重启稳定，清空对话轮换），仅 `opencode.ai` 及其子域发送，空白值不发送，普通 OpenAI-compatible provider 不增加该头；`/models` 连接测试保持原行为。会话标识不进入 keychain、WebDAV 同步、导入导出或日志。复用既有任务数据结构，不新增数据库表、同步格式或导入导出字段。图片附件仍仅本机持久化，不支持 WebDAV 跨设备同步。

版本建议可按以下项目节奏判断：

- `v1.45.0`：完整主题系统、圆角与界面密度等跨模块视觉升级
- `v1.45.1`：习惯历史周补打与历史月历补打
- `v1.48.0`：工作区、日历与设置页跨模块视觉/交互升级
- `v1.49.0`：日历任务水平拖拽动作 + 任务图片粘贴 / 上传（已发布）
- `v1.49.1`：今日任务水平拖拽动作与左右预览修复（已发布）
- `v1.50.0`：任务快速处理模式、设置开关与虚拟列表定位（已发布）
- `v1.51.0`：日历任务水平拖拽独立开关（已发布）
- `v1.51.1`：月视图任务条视觉收敛与任务起止时间修复（已发布）
- `v1.52.0`：周视图日期跨度调整、右键菜单统一策略与移除拖拽迷你日历（已发布）
- `v1.52.1`：周视图定时任务最终矩形避让、跨周稳定、日界处理与日期跨度预览一致性（已发布）
- `v1.53.0`：周视图全天区跨日拖选与高度调节、日历任务轻量详情、异步保存可靠性（已发布）
- `v1.53.1`：周视图跨日全天条只显示标题，不再附加时间范围（已发布）
- `v1.53.2`：快捷详情宽面板重构、日期摘要日期编辑器与逾期日期红色摘要（已发布）
- `v1.53.3`：快捷详情紧凑化（约 440×360）与 OpenCode Go / Zen `x-opencode-session` 会话路由修复（已发布）
- minor：新的明显用户功能或跨模块体验升级
- patch：缺陷修复、兼容性修复、小范围行为修正

如果改动影响功能行为、版本规划或架构约定，应建议同步更新 README、路线图、架构文档、发布说明或当前阶段重点区块。

## 当前项目特别注意事项

当前仓库可能存在较多未提交改动。处理任何开发任务前，应特别确认这些改动是否与当前任务相关。

当前重点是 `v1.53.3` 的快捷详情紧凑化与 OpenCode session 路由修复。相关改动只涉及 `CalendarTaskQuickDetail`、`tests/calendar-quick-detail.spec.ts`、`src-tauri/src/llm.rs`、`src/utils/llm.ts`、新增 `src/utils/chatSession.ts`、`AIAssistant` 清空对话轮换，以及对应单测 / E2E，不触及：

- 数据库 schema
- 同步协议（附件文件仍不参与 WebDAV 同步）
- 导入导出格式（仅沿用既有附件元信息边界）
- AI 动作解析
- occurrence 算法与重复任务规则（真实跨午夜仍保持 span=2）
- 任务数据结构与任务命令契约（本次仅给 LLM command 增加可选 `sessionId` 参数）
- 异步保存语义（标题 / 日期 / 备注单飞排空、关闭与切换前提交、失败保留草稿可重试）
- 定时跨日任务在小时网格中的起始时间与完整起止时间 tooltip
- 日历拖拽开关、日期 / 时间移动、方向键快速处理语义
- 不迁移历史任务；无结束时间不自动补，未拉伸不自动补，非法结束时间不静默清空
- session ID 不进入 keychain、WebDAV 同步、导入导出或日志
