# 滴答清单复刻 Phase 8 规划记录

**日期**：2026-06-30
**当前版本**：v1.28.0（UI/UX 全面优化已完成）
**目标版本**：v1.29.0

## 当前状态扫描

### 版本历程
- v1.28.0：UI/UX 全面优化（颜色变量、ConfirmDialog、动画体系、SVG 图标）
- v1.27.0：Phase 7 Bug 修复 + 架构收尾
- v1.26.0：Phase 6 Git 数据同步 + Rust 文件收尾
- v1.25.0 ~ v1.21.1：Phase 1-5 各阶段优化

### 编译状态
- tsc --noEmit：✅ 通过（有环境变量干扰噪音，但实际通过）
- cargo check：✅ 通过（13.48s）
- 测试用例：190 个

### 待优化点
**7 个超 300 行 .tsx 文件**：
1. CalendarView.tsx - 435 行
2. TaskContextMenu.tsx - 429 行
3. HabitCard.tsx - 387 行
4. DayView.tsx - 383 行
5. AppearancePanel.tsx - 338 行
6. SystemPanel.tsx - 322 行
7. HabitView.tsx - 309 行

**api.ts 387 行**：需按模块拆分

## Phase 8 任务规划

### 方向 A：代码拆分（7 个任务）
- P8-01：拆 CalendarView.tsx（435→<250）
- P8-02：拆 TaskContextMenu.tsx（429→<250）
- P8-03：拆 HabitCard.tsx（387→<250）
- P8-04：拆 DayView.tsx（383→<250）
- P8-05：拆 AppearancePanel + SystemPanel（660→<400）
- P8-06：拆 HabitView.tsx（309→<200）
- P8-07：拆 api.ts（387→<200）

### 方向 B：功能增强（2 个任务）
- P8-08：快捷键帮助面板（按 ? 弹出）
- P8-09：任务详情 Markdown 预览/编辑切换

### 执行批次
| 批次 | 任务 | 模型 | 工时 |
|---|---|---|---|
| 1 | P8-01 + P8-04 | GLM 5.2 | 3.5h |
| 2 | P8-02 + P8-03 + P8-06 | Flash | 4h |
| 3 | P8-05 + P8-07 | Flash | 3h |
| 4 | P8-08 + P8-09 | Flash | 2h |
| 合计 | 9 个任务 | | ~12.5h |

## 关键决策
- 用户工作流不变：我出文档，workbuddy 执行，我验收
- 优先做代码拆分（结构性重构），功能增强放最后
- 验收标准：所有 .tsx < 300 行，190 个测试全过

## 产出文件
- 优化文档：`C:\Users\50441\.qclaw\workspace\dida_clone_phase8_20260630.md`
