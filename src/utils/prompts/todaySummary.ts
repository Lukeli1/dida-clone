import type { Task } from '../../types'
import { formatTasksContext } from '../llm'

/** 今日总结 */
export function todaySummary(tasks: Task[]): string {
  return `请根据以下今日任务列表，生成一份简洁的工作总结，包括完成情况、未完成事项、明日建议。用中文回复，不超过 300 字。

当前日期：${new Date().toLocaleDateString('zh-CN')}
任务列表：
${formatTasksContext(tasks)}`
}
