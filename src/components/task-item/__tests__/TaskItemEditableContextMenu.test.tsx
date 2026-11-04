import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { List, Tag, Task } from '../../../types'
import { TaskActionProvider, type TaskActionContextValue } from '../../../contexts/TaskActionContext'
import { TaskItem } from '../TaskItem'

/**
 * 任务行编辑区右键回归：input 内右键保留系统文本菜单（复制/粘贴），
 * 不再被业务菜单拦截；行内普通区域右键仍打开业务菜单。
 */

const tags: Tag[] = [{ id: 1, name: '工作', color: '#3B82F6', created_at: '2026-07-01T00:00:00.000Z' }]

const lists: List[] = [
  {
    id: 1,
    name: '收件箱',
    color: '#3B82F6',
    is_default: true,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
  },
]

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: '普通任务',
    priority: 0,
    completed: false,
    list_id: 1,
    parent_id: null,
    sort_order: 0,
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-20T00:00:00.000Z',
    subtasks: [],
    tag_ids: [],
    ...overrides,
  }
}

function makeContext(overrides: Partial<TaskActionContextValue> = {}): TaskActionContextValue {
  return {
    tags,
    lists,
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
    ...overrides,
  }
}

function renderTask(task: Task, context = makeContext()) {
  return render(
    <TaskActionProvider value={context}>
      <TaskItem task={task} isSelected={false} isExpanded={false} subtaskInput="" />
    </TaskActionProvider>,
  )
}

describe('TaskItem 编辑区右键', () => {
  it('内联编辑输入框右键不打开业务菜单（保留系统文本菜单，defaultPrevented=false）', () => {
    renderTask(makeTask())
    fireEvent.doubleClick(screen.getByTestId('task-open-1'))
    const input = screen.getByDisplayValue('普通任务')
    expect(input).toBeInTheDocument()

    let prevented = false
    act(() => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })
      input.dispatchEvent(event)
      prevented = event.defaultPrevented
    })
    expect(prevented).toBe(false)
    expect(screen.queryByTestId('task-context-menu')).not.toBeInTheDocument()
  })

  it('任务行普通区域右键仍打开业务菜单', () => {
    renderTask(makeTask())
    fireEvent.contextMenu(screen.getByTestId('task-open-1'))
    expect(screen.getByTestId('task-context-menu')).toBeInTheDocument()
  })
})
