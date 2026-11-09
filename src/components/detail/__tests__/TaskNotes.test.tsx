import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../../types'
import { TaskNotes, type TaskNotesHandle } from '../TaskNotes'

/**
 * 共享备注保存的任务归属与单飞并发回归。
 *
 * 复现路径均不依赖外部给 TaskNotes 加 key：
 * - 同一实例切换 task prop，旧请求完成后不得读取新任务草稿；
 * - 同一任务会话仅一个保存流程排空最新草稿，其他调用者等待同一结果；
 * - A→B→A 时仅比较 taskId 不足以隔离，需要任务会话代次。
 */

const localIso = '2026-11-05T09:00:00.000Z'

function makeTask(id: number, notes: string | null = null): Task {
  return {
    id,
    title: `任务 ${id}`,
    notes,
    priority: 0,
    due_date: localIso,
    end_date: '2026-11-05T10:00:00.000Z',
    all_day: false,
    reminder: null,
    completed: false,
    archived: false,
    pinned: false,
    list_id: 1,
    parent_id: null,
    repeat_rule: null,
    sort_order: id,
    created_at: localIso,
    updated_at: localIso,
    tag_ids: [],
    subtasks: [],
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

type NotesUpdate = (id: number, updates: Partial<Task>) => boolean | void | Promise<boolean | void>

function renderNotes(task: Task, onUpdate: NotesUpdate, onSaveError?: () => void) {
  const ref = createRef<TaskNotesHandle>()
  const view = render(<TaskNotes ref={ref} task={task} onUpdate={onUpdate} onSaveError={onSaveError} />)
  return { ref, ...view }
}

function notesTextarea() {
  return screen.getByPlaceholderText('添加备注... 支持 Markdown 语法')
}

beforeEach(() => {
  localStorage.setItem('taskNoteMode', 'edit')
})

describe('TaskNotes 任务归属与单飞保存', () => {
  it('同任务 blur 保存挂起 + flush 等待：新版本只写一次', async () => {
    const first = deferred<boolean>()
    const calls: Array<{ id: number; notes?: string }> = []
    const onUpdate = vi.fn((id: number, updates: Partial<Task>) => {
      calls.push({ id, notes: updates.notes as string | undefined })
      return calls.length === 1 ? first.promise : Promise.resolve(true)
    })
    const { ref } = renderNotes(makeTask(1), onUpdate)

    const textarea = notesTextarea()
    textarea.focus()
    fireEvent.change(textarea, { target: { value: 'A1' } })
    fireEvent.blur(textarea)
    await waitFor(() => expect(calls).toHaveLength(1))

    textarea.focus()
    fireEvent.change(textarea, { target: { value: 'A2' } })
    const waitingFlush = ref.current!.flush()

    await act(async () => {
      first.resolve(true)
    })
    await act(async () => {
      expect(await waitingFlush).toBe(true)
    })

    expect(calls.filter((call) => call.id === 1 && call.notes === 'A2')).toHaveLength(1)
    expect(calls.map((call) => call.notes)).toEqual(['A1', 'A2'])
  })

  it('真实 blur 后切换到新任务：旧等待流程不得把新任务备注写给旧任务', async () => {
    const first = deferred<boolean>()
    const second = deferred<boolean>()
    const calls: Array<{ id: number; notes?: string }> = []
    const onUpdate = vi.fn((id: number, updates: Partial<Task>) => {
      calls.push({ id, notes: updates.notes as string | undefined })
      if (calls.length === 1) return first.promise
      if (id === 2) return second.promise
      return Promise.resolve(true)
    })
    const taskA = makeTask(1)
    const taskB = makeTask(2)
    const { ref, rerender } = renderNotes(taskA, onUpdate)

    const textarea = notesTextarea()
    textarea.focus()
    fireEvent.change(textarea, { target: { value: 'A1' } })
    fireEvent.blur(textarea)
    await waitFor(() => expect(calls).toHaveLength(1))
    textarea.focus()
    fireEvent.change(textarea, { target: { value: 'A2' } })
    const oldWaitingFlush = ref.current!.flush()

    rerender(<TaskNotes ref={ref} task={taskB} onUpdate={onUpdate} />)
    const taskBTextarea = notesTextarea()
    taskBTextarea.focus()
    fireEvent.change(taskBTextarea, { target: { value: 'B1' } })
    const taskBFlush = ref.current!.flush()

    // 新任务保存不依赖旧任务在途请求：B1 在 A 请求完成前已经发出。
    await waitFor(() => expect(calls.some((call) => call.id === 2 && call.notes === 'B1')).toBe(true))

    // 乱序完成：先放行 B，再放行旧 A。
    await act(async () => {
      second.resolve(true)
    })
    await act(async () => {
      expect(await taskBFlush).toBe(true)
    })
    await act(async () => {
      first.resolve(true)
    })
    await act(async () => {
      await oldWaitingFlush
    })

    // 旧任务只收到自己的 A1；新任务 B1 从未写给旧任务。
    expect(calls.filter((call) => call.id === 1).map((call) => call.notes)).toEqual(['A1'])
    expect(calls.filter((call) => call.id === 2).map((call) => call.notes)).toEqual(['B1'])
    expect(ref.current!.hasDraft()).toBe(false)
  })

  it('A→B→A 会话隔离：旧请求失败不影响新会话，旧成功也不污染新基线', async () => {
    const first = deferred<boolean>()
    const calls: Array<{ id: number; notes?: string }> = []
    const onSaveError = vi.fn()
    const onUpdate = vi.fn((id: number, updates: Partial<Task>) => {
      calls.push({ id, notes: updates.notes as string | undefined })
      return calls.length === 1 ? first.promise : Promise.resolve(true)
    })
    const taskA = makeTask(1)
    const taskB = makeTask(2)
    const { ref, rerender } = renderNotes(taskA, onUpdate, onSaveError)

    const textarea = notesTextarea()
    textarea.focus()
    fireEvent.change(textarea, { target: { value: 'A1' } })
    fireEvent.blur(textarea)
    await waitFor(() => expect(calls).toHaveLength(1))
    textarea.focus()
    fireEvent.change(textarea, { target: { value: 'A2' } })
    const oldWaitingFlush = ref.current!.flush()

    rerender(<TaskNotes ref={ref} task={taskB} onUpdate={onUpdate} onSaveError={onSaveError} />)
    notesTextarea().focus()
    fireEvent.change(notesTextarea(), { target: { value: 'B1' } })
    expect(await ref.current!.flush()).toBe(true)

    // 切回同一个 taskId，但属于新的任务会话。
    rerender(<TaskNotes ref={ref} task={taskA} onUpdate={onUpdate} onSaveError={onSaveError} />)
    notesTextarea().focus()
    fireEvent.change(notesTextarea(), { target: { value: 'A3' } })
    expect(await ref.current!.flush()).toBe(true)

    await act(async () => {
      first.resolve(false)
    })
    await act(async () => {
      await oldWaitingFlush
    })

    // 旧 A1 失败发生在旧会话：不向新 A 会话报错、不污染 dirty/基线。
    expect(onSaveError).not.toHaveBeenCalled()
    expect(ref.current!.hasDraft()).toBe(false)
    expect(calls.filter((call) => call.id === 1 && call.notes === 'A3')).toHaveLength(1)
    expect(calls.filter((call) => call.id === 2 && call.notes === 'B1')).toHaveLength(1)
  })

  it('旧请求未完成时新任务独立保存，乱序完成后内容各归其主', async () => {
    const first = deferred<boolean>()
    const second = deferred<boolean>()
    const calls: Array<{ id: number; notes?: string }> = []
    const onUpdate = vi.fn((id: number, updates: Partial<Task>) => {
      calls.push({ id, notes: updates.notes as string | undefined })
      if (id === 1) return first.promise
      if (id === 2) return second.promise
      return Promise.resolve(true)
    })
    const taskA = makeTask(1, 'A 原备注')
    const taskB = makeTask(2, 'B 原备注')
    const { ref, rerender } = renderNotes(taskA, onUpdate)

    const textarea = notesTextarea()
    textarea.focus()
    fireEvent.change(textarea, { target: { value: 'A 新备注' } })
    const taskAFlush = ref.current!.flush()

    rerender(<TaskNotes ref={ref} task={taskB} onUpdate={onUpdate} />)
    notesTextarea().focus()
    fireEvent.change(notesTextarea(), { target: { value: 'B 新备注' } })
    const taskBFlush = ref.current!.flush()

    await waitFor(() => expect(calls.some((call) => call.id === 2 && call.notes === 'B 新备注')).toBe(true))

    // B 先完成，A 后完成：各自内容正确，且没有串写。
    await act(async () => {
      second.resolve(true)
    })
    await act(async () => {
      expect(await taskBFlush).toBe(true)
    })
    await act(async () => {
      first.resolve(true)
    })
    await act(async () => {
      expect(await taskAFlush).toBe(true)
    })

    expect(calls.filter((call) => call.id === 1).map((call) => call.notes)).toEqual(['A 新备注'])
    expect(calls.filter((call) => call.id === 2).map((call) => call.notes)).toEqual(['B 新备注'])
  })
})
