import { describe, it, expect } from 'vitest'
import {
  PRIORITY_STYLES,
  getPriorityStyle,
  hexWithAlpha,
  hexToRgba,
  getTaskColor,
} from '../priority'
import type { Task, List } from '../../types'

/** 构造一个最小可用 Task，默认 priority=0、list_id=1 */
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: '示例任务',
    completed: false,
    priority: 0,
    list_id: 1,
    sort_order: 0,
    created_at: '2026-06-15T00:00:00.000Z',
    updated_at: '2026-06-15T00:00:00.000Z',
    ...overrides,
  }
}

function makeList(overrides: Partial<List> = {}): List {
  return {
    id: 1,
    name: '收件箱',
    color: undefined,
    is_default: true,
    created_at: '2026-06-15T00:00:00.000Z',
    updated_at: '2026-06-15T00:00:00.000Z',
    ...overrides,
  }
}

describe('priority 样式映射', () => {
  it('PRIORITY_STYLES 包含 0/1/2/3 四个等级', () => {
    expect(PRIORITY_STYLES[1]).toBeDefined()
    expect(PRIORITY_STYLES[2]).toBeDefined()
    expect(PRIORITY_STYLES[3]).toBeDefined()
    expect(PRIORITY_STYLES[0]).toBeDefined()
  })

  it('getPriorityStyle(1) 返回高优先级样式（红色、label=高）', () => {
    const style = getPriorityStyle(1)
    expect(style.hex).toBe('#ea4335')
    expect(style.label).toBe('高')
    expect(style.bg).toContain('var(--color-priority-high)')
  })

  it('getPriorityStyle(2) 返回中优先级样式（琥珀色、label=中）', () => {
    const style = getPriorityStyle(2)
    expect(style.hex).toBe('#f9ab00')
    expect(style.label).toBe('中')
  })

  it('getPriorityStyle(3) 返回低优先级样式（蓝色、label=低）', () => {
    const style = getPriorityStyle(3)
    expect(style.hex).toBe('#4f86f7')
    expect(style.label).toBe('低')
  })

  it('getPriorityStyle(0) 返回无优先级样式（灰色、label=无）', () => {
    const style = getPriorityStyle(0)
    expect(style.hex).toBe('#9aa0a6')
    expect(style.label).toBe('无')
  })

  it('getPriorityStyle 对未知优先级回退到 0（无）', () => {
    const style = getPriorityStyle(999)
    expect(style).toEqual(PRIORITY_STYLES[0])
    expect(style.hex).toBe('#9aa0a6')
  })
})

describe('hexWithAlpha', () => {
  it('alpha=1 时追加 ff', () => {
    expect(hexWithAlpha('#ea4335', 1)).toBe('#ea4335ff')
  })

  it('alpha=0 时追加 00', () => {
    expect(hexWithAlpha('#ea4335', 0)).toBe('#ea433500')
  })

  it('alpha=0.5 时追加 80（128 的十六进制）', () => {
    expect(hexWithAlpha('#ea4335', 0.5)).toBe('#ea433580')
  })
})

describe('hexToRgba', () => {
  it('将 #ea4335 转为 rgba(234, 67, 53, 1)', () => {
    expect(hexToRgba('#ea4335', 1)).toBe('rgba(234, 67, 53, 1)')
  })

  it('将 #4f86f7 带 0.5 透明度转换', () => {
    expect(hexToRgba('#4f86f7', 0.5)).toBe('rgba(79, 134, 247, 0.5)')
  })

  it('将 #9aa0a6 转换为对应 rgba', () => {
    expect(hexToRgba('#9aa0a6', 1)).toBe('rgba(154, 160, 166, 1)')
  })
})

describe('getTaskColor', () => {
  it('任务所属清单有颜色时，优先返回清单颜色', () => {
    const task = makeTask({ list_id: 2, priority: 1 })
    const lists = [makeList({ id: 1 }), makeList({ id: 2, color: '#ABCDEF' })]
    expect(getTaskColor(task, lists)).toBe('#ABCDEF')
  })

  it('无清单色时，priority=1 回退到高优先级红 #ea4335', () => {
    const task = makeTask({ priority: 1 })
    expect(getTaskColor(task, [])).toBe('#ea4335')
  })

  it('无清单色时，priority=2 回退到中优先级琥珀 #f9ab00', () => {
    const task = makeTask({ priority: 2 })
    expect(getTaskColor(task)).toBe('#f9ab00')
  })

  it('无清单色时，priority=3 回退到低优先级蓝 #4f86f7', () => {
    const task = makeTask({ priority: 3 })
    expect(getTaskColor(task)).toBe('#4f86f7')
  })

  it('priority=0 且无清单色时回退到灰色 #9aa0a6', () => {
    const task = makeTask({ priority: 0 })
    expect(getTaskColor(task)).toBe('#9aa0a6')
  })

  it('清单存在但 color 为空时，回退到优先级色', () => {
    const task = makeTask({ list_id: 1, priority: 1 })
    const lists = [makeList({ id: 1, color: undefined })]
    expect(getTaskColor(task, lists)).toBe('#ea4335')
  })
})
