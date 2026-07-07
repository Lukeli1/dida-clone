import { describe, it, expect } from 'vitest'
import type { Task } from '../../types'
import { getChildTasks, getSearchMatchSource, matchTaskBySearch } from '../taskSearch'

// ----- 测试辅助：构造平铺任务（与后端 get_tasks 返回结构一致：子任务通过 parent_id 关联）-----
function makeTask(overrides: Partial<Task> = {}): Task {
  const now = new Date('2026-01-01T00:00:00.000Z').toISOString()
  return {
    id: 1,
    title: '测试任务',
    notes: '',
    priority: 2,
    due_date: undefined,
    end_date: undefined,
    reminder: undefined,
    completed: false,
    archived: false,
    pinned: false,
    list_id: 1,
    parent_id: undefined,
    repeat_rule: undefined,
    sort_order: 0,
    created_at: now,
    updated_at: now,
    tag_ids: [],
    subtasks: [],
    ...overrides,
  }
}

describe('matchTaskBySearch', () => {
  // 1. 标题命中
  it('搜索"会议"能命中标题含"会议"的任务', () => {
    const task = makeTask({ id: 1, title: '项目会议' })
    expect(matchTaskBySearch(task, '会议', [task])).toBe(true)
  })

  // 2. 备注命中
  it('搜索"会议"能命中备注含"会议"的任务', () => {
    const task = makeTask({ id: 1, title: '日常', notes: '整理会议纪要' })
    expect(matchTaskBySearch(task, '会议', [task])).toBe(true)
  })

  // 3. 子任务标题命中（父任务自身标题/备注不含搜索词）
  it('搜索"会议"能命中子任务标题含"会议"的任务', () => {
    const parent = makeTask({ id: 1, title: '日常工作' })
    const child = makeTask({ id: 2, title: '准备会议材料', parent_id: 1 })
    const all = [parent, child]
    // 父任务标题/备注本身不含"会议"
    expect(parent.title.includes('会议')).toBe(false)
    expect(parent.notes?.includes('会议')).toBeFalsy()
    // 但因子任务标题命中，父任务应被命中
    expect(matchTaskBySearch(parent, '会议', all)).toBe(true)
    // 子任务本身也命中
    expect(matchTaskBySearch(child, '会议', all)).toBe(true)
  })

  // 4. 空搜索返回所有任务（视为不过滤）
  it('空搜索词返回 true（视为不过滤）', () => {
    const task = makeTask({ id: 1, title: '任意内容' })
    expect(matchTaskBySearch(task, '', [task])).toBe(true)
    expect(matchTaskBySearch(task, '   ', [task])).toBe(true)
    expect(matchTaskBySearch(task, '\t', [task])).toBe(true)
  })

  // 5. 大小写不敏感
  it('大小写不敏感：搜索"MEETING"能命中标题含"meeting"的任务', () => {
    const task = makeTask({ id: 1, title: 'team meeting' })
    expect(matchTaskBySearch(task, 'MEETING', [task])).toBe(true)
  })

  it('大小写不敏感：搜索"meeting"能命中备注含"Meeting"的任务', () => {
    const task = makeTask({ id: 1, title: 'x', notes: 'Meeting Notes' })
    expect(matchTaskBySearch(task, 'meeting', [task])).toBe(true)
  })

  it('大小写不敏感：搜索"MEETING"能命中子任务标题含"meeting"的任务', () => {
    const parent = makeTask({ id: 1, title: '日常' })
    const child = makeTask({ id: 2, title: 'weekly meeting', parent_id: 1 })
    expect(matchTaskBySearch(parent, 'MEETING', [parent, child])).toBe(true)
  })

  // 6. 不命中
  it('标题/备注/子任务均不含搜索词时返回 false', () => {
    const parent = makeTask({ id: 1, title: '日常' })
    const child = makeTask({ id: 2, title: '其他', parent_id: 1 })
    expect(matchTaskBySearch(parent, '不存在的词', [parent, child])).toBe(false)
  })

  // 7. 仅匹配直接子任务，孙级不参与
  it('仅匹配直接子任务标题，孙级任务不参与父任务命中判断', () => {
    const parent = makeTask({ id: 1, title: '日常' })
    const child = makeTask({ id: 2, title: '子任务', parent_id: 1 })
    const grandchild = makeTask({ id: 3, title: '孙级会议', parent_id: 2 })
    const all = [parent, child, grandchild]
    // 父任务的直接子任务是 id=2（标题"子任务"，不含"会议"），孙级不参与
    expect(matchTaskBySearch(parent, '会议', all)).toBe(false)
    // 孙级自身命中（按自身标题）
    expect(matchTaskBySearch(grandchild, '会议', all)).toBe(true)
  })
})

describe('getSearchMatchSource', () => {
  it('标题命中返回 "title"（默认不显示标签）', () => {
    const task = makeTask({ id: 1, title: '项目会议', notes: '也含会议' })
    expect(getSearchMatchSource(task, '会议', [])).toBe('title')
  })

  it('仅备注命中返回 "notes"', () => {
    const task = makeTask({ id: 1, title: '日常', notes: '会议纪要' })
    expect(getSearchMatchSource(task, '会议', [])).toBe('notes')
  })

  it('仅子任务标题命中返回 "subtask"', () => {
    const parent = makeTask({ id: 1, title: '日常' })
    const child = makeTask({ id: 2, title: '会议材料', parent_id: 1 })
    expect(getSearchMatchSource(parent, '会议', [child])).toBe('subtask')
  })

  it('优先级：标题 > 备注 > 子任务', () => {
    const parent = makeTask({ id: 1, title: '会议', notes: '会议' })
    const child = makeTask({ id: 2, title: '会议', parent_id: 1 })
    // 三者都命中，应返回最高优先级 'title'
    expect(getSearchMatchSource(parent, '会议', [child])).toBe('title')
  })

  it('备注与子任务同时命中时，优先返回 "notes"（备注优先级高于子任务）', () => {
    const parent = makeTask({ id: 1, title: '日常', notes: '会议' })
    const child = makeTask({ id: 2, title: '会议', parent_id: 1 })
    expect(getSearchMatchSource(parent, '会议', [child])).toBe('notes')
  })

  it('空搜索词返回 null', () => {
    const task = makeTask({ id: 1, title: '会议' })
    expect(getSearchMatchSource(task, '', [])).toBeNull()
  })

  it('未命中返回 null', () => {
    const task = makeTask({ id: 1, title: '日常', notes: '其他' })
    expect(getSearchMatchSource(task, '会议', [])).toBeNull()
  })
})

describe('getChildTasks', () => {
  it('返回 parent_id === task.id 的直接子任务', () => {
    const parent = makeTask({ id: 1, title: '父' })
    const child1 = makeTask({ id: 2, title: '子1', parent_id: 1 })
    const child2 = makeTask({ id: 3, title: '子2', parent_id: 1 })
    const other = makeTask({ id: 4, title: '其他', parent_id: 99 })
    const all = [parent, child1, child2, other]
    expect(getChildTasks(parent, all).map((t) => t.id)).toEqual([2, 3])
  })

  it('没有子任务时返回空数组', () => {
    const parent = makeTask({ id: 1, title: '父' })
    expect(getChildTasks(parent, [parent])).toEqual([])
  })
})
