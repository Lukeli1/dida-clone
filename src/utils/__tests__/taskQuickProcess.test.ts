import { describe, expect, it } from 'vitest'
import {
  isEditableQuickProcessTarget,
  isTaskQuickProcessView,
  reconcileQuickProcessTaskId,
  resolveQuickProcessInitialTaskId,
  resolveQuickProcessNextTaskId,
} from '../taskQuickProcess'

describe('taskQuickProcess 视图与选择规则', () => {
  it('仅普通任务列表与今日任务支持快速处理', () => {
    expect(isTaskQuickProcessView('tasks')).toBe(true)
    expect(isTaskQuickProcessView('today')).toBe(true)
    for (const view of ['archived', 'trash', 'settings', 'calendar', 'stats', 'ai', 'quadrant']) {
      expect(isTaskQuickProcessView(view)).toBe(false)
    }
  })

  it('优先选中当前可处理任务，否则选第一个', () => {
    const tasks = [{ id: 1 }, { id: 2 }, { id: 3 }]
    expect(resolveQuickProcessInitialTaskId(tasks, 2)).toBe(2)
    expect(resolveQuickProcessInitialTaskId(tasks, 99)).toBe(1)
    expect(resolveQuickProcessInitialTaskId(tasks, null)).toBe(1)
    expect(resolveQuickProcessInitialTaskId([], 2)).toBeNull()
  })

  it('执行后选择下一个，末尾没有下一个时返回 null', () => {
    const tasks = [{ id: 1 }, { id: 2 }, { id: 3 }]
    expect(resolveQuickProcessNextTaskId(tasks, 1)).toBe(2)
    expect(resolveQuickProcessNextTaskId(tasks, 3)).toBeNull()
    expect(resolveQuickProcessNextTaskId(tasks, 99)).toBeNull()
  })

  it('当前任务离开集合后按原位置选择下一个仍可见任务，末尾回退到最后一个', () => {
    const remaining = [{ id: 1 }, { id: 3 }]
    expect(reconcileQuickProcessTaskId(remaining, 2, 1)).toBe(3)
    expect(reconcileQuickProcessTaskId(remaining, 2, 5)).toBe(3)
    expect(reconcileQuickProcessTaskId([{ id: 1 }], 2, 3)).toBe(1)
    expect(reconcileQuickProcessTaskId([], 2, 0)).toBeNull()
    expect(reconcileQuickProcessTaskId(remaining, 3, 0)).toBe(3)
  })

  it('识别 input / textarea / select / button / contenteditable 等焦点，避免误拦截方向键', () => {
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const select = document.createElement('select')
    const button = document.createElement('button')
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    const nested = document.createElement('span')
    editable.appendChild(nested)
    const plain = document.createElement('div')

    for (const el of [input, textarea, select, button, editable, nested]) {
      expect(isEditableQuickProcessTarget(el)).toBe(true)
    }
    expect(isEditableQuickProcessTarget(plain)).toBe(false)
    expect(isEditableQuickProcessTarget(document.body)).toBe(false)
    expect(isEditableQuickProcessTarget(null)).toBe(false)
  })
})
