import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Task } from '../../../types'
import { SchedulePanel } from '../TaskMetaPanel'

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = '2026-07-03T09:00:00.000Z'
  return {
    id: 1,
    title: '测试任务',
    notes: null,
    priority: 0,
    due_date: '2026-07-03T09:00:00.000Z',
    end_date: null,
    all_day: false,
    reminder: null,
    completed: false,
    archived: false,
    pinned: false,
    list_id: 1,
    parent_id: null,
    repeat_rule: null,
    sort_order: 0,
    created_at: now,
    updated_at: now,
    tag_ids: [],
    subtasks: [],
    ...overrides,
  }
}

function renderSchedulePanel(task: Task, onUpdate = vi.fn()) {
  return {
    onUpdate,
    ...render(<SchedulePanel task={task} onUpdate={onUpdate} />),
  }
}

/** 展开日程编辑面板 */
function expandScheduleEdit() {
  const btn = screen.getByRole('button', { name: /月|设置日期/ })
  fireEvent.click(btn)
}

describe('SchedulePanel 全天编辑闭环', () => {
  it('全天任务初始化时全天开关为开启状态', () => {
    const task = makeTask({
      all_day: true,
      due_date: new Date(2026, 6, 3).toISOString(),
      end_date: new Date(2026, 6, 4).toISOString(),
    })
    renderSchedulePanel(task)
    expandScheduleEdit()

    const toggle = screen.getByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('非全天任务初始化时全天开关为关闭状态', () => {
    const task = makeTask({ all_day: false })
    renderSchedulePanel(task)
    expandScheduleEdit()

    const toggle = screen.getByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('全天任务修改提醒后保存仍保持 all_day: true', () => {
    const onUpdate = vi.fn()
    const task = makeTask({
      all_day: true,
      due_date: new Date(2026, 6, 3).toISOString(),
      end_date: new Date(2026, 6, 4).toISOString(),
      reminder: null,
    })
    renderSchedulePanel(task, onUpdate)
    expandScheduleEdit()

    // 全天模式下找到提醒时间输入框（datetime-local）
    const reminderInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement
    expect(reminderInput).toBeTruthy()
    fireEvent.change(reminderInput, { target: { value: '2026-07-03T08:30' } })
    fireEvent.blur(reminderInput)

    const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1]
    expect(lastCall[0]).toBe(1)
    expect(lastCall[1].all_day).toBe(true)
    expect(lastCall[1].due_date).toBeTruthy()
    expect(lastCall[1].end_date).toBeTruthy()
  })

  it('非全天任务保存时不传 end_date，避免清空已有结束时间', () => {
    const onUpdate = vi.fn()
    const task = makeTask({
      all_day: false,
      due_date: '2026-07-03T09:00:00.000Z',
      end_date: '2026-07-03T10:00:00.000Z',
    })
    renderSchedulePanel(task, onUpdate)
    expandScheduleEdit()

    // 非全天模式下找到截止时间输入框
    const dueInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement
    expect(dueInput).toBeTruthy()
    fireEvent.change(dueInput, { target: { value: '2026-07-03T14:00' } })
    fireEvent.blur(dueInput)

    const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1]
    expect(lastCall[1].all_day).toBe(false)
    expect(lastCall[1].due_date).toBeTruthy()
    expect(lastCall[1].end_date).toBeUndefined()
  })

  it('切换全天开关时发送 all_day: true 和正确的日期', () => {
    const onUpdate = vi.fn()
    const task = makeTask({
      all_day: false,
      due_date: '2026-07-03T09:00:00.000Z',
    })
    renderSchedulePanel(task, onUpdate)
    expandScheduleEdit()

    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)

    const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1]
    expect(lastCall[1].all_day).toBe(true)
    expect(lastCall[1].due_date).toBeTruthy()
    expect(lastCall[1].end_date).toBeTruthy()
    // 验证 due_date 是本地午夜
    const dueDate = new Date(lastCall[1].due_date)
    expect(dueDate.getHours()).toBe(0)
    expect(dueDate.getMinutes()).toBe(0)
  })

  it('切换全天开关从全天到非全天时发送 all_day: false', () => {
    const onUpdate = vi.fn()
    const task = makeTask({
      all_day: true,
      due_date: new Date(2026, 6, 3).toISOString(),
      end_date: new Date(2026, 6, 4).toISOString(),
    })
    renderSchedulePanel(task, onUpdate)
    expandScheduleEdit()

    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)

    const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1]
    expect(lastCall[1].all_day).toBe(false)
    expect(lastCall[1].due_date).toBeTruthy()
    expect(lastCall[1].end_date).toBeUndefined()
  })

  it('全天模式保存时 due_date 为本地 00:00，end_date 为下一天 00:00', () => {
    const onUpdate = vi.fn()
    const task = makeTask({
      all_day: true,
      due_date: new Date(2026, 6, 3).toISOString(),
      end_date: new Date(2026, 6, 4).toISOString(),
    })
    renderSchedulePanel(task, onUpdate)
    expandScheduleEdit()

    // 全天模式下找到开始日期输入框（type=date）
    const dateInputs = document.querySelectorAll('input[type="date"]')
    const startDateInput = dateInputs[0] as HTMLInputElement
    expect(startDateInput).toBeTruthy()
    fireEvent.change(startDateInput, { target: { value: '2026-07-05' } })
    fireEvent.blur(startDateInput)

    const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1]
    expect(lastCall[1].all_day).toBe(true)

    const due = new Date(lastCall[1].due_date)
    expect(due.getFullYear()).toBe(2026)
    expect(due.getMonth()).toBe(6) // July
    expect(due.getDate()).toBe(5)
    expect(due.getHours()).toBe(0)
    expect(due.getMinutes()).toBe(0)

    const end = new Date(lastCall[1].end_date)
    expect(end.getFullYear()).toBe(2026)
    expect(end.getMonth()).toBe(6)
    expect(end.getDate()).toBe(6)
    expect(end.getHours()).toBe(0)
    expect(end.getMinutes()).toBe(0)
  })

  it('全天跨天任务保留合理跨度', () => {
    const onUpdate = vi.fn()
    const task = makeTask({
      all_day: true,
      due_date: new Date(2026, 6, 3).toISOString(),
      end_date: new Date(2026, 6, 6).toISOString(), // 3天跨度
    })
    renderSchedulePanel(task, onUpdate)
    expandScheduleEdit()

    const dateInputs = document.querySelectorAll('input[type="date"]')
    const startDateInput = dateInputs[0] as HTMLInputElement
    fireEvent.change(startDateInput, { target: { value: '2026-07-10' } })
    fireEvent.blur(startDateInput)

    const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1]
    const due = new Date(lastCall[1].due_date)
    const end = new Date(lastCall[1].end_date)

    // 跨度应保持 3 天
    expect(due.getDate()).toBe(10)
    expect(end.getDate()).toBe(13)
  })

  it('全天跨天任务清空结束日期后保存为单天任务', () => {
    const onUpdate = vi.fn()
    const task = makeTask({
      all_day: true,
      due_date: new Date(2026, 6, 3).toISOString(),
      end_date: new Date(2026, 6, 6).toISOString(), // 3天跨度
    })
    renderSchedulePanel(task, onUpdate)
    expandScheduleEdit()

    const dateInputs = document.querySelectorAll('input[type="date"]')
    // 结束日期是第二个 date input
    const endDateInput = dateInputs[1] as HTMLInputElement
    expect(endDateInput).toBeTruthy()

    // 清空结束日期
    fireEvent.change(endDateInput, { target: { value: '' } })
    fireEvent.blur(endDateInput)

    const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1]
    expect(lastCall[1].all_day).toBe(true)

    const due = new Date(lastCall[1].due_date)
    const end = new Date(lastCall[1].end_date)

    // 清空结束日期后应为单天：end_date = due_date + 1 天
    expect(due.getDate()).toBe(3)
    expect(end.getDate()).toBe(4) // due + 1 天 = 下一天 00:00
  })

  it('全天模式清空开始日期时同步清空 due_date 和 end_date', () => {
    const onUpdate = vi.fn()
    const task = makeTask({
      all_day: true,
      due_date: new Date(2026, 6, 3).toISOString(),
      end_date: new Date(2026, 6, 4).toISOString(),
      reminder: null,
    })
    renderSchedulePanel(task, onUpdate)
    expandScheduleEdit()

    const dateInputs = document.querySelectorAll('input[type="date"]')
    const startDateInput = dateInputs[0] as HTMLInputElement
    expect(startDateInput).toBeTruthy()

    // 清空开始日期
    fireEvent.change(startDateInput, { target: { value: '' } })
    fireEvent.blur(startDateInput)

    const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1]
    expect(lastCall[1].all_day).toBe(true)
    // due_date 和 end_date 都应为 null
    expect(lastCall[1].due_date).toBeNull()
    expect(lastCall[1].end_date).toBeNull()
  })
})
