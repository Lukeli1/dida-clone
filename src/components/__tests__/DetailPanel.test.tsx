import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Task } from '../../types'
import type { TaskActions } from '../../hooks/useTaskActions'

vi.mock('../detail/TaskDetail', () => ({
  TaskDetail: ({ task }: { task: Task }) => (
    <div data-testid="task-detail-snapshot">
      {task.title}:{task.subtasks?.map((subtask) => subtask.title).join(',')}
    </div>
  ),
}))

vi.mock('../../hooks/useWindowSize', () => ({
  useWindowSize: () => ({ isNarrow: false }),
}))

import { DetailPanel } from '../DetailPanel'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: '父任务',
    priority: 0,
    completed: false,
    list_id: 1,
    parent_id: null,
    sort_order: 0,
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-20T00:00:00.000Z',
    subtasks: [],
    ...overrides,
  }
}

describe('DetailPanel', () => {
  it('面板保持打开时立即渲染最新任务数据', async () => {
    const task = makeTask()
    const actions = {} as TaskActions
    const { rerender } = render(<DetailPanel task={task} actions={actions} />)

    expect(await screen.findByTestId('task-detail-snapshot')).toHaveTextContent('父任务:')

    const updatedTask = makeTask({
      subtasks: [makeTask({ id: 2, title: '新子任务', parent_id: 1 })],
    })
    rerender(<DetailPanel task={updatedTask} actions={actions} />)

    expect(screen.getByTestId('task-detail-snapshot')).toHaveTextContent('父任务:新子任务')
  })
})
