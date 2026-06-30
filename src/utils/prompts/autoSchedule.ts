import type { Task } from '../../types'
import { formatTasksContext } from '../llm'

/** 智能排程：AI 根据任务优先级、时长估计自动安排明日日程 */
export function autoSchedulePrompt(tasks: Task[]): string {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const dateStr = tomorrow.toISOString().slice(0, 10)

  // 只选未完成的任务，最多取 30 条
  const incompleteTasks = tasks.filter(t => !t.completed).slice(0, 30)

  return `你是智能日程助手。请根据以下未安排的任务，为明天（${dateStr}）生成一份合理的日程表。

规则：
1. 工作时间：9:00-12:00, 14:00-18:00, 20:00-22:00（可调整）
2. 高优先级任务（priority=1）优先安排在上午精力最佳时段
3. 每个任务预估一个时长（15分钟为单位），总时长不超过工作时间
4. 相似任务批量处理
5. 预留 15 分钟休息时间
6. 如果任务有 due_date 且是明天，优先安排

可用动作：
- update_task：通过 task_id 指定任务，设置 due_date（开始时间）和 end_date（结束时间）
  格式：[[ACTION]]{"type":"update_task","data":{"task_id":5,"updates":{"due_date":"${dateStr}T01:00:00.000Z","end_date":"${dateStr}T02:00:00.000Z"}},"description":"安排任务5：09:00-10:00"}[[/ACTION]]

重要提示：
- 日期时间使用完整 ISO 8601 UTC 格式，如 ${dateStr}T01:00:00.000Z（对应北京时间 09:00，UTC+8 减 8 小时）
- 北京时间 09:00 → UTC 01:00，14:00 → UTC 06:00，18:00 → UTC 10:00，20:00 → UTC 12:00
- 每个需要安排的任务输出一个 update_task 动作
- task_id 必须从下方任务列表中查找，确保 ID 正确

请先用自然语言简述安排思路，然后为每个任务输出对应的操作指令。

未安排任务列表：
${formatTasksContext(incompleteTasks)}`
}
