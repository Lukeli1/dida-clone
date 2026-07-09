# AI 助手操作安全、排程预览与收件箱整理优化可执行操作文档

> 适用阶段：v1.38.x AI 安全与效率增强  
> 执行方式：按模块分阶段顺序开发。每个阶段完成后先完成本阶段验证，再进入下一阶段。  
> 范围：AI 批量动作预览、执行结果、收件箱整理、上下文透明度、撤销记录。

## 1. 项目现状总结

AI 助手核心在 `src/components/ai/AIAssistant.tsx`，结构化动作解析在 `src/components/ai/ActionParser.ts`，排程预览在 `src/components/ai/SchedulePreviewDialog.tsx`，技能和 prompt 在 `src/utils/llm.ts` 与 `src/utils/prompts/*`。

| 编号 | 问题描述 | 影响范围 | 复现路径 |
|---|---|---|---|
| A-01 | 普通多动作 AI 回复只挂载第一个 `pendingAction`，非排程批量修改缺少完整预览。 | AI 批量修改任务 | 让 AI 同时修改多个任务的优先级或日期。 |
| A-02 | 排程动作逐个执行，失败时可能部分成功，结果展示不够结构化。 | AI 排程 | AI 排程 5 个任务，其中 1 个更新失败。 |
| A-03 | 缺少“收件箱整理”专用技能，无法集中处理无日期、无标签、低信息密度任务。 | 收件箱清理、任务补全 | 收件箱堆积任务后，只能用普通对话手动描述。 |
| A-04 | 发送 AI 消息前没有明确说明本次会发送哪些任务上下文字段。 | 隐私透明度、用户信任 | 在 AI 助手中输入任意问题，界面无上下文范围说明。 |
| A-05 | AI 批量操作执行后没有撤销入口。 | 批量操作安全 | 应用 AI 批量排程后想恢复原日期。 |

## 2. 优化方案

| 编号 | 优先级 | 优化策略 | 优化目标 | 预期效果 |
|---|---|---|---|---|
| A-01 | P0 | 新增通用 `ActionPreviewDialog`，支持多动作分组预览。 | 所有 AI 动作确认前可审阅。 | 降低误操作概率。 |
| A-02 | P1 | 批量动作执行结果结构化，逐项记录成功/失败。 | 明确哪些任务被改。 | 部分失败时用户可定位问题。 |
| A-03 | P1 | 新增“收件箱整理”技能和 prompt。 | 自动为候选任务建议日期、标签、优先级。 | 收件箱清理效率提升。 |
| A-04 | P2 | 增加“上下文范围”说明弹窗。 | 公开发送给模型的数据范围。 | 用户对隐私边界更清楚。 |
| A-05 | P2 | 新增 AI undo store，仅支持 update/complete 类动作撤销。 | 给批量修改提供一次恢复机会。 | 批量操作安全感提升。 |

## 3. 执行步骤

### 阶段 0：开发前置检查

```bash
git status --short --branch
git pull --ff-only
```

如果工作区有未提交改动或快进失败，停止执行。

### 阶段 1：通用 ActionPreviewDialog

新增文件：`src/components/ai/ActionPreviewDialog.tsx`

修改文件：`src/components/ai/AIAssistant.tsx`

输入：`actions: ActionOp[]`、`tasks: Task[]`、`onConfirm`、`onCancel`。

UI 要求：

1. 按动作类型分组显示创建、修改、删除、完成、创建子任务。
2. 每项显示任务标题、修改前字段、修改后字段。
3. 删除动作使用 danger 样式。
4. `actions.length > 1` 时必须打开批量预览，不得只取 `actions[0]`。

### 阶段 2：结构化执行结果

修改文件：

- `src/components/ai/AIAssistant.tsx`
- `src/components/ai/ActionParser.ts`

新增类型：

```ts
interface ActionExecutionResult {
  action: ActionOp
  success: boolean
  message: string
}
```

批量执行完成后追加一条助手消息，格式必须包含：成功数量、失败数量、失败任务 ID、失败原因。

### 阶段 3：收件箱整理技能

新增文件：`src/utils/prompts/inboxTriage.ts`

修改文件：

- `src/utils/prompts/index.ts`
- `src/utils/llm.ts`
- `src/components/ai/SkillSelector.tsx`

候选任务规则：默认清单、未完成、未归档，且满足无 `due_date`、无 `tag_ids` 或 `priority` 为 0/2 任一条件。

输出动作限制：只能输出 `update_task` 建议；新增标签必须作为建议文本展示，不能直接创建标签。

### 阶段 4：上下文范围说明

修改文件：`src/components/ai/AIAssistant.tsx`

操作：在输入区或 header 增加“上下文范围”按钮。

弹窗内容必须列明：

- 发送任务标题
- 发送备注摘要
- 发送截止日期
- 发送优先级
- 发送标签
- 不发送附件文件内容
- 不发送本地文件内容
- API Key 不进入上下文

### 阶段 5：AI 撤销记录

新增文件：`src/stores/aiUndoStore.ts`

记录结构：

```ts
interface AIUndoRecord {
  id: string
  createdAt: string
  actions: ActionOp[]
  inverseUpdates: Array<{ taskId: number; updates: Partial<Task> }>
}
```

限制：仅支持 `update_task` 和 `complete_task` 撤销；删除任务撤销暂不支持，预览中必须标注“删除后不可通过 AI 撤销恢复”。保存最近 5 条撤销记录。

## 4. 代码修改规则

| 改动 | 文件完整路径 | 修改前 | 修改后 |
|---|---|---|---|
| 多动作预览 | `src/components/ai/AIAssistant.tsx` | 只使用 `actions[0]` | 多动作进入 ActionPreviewDialog |
| 新预览组件 | `src/components/ai/ActionPreviewDialog.tsx` | 不存在 | 新增批量动作确认 UI |
| 执行结果 | `src/components/ai/ActionParser.ts` | 主要返回字符串 | 增加结构化执行结果辅助能力 |
| 收件箱技能 | `src/utils/prompts/inboxTriage.ts` | 不存在 | 新增 prompt |
| 技能注册 | `src/utils/llm.ts` | 无 inbox triage | 新增 AI_SKILLS 项 |
| 撤销 store | `src/stores/aiUndoStore.ts` | 不存在 | 新增最近 5 条撤销记录 |

禁止事项：禁止让 AI 绕过用户确认执行删除；禁止把 secret/API key 注入上下文；禁止发送附件文件内容；禁止执行系统命令或文件读写。

## 5. 验证标准

### 必跑命令

```bash
npm run typecheck
npm test
npm run lint
npm run test:e2e -- tests/ai-assistant.spec.ts
```

### 目标测试文件

- 新增 `src/components/ai/__tests__/ActionPreviewDialog.test.tsx`
- 新增或更新 `src/components/ai/__tests__/ActionParser.test.ts`
- 更新 `src/utils/prompts/__tests__/prompts.test.ts`
- 更新 `src/stores/__tests__/aiStore.test.ts`

### 可量化验收项

| 验收项 | 标准 |
|---|---|
| 多动作回复 | `actions.length = 3` 时打开批量预览 |
| 删除动作 | 确认前不调用删除 API，预览中显示 danger 样式 |
| 部分失败 | 3 成功 1 失败时结果消息包含 `成功 3 项，失败 1 项` |
| 收件箱整理 | prompt 候选任务只包含默认清单、未完成、未归档任务 |
| 上下文说明 | 弹窗明确写明不发送附件内容和 API Key |
| 撤销 | 对 2 个 update_task 执行撤销后字段恢复到执行前值 |
