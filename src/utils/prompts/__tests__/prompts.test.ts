import { describe, it, expect, vi } from 'vitest'

// prompt 模板通过 formatTasksContext 间接依赖 llm.ts，而 llm.ts 又引入
// @tauri-apps/api/core 的 invoke。这里统一 mock invoke，避免在 jsdom 中
// 加载真实的 Tauri 绑定。formatTasksContext 本身是纯函数，不会被 mock 影响。
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import {
  AI_SKILLS,
  ACTION_SYSTEM_PROMPT,
  parseActions,
} from '../index'
import type { ActionOp } from '../index'
import { todaySummary } from '../todaySummary'
import { weeklyReport } from '../weeklyReport'
import { smartSearch } from '../smartSearch'
import { autoTag } from '../autoTag'
import { timeEstimate } from '../timeEstimate'
import { conflictDetect } from '../conflictDetect'
import { smartSort } from '../smartSort'
import { taskTemplate } from '../taskTemplate'
import { taskBreakdown } from '../taskBreakdown'
import { prioritySuggest } from '../prioritySuggest'
import { autoSchedulePrompt } from '../autoSchedule'
import type { Task } from '../../../types'

// ----- 测试辅助 -----
function makeTask(overrides: Partial<Task> = {}): Task {
  const now = '2026-06-29T00:00:00.000Z'
  return {
    id: 1,
    title: '测试任务',
    notes: '',
    priority: 0,
    due_date: undefined,
    completed: false,
    archived: false,
    pinned: false,
    list_id: 1,
    sort_order: 0,
    created_at: now,
    updated_at: now,
    tag_ids: [],
    ...overrides,
  }
}

const sampleTasks: Task[] = [
  makeTask({ id: 1, title: '完成季度报告', priority: 1, completed: false }),
  makeTask({ id: 2, title: '回复客户邮件', priority: 2, completed: true }),
]

// ============================================================
// AI_SKILLS 结构
// ============================================================
describe('AI_SKILLS', () => {
  it('数组长度为 11', () => {
    expect(AI_SKILLS).toHaveLength(11)
  })

  it('每个 skill 都具有完整的结构字段（id/name/icon/description/buildPrompt）', () => {
    for (const skill of AI_SKILLS) {
      expect(typeof skill.id).toBe('string')
      expect(skill.id.length).toBeGreaterThan(0)
      expect(typeof skill.name).toBe('string')
      expect(skill.name.length).toBeGreaterThan(0)
      expect(typeof skill.icon).toBe('string')
      expect(typeof skill.description).toBe('string')
      expect(skill.description.length).toBeGreaterThan(0)
      expect(typeof skill.buildPrompt).toBe('function')
    }
  })

  it('每个 skill 的 id 唯一', () => {
    const ids = AI_SKILLS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('每个 skill 的 buildPrompt 调用后返回非空字符串', () => {
    for (const skill of AI_SKILLS) {
      const prompt = skill.buildPrompt(sampleTasks)
      expect(typeof prompt).toBe('string')
      expect(prompt.length).toBeGreaterThan(0)
    }
  })

  it('包含已知的技能 id', () => {
    const ids = AI_SKILLS.map((s) => s.id)
    expect(ids).toContain('today-summary')
    expect(ids).toContain('weekly-report')
    expect(ids).toContain('smart-search')
    expect(ids).toContain('priority-advice')
    expect(ids).toContain('auto-schedule')
  })
})

// ============================================================
// 各 prompt 模板函数返回非空字符串且包含关键内容
// ============================================================
describe('prompt 模板函数', () => {
  it('todaySummary 返回非空字符串且包含任务标题', () => {
    const prompt = todaySummary(sampleTasks)
    expect(prompt.length).toBeGreaterThan(0)
    expect(prompt).toContain('完成季度报告')
    expect(prompt).toContain('回复客户邮件')
  })

  it('todaySummary 包含"总结"相关指令', () => {
    const prompt = todaySummary([])
    expect(prompt).toContain('总结')
  })

  it('weeklyReport 返回非空字符串且包含任务标题', () => {
    const prompt = weeklyReport(sampleTasks)
    expect(prompt.length).toBeGreaterThan(0)
    expect(prompt).toContain('完成季度报告')
    expect(prompt).toContain('周报')
  })

  it('smartSearch 返回非空字符串且包含任务标题', () => {
    const prompt = smartSearch(sampleTasks)
    expect(prompt.length).toBeGreaterThan(0)
    expect(prompt).toContain('完成季度报告')
  })

  it('autoTag 返回非空字符串且包含任务标题', () => {
    const prompt = autoTag(sampleTasks)
    expect(prompt.length).toBeGreaterThan(0)
    expect(prompt).toContain('完成季度报告')
    expect(prompt).toContain('标签')
  })

  it('timeEstimate 返回非空字符串且包含任务标题', () => {
    const prompt = timeEstimate(sampleTasks)
    expect(prompt.length).toBeGreaterThan(0)
    expect(prompt).toContain('完成季度报告')
    expect(prompt).toContain('时间')
  })

  it('conflictDetect 返回非空字符串且包含任务标题', () => {
    const prompt = conflictDetect(sampleTasks)
    expect(prompt.length).toBeGreaterThan(0)
    expect(prompt).toContain('完成季度报告')
    expect(prompt).toContain('冲突')
  })

  it('smartSort 返回非空字符串且包含任务标题', () => {
    const prompt = smartSort(sampleTasks)
    expect(prompt.length).toBeGreaterThan(0)
    expect(prompt).toContain('完成季度报告')
    expect(prompt).toContain('排序')
  })

  it('prioritySuggest 返回非空字符串且包含任务标题', () => {
    const prompt = prioritySuggest(sampleTasks)
    expect(prompt.length).toBeGreaterThan(0)
    expect(prompt).toContain('完成季度报告')
    expect(prompt).toContain('优先级')
  })

  it('autoSchedulePrompt 返回非空字符串且包含任务标题和排程指令', () => {
    const prompt = autoSchedulePrompt(sampleTasks)
    expect(prompt.length).toBeGreaterThan(0)
    expect(prompt).toContain('完成季度报告')
    expect(prompt).toContain('update_task')
    expect(prompt).toContain('日程')
  })

  it('autoSchedulePrompt 只包含未完成任务', () => {
    const prompt = autoSchedulePrompt(sampleTasks)
    // 任务2 是已完成的，不应出现在排程列表中
    expect(prompt).toContain('完成季度报告')
    // 回复客户邮件是已完成任务，不应被排程
  })

  it('taskTemplate 返回非空字符串（无需任务参数）', () => {
    const prompt = taskTemplate()
    expect(prompt.length).toBeGreaterThan(0)
    expect(prompt).toContain('模板')
  })

  it('taskBreakdown 返回非空字符串（无需任务参数）', () => {
    const prompt = taskBreakdown()
    expect(prompt.length).toBeGreaterThan(0)
    expect(prompt).toContain('拆解')
  })

  it('空任务列表时各模板包含"（暂无任务）"', () => {
    // 这 8 个模板都通过 formatTasksContext 渲染任务，空列表应显示占位文本
    expect(todaySummary([])).toContain('（暂无任务）')
    expect(weeklyReport([])).toContain('（暂无任务）')
    expect(smartSearch([])).toContain('（暂无任务）')
    expect(autoTag([])).toContain('（暂无任务）')
    expect(timeEstimate([])).toContain('（暂无任务）')
    expect(conflictDetect([])).toContain('（暂无任务）')
    expect(smartSort([])).toContain('（暂无任务）')
    expect(prioritySuggest([])).toContain('（暂无任务）')
  })
})

// ============================================================
// parseActions
// ============================================================
describe('parseActions', () => {
  it('正常解析单个 action（对象格式）', () => {
    const text = '好的，我来帮你创建任务。\n[[ACTION]]{"type":"create_task","data":{"title":"买牛奶"},"description":"创建任务：买牛奶"}[[/ACTION]]\n请确认。'
    const { actions, cleanedText } = parseActions(text)
    expect(actions).toHaveLength(1)
    expect(actions[0].type).toBe('create_task')
    expect(actions[0].data.title).toBe('买牛奶')
    expect(actions[0].description).toBe('创建任务：买牛奶')
    // cleanedText 不再包含 action 标签
    expect(cleanedText).not.toContain('[[ACTION]]')
    expect(cleanedText).toContain('好的，我来帮你创建任务。')
    expect(cleanedText).toContain('请确认。')
  })

  it('正常解析数组格式 action', () => {
    const text = '[[ACTION]][{"type":"complete_task","data":{"task_id":1},"description":"完成任务1"},{"type":"delete_task","data":{"task_id":2},"description":"删除任务2"}][[/ACTION]]'
    const { actions } = parseActions(text)
    expect(actions).toHaveLength(2)
    expect(actions[0].type).toBe('complete_task')
    expect(actions[1].type).toBe('delete_task')
  })

  it('空文本返回空 actions 和空 cleanedText', () => {
    const { actions, cleanedText } = parseActions('')
    expect(actions).toHaveLength(0)
    expect(cleanedText).toBe('')
  })

  it('无 action 标签的纯文本原样返回（去除首尾空白）', () => {
    const text = '  这是一段普通文本，没有操作指令。  '
    const { actions, cleanedText } = parseActions(text)
    expect(actions).toHaveLength(0)
    expect(cleanedText).toBe('这是一段普通文本，没有操作指令。')
  })

  it('格式错误的 JSON 被忽略，不影响其他有效 action', () => {
    const text =
      '[[ACTION]]not-valid-json[[/ACTION]]' +
      '[[ACTION]]{"type":"create_task","data":{"title":"有效"},"description":"有效操作"}[[/ACTION]]'
    const { actions } = parseActions(text)
    expect(actions).toHaveLength(1)
    expect(actions[0].data.title).toBe('有效')
  })

  it('多个 action 标签全部解析', () => {
    const text =
      '[[ACTION]]{"type":"create_task","data":{"title":"任务A"},"description":"创建A"}[[/ACTION]]' +
      '中间文字' +
      '[[ACTION]]{"type":"complete_task","data":{"task_id":5},"description":"完成5"}[[/ACTION]]'
    const { actions, cleanedText } = parseActions(text)
    expect(actions).toHaveLength(2)
    expect(actions[0].data.title).toBe('任务A')
    expect(actions[1].type).toBe('complete_task')
    expect(cleanedText).toContain('中间文字')
    expect(cleanedText).not.toContain('[[ACTION]]')
  })

  it('连续 3 个以上换行被压缩为 2 个', () => {
    const text = '第一行\n\n\n\n\n第二行'
    const { cleanedText } = parseActions(text)
    expect(cleanedText).toBe('第一行\n\n第二行')
  })

  it('解析出的 ActionOp 满足类型结构', () => {
    const text = '[[ACTION]]{"type":"update_task","data":{"task_id":1,"updates":{"priority":2}},"description":"更新优先级"}[[/ACTION]]'
    const { actions } = parseActions(text)
    const op: ActionOp = actions[0]
    expect(op).toHaveProperty('type')
    expect(op).toHaveProperty('data')
    expect(op).toHaveProperty('description')
    expect(typeof op.type).toBe('string')
    expect(typeof op.data).toBe('object')
    expect(typeof op.description).toBe('string')
  })
})

// ============================================================
// ACTION_SYSTEM_PROMPT
// ============================================================
describe('ACTION_SYSTEM_PROMPT', () => {
  it('是非空字符串', () => {
    expect(typeof ACTION_SYSTEM_PROMPT).toBe('string')
    expect(ACTION_SYSTEM_PROMPT.length).toBeGreaterThan(0)
  })

  it('包含操作指令格式说明', () => {
    expect(ACTION_SYSTEM_PROMPT).toContain('[[ACTION]]')
    expect(ACTION_SYSTEM_PROMPT).toContain('[[/ACTION]]')
  })

  it('包含支持的操作类型说明', () => {
    expect(ACTION_SYSTEM_PROMPT).toContain('create_task')
    expect(ACTION_SYSTEM_PROMPT).toContain('update_task')
    expect(ACTION_SYSTEM_PROMPT).toContain('delete_task')
    expect(ACTION_SYSTEM_PROMPT).toContain('complete_task')
    expect(ACTION_SYSTEM_PROMPT).toContain('create_subtask')
  })
})
