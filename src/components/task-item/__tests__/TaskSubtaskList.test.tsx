import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskSubtaskList } from '../TaskSubtaskList'
import { TaskActionProvider, type TaskActionContextValue } from '../../../contexts/TaskActionContext'
import { useUIStore } from '../../../stores/uiStore'
import type { Task } from '../../../types'

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = '2026-07-01T00:00:00.000Z'
  return {
    id: 5,
    title: '父',
    notes: null,
    priority: 0,
    due_date: null,
    end_date: null,
    all_day: false,
    reminder: null,
    completed: false,
    completed_at: null,
    status: 'todo',
    archived: false,
    pinned: false,
    list_id: 1,
    parent_id: null,
    repeat_rule: null,
    sort_order: 1,
    created_at: now,
    updated_at: now,
    tag_ids: [],
    subtasks: [],
    ...overrides,
  }
}

function makeCtx(): TaskActionContextValue {
  return {
    tags: [],
    lists: [],
    batchMode: false,
    isArchivedView: false,
    onToggle: vi.fn(),
    onToggleSubtask: vi.fn(),
    onClick: vi.fn(),
    onReorder: vi.fn(),
    onDelete: vi.fn(),
    onArchive: vi.fn(),
    onUnarchive: vi.fn(),
    onSetDate: vi.fn(),
    onSetPriority: vi.fn(),
    onSetRepeatRule: vi.fn(),
    onSetReminder: vi.fn(),
    onTogglePin: vi.fn(),
    onToggleTag: vi.fn(),
    onDuplicate: vi.fn(),
    onCreateNewTag: vi.fn(),
    onInlineEdit: vi.fn(),
    onDragStartGlobal: vi.fn(),
    onDragEndGlobal: vi.fn(),
    onCreateSubtask: vi.fn(),
    onToggleExpand: vi.fn(),
    onToggleSelect: vi.fn(),
    onSubtaskInputChange: vi.fn(),
  }
}

describe('TaskSubtaskList focus', () => {
  beforeEach(() => {
    useUIStore.setState({
      expandedTasks: new Set<number>([5]),
      subtaskInputFocusRequest: 5,
      subtaskInputs: {},
    })
  })

  it('收到 focus request 时自动聚焦添加子任务输入框并清理请求', async () => {
    const ctx = makeCtx()
    render(
      <TaskActionProvider value={ctx}>
        <TaskSubtaskList task={makeTask({ id: 5, subtasks: [] })} isSelected={false} subtaskInput="" />
      </TaskActionProvider>,
    )
    const input = screen.getByTestId('subtask-input-5')
    expect(input).toBeInTheDocument()
    await waitFor(() => {
      expect(document.activeElement).toBe(input)
    })
    expect(useUIStore.getState().subtaskInputFocusRequest).toBeNull()
    expect(ctx.onCreateSubtask).not.toHaveBeenCalled()
  })

  it('子任务行右键会调用 onSubtaskContextMenu 且不创建空任务', () => {
    const ctx = makeCtx()
    const onSubtaskContextMenu = vi.fn()
    const child = makeTask({ id: 51, title: '子A', parent_id: 5 })
    render(
      <TaskActionProvider value={ctx}>
        <TaskSubtaskList
          task={makeTask({ id: 5, subtasks: [child] })}
          isSelected={false}
          subtaskInput=""
          onSubtaskContextMenu={onSubtaskContextMenu}
        />
      </TaskActionProvider>,
    )
    const row = screen.getByTestId('subtask-row-51')
    fireEvent.contextMenu(row)
    expect(onSubtaskContextMenu).toHaveBeenCalledTimes(1)
    const [passedTask, evt] = onSubtaskContextMenu.mock.calls[0]
    expect(passedTask.id).toBe(51)
    expect(passedTask.parent_id).toBe(5)
    expect(evt.defaultPrevented).toBe(true)
    expect(ctx.onCreateSubtask).not.toHaveBeenCalled()
  })
})
