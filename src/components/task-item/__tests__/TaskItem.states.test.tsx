import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { List, Tag, Task } from '../../../types'
import { TaskActionProvider, type TaskActionContextValue } from '../../../contexts/TaskActionContext'
import { useUIStore } from '../../../stores/uiStore'
import { TaskItem } from '../TaskItem'

const tags: Tag[] = [
  { id: 1, name: '工作', color: '#3B82F6', created_at: '2026-07-01T00:00:00.000Z' },
  { id: 2, name: '重要', color: '#EF4444', created_at: '2026-07-01T00:00:00.000Z' },
  { id: 3, name: '本周', color: '#10B981', created_at: '2026-07-01T00:00:00.000Z' },
  { id: 4, name: '客户', color: '#F59E0B', created_at: '2026-07-01T00:00:00.000Z' },
  { id: 5, name: '跟进', color: '#8B5CF6', created_at: '2026-07-01T00:00:00.000Z' },
]

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

function renderTask(task: Task, context = makeContext(), props: { isSelected?: boolean } = {}) {
  return render(
    <TaskActionProvider value={context}>
      <TaskItem
        task={task}
        isSelected={props.isSelected ?? false}
        isExpanded={false}
        subtaskInput=""
        animateOnMount={false}
      />
    </TaskActionProvider>,
  )
}

describe('TaskItem 关键行状态', () => {
  beforeEach(() => {
    useUIStore.setState({ searchQuery: '' })
  })

  it('长标题 + 多标签 + 逾期：标题两行收口、标签收口、日期可读', () => {
    const longTitle = '完成季度复盘并同步所有客户跟进事项，整理成可执行的后续计划'
    const overdue = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    renderTask(
      makeTask({
        title: longTitle,
        due_date: overdue,
        tag_ids: [1, 2, 3, 4, 5],
      }),
    )

    const title = screen.getByText(longTitle)
    expect(title).toHaveClass('line-clamp-2')
    expect(title).toHaveClass('min-w-0')

    expect(screen.getByText('工作')).toBeInTheDocument()
    expect(screen.getByText('重要')).toBeInTheDocument()
    expect(screen.getByText('本周')).toBeInTheDocument()
    expect(screen.queryByText('客户')).not.toBeInTheDocument()
    expect(screen.getByText('+2')).toHaveAttribute('title', '另有标签：客户、跟进')
    expect(screen.getByText(/延期\d+天/)).toBeInTheDocument()
  })

  it('任务主内容是无嵌套控件的语义按钮，行内控件分别独立工作', async () => {
    const onClick = vi.fn()
    const onToggle = vi.fn()
    const onToggleExpand = vi.fn()
    const task = makeTask({ title: '需要操作的任务' })
    renderTask(task, makeContext({ onClick, onToggle, onToggleExpand }))

    const openTask = screen.getByRole('button', { name: '打开任务：需要操作的任务' })
    expect(openTask.tagName).toBe('BUTTON')
    expect(openTask.querySelector('button, input, select, textarea, a')).toBeNull()

    fireEvent.click(openTask)
    expect(onClick).toHaveBeenCalledWith(1)
    expect(onToggle).not.toHaveBeenCalled()

    fireEvent.click(screen.getByLabelText('标记为已完成：需要操作的任务'))
    expect(onToggle).toHaveBeenCalledWith(task)

    fireEvent.click(screen.getByTestId('task-expand-1'))
    expect(onToggleExpand).toHaveBeenCalledWith(1)

    const action = screen.getByTestId('task-actions-1')
    expect(action).toHaveAttribute('aria-label', '任务操作：需要操作的任务')
    expect(action).toHaveClass('opacity-0')
    expect(action).toHaveClass('group-hover:opacity-100')
    expect(action).toHaveClass('group-focus-within:opacity-100')
    fireEvent.click(action)
    expect(await screen.findByTestId('task-context-menu')).toBeInTheDocument()
  })

  it('完成状态用按钮可访问名称、删除线和透明度共同表达', () => {
    const onClick = vi.fn()
    const completedTask = makeTask({ title: '已完成任务', completed: true })
    renderTask(completedTask, makeContext({ onClick }))

    const openTask = screen.getByRole('button', { name: '打开任务：已完成任务（已完成）' })
    fireEvent.click(openTask)
    expect(onClick).toHaveBeenCalledWith(1)

    expect(screen.getByText('已完成任务')).toHaveClass('line-through')
    expect(screen.getByTestId('task-row-1')).toHaveClass('opacity-60')
    expect(screen.getByLabelText('标记为未完成：已完成任务')).toBeInTheDocument()
  })

  it('选中与置顶使用语义变量，不残留固定橙色背景', () => {
    const { rerender } = renderTask(makeTask({ title: '选中任务' }), makeContext(), { isSelected: true })
    expect(screen.getByTestId('task-row-1')).toHaveClass('bg-[var(--color-accent-soft)]')

    rerender(
      <TaskActionProvider value={makeContext()}>
        <TaskItem
          task={makeTask({ title: '置顶任务', pinned: true })}
          isSelected={false}
          isExpanded={false}
          subtaskInput=""
          animateOnMount={false}
        />
      </TaskActionProvider>,
    )
    const pinnedRow = screen.getByTestId('task-row-1')
    expect(pinnedRow).toHaveClass('bg-[var(--color-warning-light)]/40')
    expect(pinnedRow.className).not.toContain('bg-orange-50')
  })
})
