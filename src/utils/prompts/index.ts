import type { Task } from '../../types'
import { todaySummary } from './todaySummary'
import { weeklyReport } from './weeklyReport'
import { smartSearch } from './smartSearch'
import { autoTag } from './autoTag'
import { timeEstimate } from './timeEstimate'
import { conflictDetect } from './conflictDetect'
import { smartSort } from './smartSort'
import { taskTemplate } from './taskTemplate'
import { taskBreakdown } from './taskBreakdown'
import { prioritySuggest } from './prioritySuggest'

/** AI 技能定义 */
export interface AISkill {
  id: string
  name: string
  icon: string
  description: string
  buildPrompt: (tasks: Task[]) => string
}

/** 预设 AI 技能列表 */
export const AI_SKILLS: AISkill[] = [
  { id: 'today-summary', name: '今日总结', icon: '📊', description: '生成今日工作总结', buildPrompt: todaySummary },
  { id: 'weekly-report', name: '周报生成', icon: '📅', description: '生成本周工作周报', buildPrompt: weeklyReport },
  { id: 'smart-search', name: '智能搜索', icon: '🔍', description: '用自然语言搜索任务', buildPrompt: smartSearch },
  { id: 'auto-tag', name: '自动标签', icon: '🏷️', description: '为任务推荐标签分类', buildPrompt: autoTag },
  { id: 'time-estimate', name: '时间估算', icon: '⏰', description: '估算任务耗时并建议提醒', buildPrompt: timeEstimate },
  { id: 'conflict-detect', name: '冲突检测', icon: '⚖️', description: '检测任务时间冲突', buildPrompt: conflictDetect },
  { id: 'smart-sort', name: '智能排序', icon: '📋', description: '按重要紧急矩阵排序', buildPrompt: smartSort },
  { id: 'task-template', name: '任务模板', icon: '🎯', description: '生成任务模板（会议/出差等）', buildPrompt: taskTemplate },
  { id: 'breakdown', name: '任务拆解', icon: '🧩', description: '拆解复杂任务为子任务', buildPrompt: taskBreakdown },
  { id: 'priority-advice', name: '优先级建议', icon: '💡', description: '建议任务优先级', buildPrompt: prioritySuggest },
]

export { parseActions, ACTION_SYSTEM_PROMPT } from './actionProtocol'
export type { ActionType, ActionOp } from './actionProtocol'
