import { createRef } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// 任务列表挂载时会加载习惯数据：mock api 避免真实 IPC 调用
vi.mock('../../../api', () => ({
  habitApi: {
    getHabits: vi.fn().mockResolvedValue([]),
    getRecords: vi.fn().mockResolvedValue([]),
    upsertRecord: vi.fn().mockResolvedValue({ count: 1 }),
    deleteRecord: vi.fn().mockResolvedValue(true),
  },
}))

vi.mock('../../Toast', () => ({
  useToast: () => ({ info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() }),
}))

import { TaskListPanel } from '../TaskListPanel'
import type { TaskActions } from '../../../hooks/useTaskActions'

function makeActions() {
  return new Proxy(
    {},
    {
      get: () => vi.fn(),
    },
  ) as unknown as TaskActions
}

function renderPanel() {
  const newTaskInputRef = createRef<HTMLInputElement>()
  const searchInputRef = createRef<HTMLInputElement>()
  return render(
    <TaskListPanel
      newTaskInputRef={newTaskInputRef}
      searchInputRef={searchInputRef}
      actions={makeActions()}
      filteredTasks={[]}
      taskTree={[]}
      completedTaskTree={[]}
      incompleteTaskTree={[]}
      overdueTaskTree={[]}
      hasActiveFilters={false}
    />,
  )
}

/** 空白区右键菜单的挂载容器：面板主滚动区 */
function getScrollArea(container: HTMLElement): HTMLElement {
  const el = container.querySelector('.overflow-y-auto[class*="px-4"]') as HTMLElement | null
  if (!el) throw new Error('scroll area not found')
  return el
}

describe('TaskListPanel 空白区右键菜单', () => {
  it('右键空白区打开菜单，Escape 关闭', async () => {
    const { container } = renderPanel()
    // 等待挂载时的习惯数据异步加载落定
    await act(async () => {
      await Promise.resolve()
    })
    const area = getScrollArea(container)

    fireEvent.contextMenu(area, { clientX: 120, clientY: 160 })
    expect(screen.getByText('显示已完成')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText('显示已完成')).not.toBeInTheDocument()
  })

  it('贴近视口右下边缘时菜单收进视口内', async () => {
    const originalWidth = window.innerWidth
    const originalHeight = window.innerHeight
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 400 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 300 })
    try {
      const { container } = renderPanel()
      await act(async () => {
        await Promise.resolve()
      })
      const area = getScrollArea(container)

      fireEvent.contextMenu(area, { clientX: 395, clientY: 295 })
      const item = screen.getByText('显示已完成')
      const menu = item.parentElement as HTMLElement
      const left = Number.parseFloat(menu.style.left)
      const top = Number.parseFloat(menu.style.top)
      expect(left).toBeLessThanOrEqual(400 - 8)
      expect(top).toBeLessThanOrEqual(300 - 8)
      expect(left).toBeGreaterThanOrEqual(8)
      expect(top).toBeGreaterThanOrEqual(8)
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalHeight })
    }
  })
})
