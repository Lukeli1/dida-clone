# 产品优化路线图

> 创建时间：2026-07-09  
> 适用项目：滴答清单复刻  
> 当前版本方向：v1.37.x 日历任务视图稳定性收尾  
> 下一阶段候选：v1.38.0 产品体验与数据语义增强

## 1. 当前阶段定位

当前项目已经完成 `v1.37.0` 日历任务视图显示优化，主要包括月视图任务容量、周/日视图重叠布局、统一日历任务块、全天/跨天任务展示、拖拽保留全天跨度等能力。

下一阶段不建议继续横向增加新入口，应优先补齐现有功能的闭环问题：任务数据语义、日历规划可控性、同步安全、AI 操作安全、执行复盘和全局效率入口。

## 2. 已归档执行文档

| 序号 | 模块 | 执行文档 | 建议版本 | 优先级 | 状态 |
|---|---|---|---|---|---|
| 1 | 任务数据语义与详情编辑闭环 | `docs/product-optimization-task-data-detail.md` | v1.38.0 | P0 | 待执行 |
| 2 | 日历规划能力与视图过滤 | `docs/product-optimization-calendar-planning.md` | v1.38.0 | P1 | 待执行 |
| 3 | 同步、导入导出与数据安全可观测性 | `docs/product-optimization-sync-data-safety.md` | v1.38.x | P0 | 待执行 |
| 4 | AI 助手操作安全、排程预览与收件箱整理 | `docs/product-optimization-ai-assistant-safety.md` | v1.38.x | P1 | 待执行 |
| 5 | 模板、目标、番茄钟与时间追踪闭环 | `docs/product-optimization-template-goal-pomodoro.md` | v1.39.0 | P1 | 待执行 |
| 6 | 整体导航、设置入口与命令面板 UX | `docs/product-optimization-navigation-command-palette.md` | v1.39.0 | P2 | 待执行 |

## 3. 推荐执行顺序

### 阶段 A：v1.37.1 稳定性收尾（可选）

如果继续保持 `v1.37.x` patch 节奏，优先只处理日历任务视图的小范围缺陷和回归测试，不引入跨模块 schema 变更。

建议范围：

- 全天/跨天任务在详情页编辑后的展示一致性检查。
- 日历拖拽、resize、完成状态同步回归。
- 月/周/日视图窄屏和高任务密度截图核验。

对应文档：

- `docs/product-optimization-calendar-planning.md` 中与日历显示稳定性相关的前置检查项。
- `docs/product-optimization-task-data-detail.md` 中 T-03 详情页全天编辑闭环。

### 阶段 B：v1.38.0 数据语义与日历规划

这是下一轮最建议执行的主版本。

执行顺序：

1. `docs/product-optimization-task-data-detail.md`
2. `docs/product-optimization-calendar-planning.md`

原因：

- `completed_at`、`status`、`reminder_minutes` 是统计、看板、AI、日历过滤的基础字段。
- 日历过滤和 Agenda 视图依赖更准确的任务状态和完成时间。
- 先补数据语义，再做日历规划，可以减少后续重复修改。

预期收益：

- 完成趋势不再被任务编辑污染。
- 看板状态不再污染标签系统。
- 全天任务从日历到详情页形成闭环。
- 用户可以按清单、标签、优先级过滤日历任务。
- 密集日程可通过 Agenda 视图快速扫描。

主要风险：

- 涉及数据库兼容迁移。
- 涉及 Rust command 与 TypeScript 类型契约同步。
- 涉及日历核心视图回归。

### 阶段 C：v1.38.x 数据安全与 AI 操作安全

执行顺序：

1. `docs/product-optimization-sync-data-safety.md`
2. `docs/product-optimization-ai-assistant-safety.md`

原因：

- 数据安全优先级高于继续扩展新功能。
- AI 批量操作能力增强前，必须先补动作预览、结果回报和撤销边界。
- 同步、导入、AI 都可能批量改变用户数据，应先建立快照和预览机制。

预期收益：

- replace 导入和远程覆盖前有本地快照。
- 同步失败可通过日志追踪。
- AI 多动作修改前有完整预览。
- 批量操作失败时用户能看到具体失败项。

主要风险：

- 快照恢复涉及本地数据库文件替换，需要严格确认流程。
- AI undo 不应承诺恢复删除任务，本阶段只支持 update/complete 类动作。

### 阶段 D：v1.39.0 执行闭环与全局效率入口

执行顺序：

1. `docs/product-optimization-template-goal-pomodoro.md`
2. `docs/product-optimization-navigation-command-palette.md`

原因：

- 模板、目标、番茄和时间追踪属于执行与复盘闭环，适合在基础数据语义稳定后进行。
- 命令面板和侧边栏显示设置属于全局效率入口，风险较低但影响面广，适合作为一个较完整的体验版本交付。

预期收益：

- 模板应用不再固定收件箱，可选择清单、日期、标签和变量。
- 番茄钟专注时间进入任务工时统计。
- OKR 可用 KR 量化进度。
- 用户可通过 Ctrl+K 快速跳转视图、搜索任务和执行常用命令。

主要风险：

- 番茄钟与时间追踪需要统一口径，避免重复计时。
- 命令面板需要保证键盘操作、输入框焦点和快捷键冲突处理。

## 4. 版本建议

| 版本 | 建议内容 | 版本类型 | 说明 |
|---|---|---|---|
| v1.37.1 | 日历任务视图与详情页全天编辑小范围修复 | patch | 只做现有 v1.37.x 主线缺陷修复 |
| v1.38.0 | 任务数据语义 + 日历规划过滤 + Agenda | minor | 引入基础字段和新日历能力 |
| v1.38.1 | 同步快照、导入预览、同步日志 | patch/minor 视实际范围决定 | 如果 schema 变更较多，可作为 minor |
| v1.38.2 | AI 批量动作预览、收件箱整理、撤销边界 | patch/minor 视实际范围决定 | 不应早于同步/快照能力 |
| v1.39.0 | 模板/目标/番茄/时间追踪闭环 + 命令面板 | minor | 偏产品体验升级 |

## 5. 执行约束

每次开始任一执行文档前，必须：

1. 执行 `git status --short --branch`。
2. 若存在未提交改动，先确认是否为当前任务相关改动；不允许混合无关修改。
3. 执行 `git pull --ff-only`。
4. 阅读本路线图和对应执行文档。
5. 明确本次只执行对应文档中的一个阶段或一个连续阶段集合。
6. 创建 TODO，并在实现过程中持续更新状态。
7. 完成后运行执行文档列出的验证命令。
8. 汇报改动摘要、涉及文件、测试结果、风险、建议版本号和下一步建议。

## 6. 当前建议下一步

最推荐的下一步是执行：

`docs/product-optimization-task-data-detail.md`

建议从其中的阶段 1 到阶段 3 开始，即：

1. 补齐 `completed_at/status/reminder_minutes` 数据库字段。
2. 更新 Rust task create/query/update/complete 命令。
3. 更新 TypeScript 类型和 taskStore。

该阶段完成后，再进入详情页全天编辑和看板 status 改造。

原因：这些字段是后续日历过滤、统计准确性、看板状态、AI 批量操作和报告生成的共同基础。
